pub mod session;
pub mod entries;
pub mod labels;
pub mod security;
pub mod utils;
pub mod sync;
pub mod storage;

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, PoisonError};

use vault_core::api::VaultManager;

static MANAGERS: LazyLock<Mutex<HashMap<String, Arc<VaultManager>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn get_manager(vault_id: &str) -> Arc<VaultManager> {
    let mut map = MANAGERS.lock().unwrap_or_else(|p: PoisonError<_>| p.into_inner());
    map.entry(vault_id.to_string())
        .or_insert_with(|| Arc::new(VaultManager::new()))
        .clone()
}
