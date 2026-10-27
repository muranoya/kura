use std::path::PathBuf;

/// Tauri 版の `app_data_dir()`（`{data_dir}/{identifier}`）と同じ場所を使い、
/// 既存ユーザーの vault.bin / settings.json をそのまま引き継ぐ。
/// デバッグビルドは本番データを汚さないよう別の識別子にする（旧 tauri.conf.dev.json と同じ）
const IDENTIFIER: &str = if cfg!(debug_assertions) {
    "net.meshpeak.kura.debug"
} else {
    "net.meshpeak.kura"
};

pub fn app_data_dir() -> PathBuf {
    // 動作確認用に保存先を差し替えられるようにする
    if let Some(dir) = std::env::var_os("KURA_DATA_DIR") {
        return PathBuf::from(dir);
    }
    dirs::data_dir()
        .expect("Failed to resolve the data directory")
        .join(IDENTIFIER)
}

pub fn vault_file() -> PathBuf {
    app_data_dir().join("vault.bin")
}

pub fn settings_file() -> PathBuf {
    app_data_dir().join("settings.json")
}
