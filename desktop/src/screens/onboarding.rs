//! 初期設定（ようこそ → ストレージ設定 → マスターパスワード / 既存 vault のアンロック → リカバリーキー）

use serde::{Deserialize, Serialize};
use slint::ComponentHandle;
use zeroize::Zeroizing;

use super::navigate;
use crate::ctx::{self, shared};
use crate::store::keys;
use crate::{markdown, vault, AppWindow, Onboarding, Page};

const TERMS: &str = include_str!("../../../assets/legal/terms.md");

/// 保存形式は旧版と同じ camelCase の JSON（vault_core::api::parse_s3_config が読む）
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct S3ConfigForm {
    #[serde(default)]
    region: String,
    #[serde(default)]
    bucket: String,
    #[serde(default)]
    key: String,
    #[serde(default)]
    access_key_id: String,
    #[serde(default)]
    secret_access_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    endpoint: Option<String>,
}

pub fn load_terms(app: &AppWindow) {
    app.global::<Onboarding>()
        .set_terms(markdown::render(TERMS));
}

pub fn setup(app: &AppWindow) {
    let ob = app.global::<Onboarding>();

    ob.on_storage_next(ctx::handler(app, storage_next));
    ob.on_transfer_load(ctx::handler(app, transfer_load));
    ob.on_create_vault(ctx::handler(app, create_vault));
    ob.on_recovery_complete(ctx::handler(app, recovery_complete));
    ob.on_unlock_existing(ctx::handler(app, unlock_existing));
}

fn fill_storage_fields(app: &AppWindow, config: &S3ConfigForm) {
    let ob = app.global::<Onboarding>();
    ob.set_region(config.region.as_str().into());
    ob.set_bucket(config.bucket.as_str().into());
    ob.set_key(
        if config.key.is_empty() {
            "vault.json"
        } else {
            &config.key
        }
        .into(),
    );
    ob.set_access_key_id(config.access_key_id.as_str().into());
    ob.set_secret_access_key(config.secret_access_key.as_str().into());
    ob.set_endpoint(config.endpoint.as_deref().unwrap_or("").into());
}

fn clear_storage_fields(app: &AppWindow) {
    fill_storage_fields(app, &S3ConfigForm::default());
}

/// マスターパスワード画面から戻ってきた場合は、入力済みの設定を復元する
pub fn enter_storage_setup(app: &AppWindow) {
    let ob = app.global::<Onboarding>();
    ob.set_error("".into());
    ob.set_loading(false);
    if let Some(pending) = shared().pending_s3_config() {
        if let Ok(config) = serde_json::from_str::<S3ConfigForm>(&pending) {
            fill_storage_fields(app, &config);
        }
    }
}

pub fn reset(app: &AppWindow) {
    let ob = app.global::<Onboarding>();
    clear_storage_fields(app);
    ob.set_agreed(false);
    ob.set_terms_open(false);
    ob.set_show_transfer(false);
    ob.set_transfer_string("".into());
    ob.set_transfer_password("".into());
    ob.set_password("".into());
    ob.set_confirm_password("".into());
    ob.set_recovery_key("".into());
    ob.set_error("".into());
    ob.set_loading(false);
}

fn storage_next(app: &AppWindow) {
    let ob = app.global::<Onboarding>();
    let endpoint = ob.get_endpoint().to_string();
    let config = S3ConfigForm {
        region: ob.get_region().into(),
        bucket: ob.get_bucket().into(),
        key: ob.get_key().into(),
        access_key_id: ob.get_access_key_id().into(),
        secret_access_key: ob.get_secret_access_key().into(),
        endpoint: (!endpoint.is_empty()).then_some(endpoint),
    };
    if config.region.is_empty()
        || config.bucket.is_empty()
        || config.key.is_empty()
        || config.access_key_id.is_empty()
        || config.secret_access_key.is_empty()
    {
        ob.set_error("すべての必須フィールドを入力してください".into());
        return;
    }

    // S3 設定はマスターパスワードで暗号化して保存するため、ここでは一時保存のみ
    let json = Zeroizing::new(serde_json::to_string(&config).expect("serializable"));
    shared().set_pending_s3_config(Some(json.clone()));

    ob.set_loading(true);
    ctx::run_async(
        async move { vault::download(&json).await },
        |app, result| {
            let ob = app.global::<Onboarding>();
            ob.set_loading(false);
            match result {
                Ok(exists) => {
                    clear_storage_fields(&app);
                    ob.set_password("".into());
                    ob.set_confirm_password("".into());
                    ob.set_error("".into());
                    navigate(
                        &app,
                        if exists {
                            Page::UnlockExisting
                        } else {
                            Page::MasterPassword
                        },
                    );
                }
                Err(e) => ob.set_error(format!("ストレージへのアクセスに失敗しました: {e}").into()),
            }
        },
    );
}

fn transfer_load(app: &AppWindow) {
    let ob = app.global::<Onboarding>();
    let transfer = ob.get_transfer_string().trim().to_string();
    let password = Zeroizing::new(ob.get_transfer_password().to_string());
    if transfer.is_empty() || password.is_empty() {
        return;
    }
    ob.set_loading(true);
    ob.set_error("".into());
    ctx::run_blocking(
        move || vault_core::api::api_decrypt_transfer_config(password.to_string(), transfer),
        |app, result| {
            let ob = app.global::<Onboarding>();
            ob.set_loading(false);
            let parsed = result.and_then(|json| {
                let json = Zeroizing::new(json);
                serde_json::from_str::<S3ConfigForm>(&json).map_err(|e| e.to_string())
            });
            match parsed {
                Ok(config) => {
                    fill_storage_fields(&app, &config);
                    ob.set_show_transfer(false);
                    ob.set_transfer_string("".into());
                    ob.set_transfer_password("".into());
                }
                Err(e) => ob.set_error(format!("転送コードの復号に失敗しました: {e}").into()),
            }
        },
    );
}

/// 一時保存した S3 設定をマスターパスワードで暗号化して永続化し、セッションに保持する
fn persist_pending_config(password: &str) -> Result<(), String> {
    if let Some(pending) = shared().pending_s3_config() {
        let encrypted = shared()
            .vault
            .api_encrypt_config(password.to_string(), pending.to_string())?;
        shared().store.set(keys::S3_CONFIG, &encrypted)?;
        shared().set_pending_s3_config(None);
        shared().set_s3_config(Some(pending));
    }
    Ok(())
}

fn create_vault(app: &AppWindow) {
    let ob = app.global::<Onboarding>();
    let password = Zeroizing::new(ob.get_password().to_string());
    let confirm = ob.get_confirm_password();
    if password.is_empty() || confirm.is_empty() {
        ob.set_error("パスワードを入力してください".into());
        return;
    }
    if password.as_str() != confirm.as_str() {
        ob.set_error("パスワードが一致しません".into());
        return;
    }
    if password.chars().count() < 8 {
        ob.set_error("パスワードは8文字以上である必要があります".into());
        return;
    }

    ob.set_loading(true);
    ctx::run_blocking(
        move || {
            let recovery_key = shared().vault.api_create_new_vault(password.to_string())?;
            persist_pending_config(&password)?;
            Ok::<_, String>(recovery_key)
        },
        |app, result| {
            let ob = app.global::<Onboarding>();
            ob.set_loading(false);
            match result {
                Ok(recovery_key) => {
                    ob.set_password("".into());
                    ob.set_confirm_password("".into());
                    ob.set_error("".into());
                    ob.set_recovery_key(recovery_key.into());
                    navigate(&app, Page::RecoveryKey);
                }
                Err(e) => ob.set_error(format!("エラー: {e}").into()),
            }
        },
    );
}

fn recovery_complete(app: &AppWindow) {
    let ob = app.global::<Onboarding>();
    match ctx::save_local() {
        Ok(()) => {
            ob.set_recovery_key("".into());
            ob.set_error("".into());
            // 作成直後の vault はロック状態なので、ロック画面から入り直す
            navigate(app, Page::Lock);
        }
        Err(e) => ob.set_error(format!("エラー: {e}").into()),
    }
}

fn unlock_existing(app: &AppWindow) {
    let ob = app.global::<Onboarding>();
    let password = Zeroizing::new(ob.get_password().to_string());
    if password.is_empty() {
        ob.set_error("パスワードを入力してください".into());
        return;
    }
    ob.set_loading(true);
    ctx::run_blocking(
        move || {
            shared().vault.api_unlock(password.to_string())?;
            persist_pending_config(&password)?;
            ctx::save_local()
        },
        |app, result| {
            let ob = app.global::<Onboarding>();
            ob.set_loading(false);
            match result {
                Ok(()) => {
                    ob.set_password("".into());
                    ob.set_error("".into());
                    ctx::sync_in_background(&app);
                    super::enter_unlocked(&app);
                }
                Err(_) => ob.set_error("パスワードが違います".into()),
            }
        },
    );
}
