use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Label {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

impl Label {
    pub fn new(name: String) -> Self {
        Label {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            created_at: crate::get_timestamp(),
        }
    }

    pub fn with_id(id: String, name: String, created_at: i64) -> Self {
        Label { id, name, created_at }
    }
}
