//! ロック画面とリカバリーキーでの復旧

use slint::ComponentHandle;
use zeroize::Zeroizing;

use crate::ctx::{self, shared};
use crate::store::keys;
use crate::{AppWindow, Auth};

pub fn setup(app: &AppWindow) {
    let auth = app.global::<Auth>();

    auth.on_unlock(ctx::handler(app, unlock));
    auth.on_recover(ctx::handler(app, recover));
    let weak = app.as_weak();
    auth.on_logout_requested(move || {
        if let Some(app) = weak.upgrade() {
            super::open_confirm(
                &app,
                "logout-lock",
                "ログアウト",
                "設定とローカルキャッシュを削除し、初期設定から再開します。この操作は取り消せません。よろしいですか？",
                "ログアウト",
                true,
            );
        }
    });
}

pub fn set_error(app: &AppWindow, message: &str) {
    app.global::<Auth>().set_error(message.into());
}

pub fn reset(app: &AppWindow) {
    let auth = app.global::<Auth>();
    auth.set_password("".into());
    auth.set_recovery_key("".into());
    auth.set_new_password("".into());
    auth.set_confirm_password("".into());
    auth.set_error("".into());
    auth.set_loading(false);
}

/// 暗号化された S3 設定を復号してセッションに保持する。
/// 旧形式（パスワード由来の鍵で直接暗号化したもの）なら現行形式で暗号化し直す
fn restore_s3_config(password: &str) -> Result<(), String> {
    let Some(encrypted) = shared().store.get::<String>(keys::S3_CONFIG) else {
        return Ok(());
    };
    let config = Zeroizing::new(
        shared()
            .vault
            .api_decrypt_config(password.to_string(), encrypted.clone())?,
    );
    shared().set_s3_config(Some(config.clone()));
    if vault_core::api::api_config_needs_upgrade(encrypted) {
        let upgraded = shared()
            .vault
            .api_encrypt_config(password.to_string(), config.to_string())?;
        shared().store.set(keys::S3_CONFIG, &upgraded)?;
    }
    Ok(())
}

/// アンロック後の画面に移り、S3 設定を復号できていれば同期する
fn enter_unlocked(app: &AppWindow, config_error: Option<String>) {
    reset(app);
    super::enter_unlocked(app);
    match config_error {
        Some(e) => ctx::push_error(
            app,
            format!("S3 設定を復号できなかったため、同期を停止しています。同期するには、ログアウトして設定し直してください: {e}"),
            None,
        ),
        None => ctx::sync_in_background(app),
    }
}

fn unlock(app: &AppWindow) {
    let auth = app.global::<Auth>();
    if auth.get_loading() {
        // 処理中の Enter 連打で二重に呼ぶと、vault-core 側でセッションが破棄されてしまう
        return;
    }
    let password = Zeroizing::new(auth.get_password().to_string());
    if password.is_empty() {
        auth.set_error("パスワードを入力してください".into());
        return;
    }
    auth.set_loading(true);
    ctx::run_blocking(
        move || {
            shared().vault.api_unlock(password.to_string())?;
            // 復号できなくても vault はアンロック済みなので、同期なしで続ける
            // （DEK のローテーション中に終了し、S3 設定と vault の DEK が食い違った場合など）
            Ok::<_, String>(restore_s3_config(&password).err())
        },
        |app, result| {
            let auth = app.global::<Auth>();
            auth.set_loading(false);
            match result {
                Ok(config_error) => enter_unlocked(&app, config_error),
                Err(e) => auth.set_error(format!("ロック解除失敗: {e}").into()),
            }
        },
    );
}

fn recover(app: &AppWindow) {
    let auth = app.global::<Auth>();
    if auth.get_loading() {
        // 処理中の Enter 連打で二重に呼ぶと、vault-core 側でセッションが破棄されてしまう
        return;
    }
    let recovery_key = Zeroizing::new(auth.get_recovery_key().to_string());
    let new_password = Zeroizing::new(auth.get_new_password().to_string());
    let confirm = auth.get_confirm_password();
    if recovery_key.is_empty() || new_password.is_empty() || confirm.is_empty() {
        auth.set_error("すべてのフィールドを入力してください".into());
        return;
    }
    if new_password.as_str() != confirm.as_str() {
        auth.set_error("パスワードが一致しません".into());
        return;
    }
    auth.set_loading(true);
    ctx::run_blocking(
        move || {
            shared()
                .vault
                .api_unlock_with_recovery_key(recovery_key.to_string())?;
            let reset_result = shared()
                .vault
                .api_reset_master_password_with_recovery_key(
                    recovery_key.to_string(),
                    new_password.to_string(),
                )
                .and_then(|()| ctx::save_local());
            if let Err(e) = reset_result {
                // 再設定できていないのにアンロックしたままにすると、次のロックで締め出されたと
                // 気付くことになる。ロックし直して、再設定の失敗として扱う
                let _ = shared().vault.api_lock();
                return Err(e);
            }
            // S3 設定は DEK 由来の鍵で暗号化しているので、新しいパスワードでも復号できる
            Ok::<_, String>(restore_s3_config(&new_password).err())
        },
        |app, result| {
            let auth = app.global::<Auth>();
            auth.set_loading(false);
            match result {
                // 再設定したスロットは更新時刻が新しいので、同期でリモートの古いスロットに負けない
                Ok(config_error) => enter_unlocked(&app, config_error),
                Err(e) => auth.set_error(format!("復旧失敗: {e}").into()),
            }
        },
    );
}
