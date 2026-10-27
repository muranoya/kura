//! 設定ストア。旧 tauri-plugin-store と同じ JSON オブジェクト形式で settings.json を読み書きする。

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub mod keys {
    pub const S3_CONFIG: &str = "s3Config";
    pub const APP_SETTINGS: &str = "appSettings";
    pub const LAST_SYNC_TIME: &str = "lastSyncTime";
    pub const SORT_CONFIG: &str = "entrySortConfig";
    pub const ENTRY_TYPE_FILTER: &str = "entryTypeFilter";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub clipboard_clear_seconds: u64,
    pub autolock_minutes: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            clipboard_clear_seconds: 30,
            autolock_minutes: 5,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SortConfig {
    pub field: String,
    pub order: String,
}

impl Default for SortConfig {
    fn default() -> Self {
        Self {
            field: "created_at".into(),
            order: "desc".into(),
        }
    }
}

pub struct Store {
    path: PathBuf,
    data: Mutex<Map<String, Value>>,
    load_error: Mutex<Option<String>>,
}

impl Store {
    /// settings.json を読み込む。読めなかったファイルは上書きで失わないよう別名に退避し、
    /// 空の設定で始める（エラーは `take_load_error` で取り出して利用者に知らせる）
    pub fn open(path: PathBuf) -> Self {
        let (data, load_error) = match load(&path) {
            Ok(data) => (data, None),
            Err(e) => {
                let backup = path.with_extension("json.broken");
                let message = match std::fs::rename(&path, &backup) {
                    Ok(()) => format!(
                        "設定ファイルを読み込めなかったため {} に退避しました。S3 同期などの設定はやり直しが必要です: {e}",
                        backup.display()
                    ),
                    Err(_) => format!("設定ファイルを読み込めませんでした: {e}"),
                };
                (Map::new(), Some(message))
            }
        };
        Self {
            path,
            data: Mutex::new(data),
            load_error: Mutex::new(load_error),
        }
    }

    pub fn take_load_error(&self) -> Option<String> {
        self.load_error
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
    }

    pub fn get<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        let data = self.data.lock().unwrap_or_else(PoisonError::into_inner);
        data.get(key)
            .filter(|v| !v.is_null())
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    pub fn set<T: Serialize>(&self, key: &str, value: &T) -> Result<(), String> {
        let value = serde_json::to_value(value).map_err(|e| e.to_string())?;
        let mut data = self.data.lock().unwrap_or_else(PoisonError::into_inner);
        // 検索の入力ごとにフィルタ設定が書き戻されるので、変わっていなければファイルに触らない
        if data.get(key) == Some(&value) {
            return Ok(());
        }
        let mut updated = data.clone();
        updated.insert(key.to_string(), value);
        save(&self.path, &updated)?;
        *data = updated;
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        let mut data = self.data.lock().unwrap_or_else(PoisonError::into_inner);
        save(&self.path, &Map::new())?;
        data.clear();
        Ok(())
    }

    pub fn app_settings(&self) -> AppSettings {
        self.get(keys::APP_SETTINGS).unwrap_or_default()
    }

    /// 既存の appSettings に上書きマージして保存する。
    /// 旧版が書いた未知のキー（`language` など）は消さずに残す
    pub fn update_app_settings(&self, settings: AppSettings) -> Result<(), String> {
        let mut merged = match self.get::<Value>(keys::APP_SETTINGS) {
            Some(Value::Object(map)) => map,
            _ => Map::new(),
        };
        if let Value::Object(updates) = serde_json::to_value(settings).map_err(|e| e.to_string())? {
            merged.extend(updates);
        }
        self.set(keys::APP_SETTINGS, &merged)
    }
}

/// ファイルがまだない場合だけ空の設定とみなし、読み込みやパースの失敗はエラーにする
fn load(path: &Path) -> Result<Map<String, Value>, String> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(e) => return Err(e.to_string()),
    };
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn save(path: &Path, data: &Map<String, Value>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    write_atomic(path, text.as_bytes())
}

/// 一時ファイルに書いてから置き換える。書き込み途中で落ちても元のファイルは壊れない
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid file path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut tmp_name = path.file_name().ok_or("Invalid file path")?.to_os_string();
    tmp_name.push(".tmp");
    let tmp = parent.join(tmp_name);
    let result = (|| {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(name: &str) -> (Store, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("kura-store-test-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("settings.json");
        (Store::open(path.clone()), dir)
    }

    #[test]
    fn persists_values_across_reopen() {
        let (store, dir) = temp_store("persist");
        store.set(keys::LAST_SYNC_TIME, &1234_i64).unwrap();
        store
            .set(
                keys::APP_SETTINGS,
                &AppSettings {
                    clipboard_clear_seconds: 60,
                    autolock_minutes: 0,
                },
            )
            .unwrap();

        let reopened = Store::open(dir.join("settings.json"));
        assert_eq!(reopened.get::<i64>(keys::LAST_SYNC_TIME), Some(1234));
        assert_eq!(reopened.app_settings().autolock_minutes, 0);
        assert_eq!(reopened.app_settings().clipboard_clear_seconds, 60);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_tauri_plugin_store_format() {
        // tauri-plugin-store が書き出していた形式（null を含む）をそのまま読めること
        let (_, dir) = temp_store("compat");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(
            &path,
            r#"{"s3Config":"abc","entryTypeFilter":null,"entrySortConfig":{"field":"name","order":"asc"},"appSettings":{"clipboardClearSeconds":30,"autolockMinutes":5}}"#,
        )
        .unwrap();
        let store = Store::open(path);
        assert_eq!(store.get::<String>(keys::S3_CONFIG).as_deref(), Some("abc"));
        assert_eq!(store.get::<String>(keys::ENTRY_TYPE_FILTER), None);
        assert_eq!(
            store.get::<SortConfig>(keys::SORT_CONFIG),
            Some(SortConfig {
                field: "name".into(),
                order: "asc".into()
            })
        );
        assert_eq!(store.app_settings(), AppSettings::default());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn update_app_settings_keeps_unknown_keys() {
        let (store, dir) = temp_store("merge");
        store
            .set(
                keys::APP_SETTINGS,
                &serde_json::json!({"autolockMinutes": 30, "language": "ja"}),
            )
            .unwrap();
        store
            .update_app_settings(AppSettings {
                clipboard_clear_seconds: 120,
                autolock_minutes: 1,
            })
            .unwrap();
        let raw: Value = store.get(keys::APP_SETTINGS).unwrap();
        assert_eq!(raw["language"], "ja");
        assert_eq!(raw["autolockMinutes"], 1);
        assert_eq!(raw["clipboardClearSeconds"], 120);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn broken_file_is_moved_aside_instead_of_overwritten() {
        let (_, dir) = temp_store("broken");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"s3Config":"ab"#).unwrap();
        let store = Store::open(path.clone());
        assert!(store.take_load_error().is_some());
        assert_eq!(store.get::<String>(keys::S3_CONFIG), None);
        assert_eq!(
            std::fs::read_to_string(dir.join("settings.json.broken")).unwrap(),
            r#"{"s3Config":"ab"#
        );

        store.set(keys::LAST_SYNC_TIME, &1_i64).unwrap();
        assert!(!dir.join("settings.json.tmp").exists());
        assert_eq!(Store::open(path).get::<i64>(keys::LAST_SYNC_TIME), Some(1));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn missing_file_is_not_an_error() {
        let (store, dir) = temp_store("missing");
        assert_eq!(store.take_load_error(), None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn clear_removes_everything() {
        let (store, dir) = temp_store("clear");
        store.set(keys::S3_CONFIG, &"x").unwrap();
        store.clear().unwrap();
        assert_eq!(store.get::<String>(keys::S3_CONFIG), None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
