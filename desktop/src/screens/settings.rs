//! 設定画面（一般設定・セキュリティ操作・設定の転送）

use std::cell::RefCell;

use serde::Deserialize;
use slint::ComponentHandle;
use zeroize::Zeroizing;

use crate::ctx::{self, shared};
use crate::store::{keys, AppSettings};
use crate::{qr, vault, AppWindow, Settings};

const AUTOLOCK_MINUTES: [u64; 8] = [0, 1, 3, 5, 10, 15, 30, 60];
const CLIPBOARD_SECONDS: [u64; 4] = [0, 30, 60, 120];

thread_local! {
    /// 再認証後に行う操作（"transfer"）
    static REAUTH_NEXT: RefCell<Option<String>> = const { RefCell::new(None) };
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StorageInfo {
    #[serde(default)]
    bucket: String,
    #[serde(default)]
    region: String,
    #[serde(default)]
    key: String,
    #[serde(default)]
    endpoint: Option<String>,
}

fn index_of(options: &[u64], value: u64) -> i32 {
    options.iter().position(|v| *v == value).unwrap_or(0) as i32
}

pub fn setup(app: &AppWindow) {
    let settings = app.global::<Settings>();
    let weak = app.as_weak();
    settings.on_settings_changed(move || {
        let Some(app) = weak.upgrade() else { return };
        let settings = app.global::<Settings>();
        let updated = AppSettings {
            autolock_minutes: AUTOLOCK_MINUTES
                .get(settings.get_autolock_index() as usize)
                .copied()
                .unwrap_or(5),
            clipboard_clear_seconds: CLIPBOARD_SECONDS
                .get(settings.get_clipboard_index() as usize)
                .copied()
                .unwrap_or(30),
        };
        if let Err(e) = shared().store.update_app_settings(updated) {
            ctx::push_error(&app, format!("設定の保存に失敗しました: {e}"), None);
        }
    });

    settings.on_close_dialog(ctx::handler(app, close_dialog));
    settings.on_change_password(ctx::handler(app, change_password));
    settings.on_rotate_dek(ctx::handler(app, rotate_dek));
    settings.on_regenerate_recovery(ctx::handler(app, regenerate_recovery));
    let weak = app.as_weak();
    settings.on_reauth_requested(move |next| {
        if let Some(app) = weak.upgrade() {
            REAUTH_NEXT.with_borrow_mut(|n| *n = Some(next.to_string()));
            open_dialog(&app, "reauth");
        }
    });
    settings.on_reauth_submit(ctx::handler(app, reauth_submit));
    settings.on_generate_transfer(ctx::handler(app, generate_transfer));
}

pub fn enter(app: &AppWindow) {
    let settings = app.global::<Settings>();
    let current = shared().store.app_settings();
    settings.set_autolock_index(index_of(&AUTOLOCK_MINUTES, current.autolock_minutes));
    settings.set_clipboard_index(index_of(
        &CLIPBOARD_SECONDS,
        current.clipboard_clear_seconds,
    ));
    let info = shared()
        .s3_config()
        .and_then(|json| serde_json::from_str::<StorageInfo>(&json).ok());
    settings.set_has_storage(info.is_some());
    let info = info.unwrap_or_default();
    settings.set_bucket(info.bucket.into());
    settings.set_region(info.region.into());
    settings.set_key(info.key.into());
    settings.set_endpoint(info.endpoint.unwrap_or_default().into());
    close_dialog(app);
}

pub fn clear(app: &AppWindow) {
    close_dialog(app);
}

fn open_dialog(app: &AppWindow, dialog: &str) {
    let settings = app.global::<Settings>();
    clear_dialog_fields(app);
    settings.set_dialog(dialog.into());
}

fn clear_dialog_fields(app: &AppWindow) {
    let settings = app.global::<Settings>();
    settings.set_pw_old("".into());
    settings.set_pw_new("".into());
    settings.set_pw_confirm("".into());
    settings.set_dialog_error("".into());
    settings.set_dialog_loading(false);
    settings.set_transfer_code("".into());
    settings.set_transfer_qr(Default::default());
}

fn close_dialog(app: &AppWindow) {
    let settings = app.global::<Settings>();
    clear_dialog_fields(app);
    settings.set_new_recovery_key("".into());
    settings.set_dialog("".into());
}

fn show_recovery_key_with_warning(
    app: &AppWindow,
    (recovery_key, warning): (String, Option<String>),
) {
    let settings = app.global::<Settings>();
    clear_dialog_fields(app);
    settings.set_new_recovery_key(recovery_key.into());
    settings.set_dialog("recovery-key".into());
    show_push_warning(app, warning);
}

/// 再暗号化の前に同期して、リモートの変更を取り込み ETag を最新にしておく。
/// 再暗号化後の上書きアップロードはマージできないので、ここで 412 になる余地を減らす
fn sync_before_reencrypt() -> Result<(), String> {
    shared().rt.block_on(ctx::sync_if_configured()).map(|_| ())
}

/// 再暗号化後の vault を保存し、S3 設定があれば上書きアップロードする。
/// 再暗号化はローカル保存の時点で確定しているので、アップロードの失敗は Err にせず警告文で返す
/// （Err にすると、新しいリカバリーキーを表示できないまま古いキーだけが無効になる）
fn save_and_push() -> Result<Option<String>, String> {
    ctx::save_local()?;
    Ok(push_warning())
}

fn push_warning() -> Option<String> {
    push_if_configured()
        .err()
        .map(|e| format!("変更はこの端末に保存しましたが、S3 への反映に失敗しました: {e}"))
}

fn show_push_warning(app: &AppWindow, warning: Option<String>) {
    if let Some(warning) = warning {
        ctx::push_error(app, warning, Some("reencrypt-push"));
    }
}

fn push_if_configured() -> Result<(), String> {
    if let Some(config) = shared().s3_config() {
        let ts = shared().rt.block_on(vault::push(&config))?;
        shared().store.set(keys::LAST_SYNC_TIME, &ts)?;
    }
    Ok(())
}

fn finish_dialog_task<T>(
    app: &AppWindow,
    result: Result<T, String>,
    fallback: &str,
    on_ok: impl FnOnce(&AppWindow, T),
) {
    let settings = app.global::<Settings>();
    settings.set_dialog_loading(false);
    match result {
        Ok(value) => {
            ctx::refresh_sync_header(app);
            on_ok(app, value);
        }
        Err(e) if e.is_empty() => settings.set_dialog_error(fallback.into()),
        Err(e) => settings.set_dialog_error(e.into()),
    }
}

fn change_password(app: &AppWindow) {
    let settings = app.global::<Settings>();
    let old = Zeroizing::new(settings.get_pw_old().to_string());
    let new = Zeroizing::new(settings.get_pw_new().to_string());
    let confirm = settings.get_pw_confirm();
    settings.set_dialog_error("".into());
    if old.is_empty() || new.is_empty() || confirm.is_empty() {
        settings.set_dialog_error("すべてのフィールドを入力してください".into());
        return;
    }
    if new.as_str() != confirm.as_str() {
        settings.set_dialog_error("新しいパスワードが一致しません".into());
        return;
    }
    if new == old {
        settings.set_dialog_error("新しいパスワードは現在のものと異なる必要があります".into());
        return;
    }
    settings.set_dialog_loading(true);
    ctx::run_blocking(
        move || {
            // オフラインでもパスワード変更はできる（後の同期で meta のスロットごとにマージされる）
            let _ = sync_before_reencrypt();
            // S3 設定は DEK 由来の鍵で暗号化しているので、パスワード変更では暗号化し直さなくてよい
            shared()
                .vault
                .api_change_master_password(old.to_string(), new.to_string())?;
            save_and_push()
        },
        |app, result| {
            finish_dialog_task(
                &app,
                result,
                "パスワード変更に失敗しました",
                |app, warning| {
                    close_dialog(app);
                    show_push_warning(app, warning);
                },
            )
        },
    );
}

fn rotate_dek(app: &AppWindow) {
    let settings = app.global::<Settings>();
    let password = Zeroizing::new(settings.get_pw_old().to_string());
    settings.set_dialog_error("".into());
    if password.is_empty() {
        settings.set_dialog_error("パスワードを入力してください".into());
        return;
    }
    settings.set_dialog_loading(true);
    ctx::run_blocking(
        move || {
            // S3 上の vault が古い DEK のまま残ると以降の同期でマージできなくなるので、
            // 同期できない状態では DEK を更新しない
            sync_before_reencrypt()
                .map_err(|e| format!("S3 と同期できないため、DEK を更新しませんでした: {e}"))?;
            let recovery_key = shared().vault.api_rotate_dek(password.to_string())?;
            // 新しい DEK の vault を先に保存する。S3 設定の保存より前に終了しても、
            // vault は新しいリカバリーキーで開ける状態になる（S3 設定は Lock 画面で復号に失敗するだけ）
            ctx::save_local()?;
            // S3 設定は DEK 由来の鍵で暗号化しているので、新しい DEK で暗号化し直す
            if let Some(config) = shared().s3_config() {
                let encrypted = shared()
                    .vault
                    .api_encrypt_config(password.to_string(), config.to_string())?;
                shared().store.set(keys::S3_CONFIG, &encrypted)?;
            }
            Ok((recovery_key, push_warning()))
        },
        |app, result| {
            finish_dialog_task(
                &app,
                result,
                "DEK更新に失敗しました",
                show_recovery_key_with_warning,
            )
        },
    );
}

fn regenerate_recovery(app: &AppWindow) {
    let settings = app.global::<Settings>();
    let password = Zeroizing::new(settings.get_pw_old().to_string());
    settings.set_dialog_error("".into());
    if password.is_empty() {
        settings.set_dialog_error("パスワードを入力してください".into());
        return;
    }
    settings.set_dialog_loading(true);
    ctx::run_blocking(
        move || {
            let _ = sync_before_reencrypt();
            let recovery_key = shared()
                .vault
                .api_regenerate_recovery_key(password.to_string())?;
            let warning = save_and_push()?;
            Ok((recovery_key, warning))
        },
        |app, result| {
            finish_dialog_task(
                &app,
                result,
                "リカバリーキー再生成に失敗しました",
                show_recovery_key_with_warning,
            )
        },
    );
}

fn reauth_submit(app: &AppWindow) {
    let settings = app.global::<Settings>();
    let password = Zeroizing::new(settings.get_pw_old().to_string());
    if password.is_empty() {
        settings.set_dialog_error("マスターパスワードを入力してください".into());
        return;
    }
    settings.set_dialog_loading(true);
    settings.set_dialog_error("".into());
    ctx::run_blocking(
        move || shared().vault.api_verify_password(password.to_string()),
        |app, result| {
            let settings = app.global::<Settings>();
            settings.set_dialog_loading(false);
            if result.is_err() {
                settings.set_dialog_error("マスターパスワードが正しくありません".into());
                return;
            }
            close_dialog(&app);
            if REAUTH_NEXT.with_borrow_mut(Option::take).as_deref() == Some("transfer") {
                open_dialog(&app, "transfer");
            }
        },
    );
}

fn generate_transfer(app: &AppWindow) {
    let settings = app.global::<Settings>();
    let password = Zeroizing::new(settings.get_pw_old().to_string());
    settings.set_dialog_error("".into());
    if password.is_empty() {
        settings.set_dialog_error("パスワードを入力してください".into());
        return;
    }
    let Some(config) = shared().s3_config() else {
        settings.set_dialog_error("S3設定が見つかりません".into());
        return;
    };
    settings.set_dialog_loading(true);
    ctx::run_blocking(
        move || {
            vault_core::api::api_encrypt_transfer_config(password.to_string(), config.to_string())
        },
        |app, result| {
            finish_dialog_task(
                &app,
                result,
                "転送コードの生成に失敗しました",
                |app, code| {
                    let settings = app.global::<Settings>();
                    settings.set_pw_old("".into());
                    match qr::render(&code) {
                        Ok(image) => settings.set_transfer_qr(image),
                        Err(e) => eprintln!("Failed to render QR code: {e}"),
                    }
                    settings.set_transfer_code(code.into());
                },
            )
        },
    );
}
