use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Label {
    pub id: String,
    pub name: String,
}

impl Label {
    pub fn new(name: String) -> Self {
        Label {
            id: uuid::Uuid::new_v4().to_string(),
            name,
        }
    }

    pub fn with_id(id: String, name: String) -> Self {
        Label { id, name }
    }
}
