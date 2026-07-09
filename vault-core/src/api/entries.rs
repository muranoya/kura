use crate::models::{
    entry_data::CustomFieldType, EntryFilter, EntryType, SortField, SortOrder, TypedValue,
};

use super::{AutofillCandidate, EntryDetail, EntryRow, TotpPeriodRow, VaultManager};
use crate::secret::SecretString;

impl VaultManager {
    /// エントリ一覧（フィルター付き）
    /// FFI境界越しに構造体を渡す設計にしていないため引数がフラットになっている
    #[allow(clippy::too_many_arguments)]
    pub fn api_list_entries(
        &self,
        search_query: Option<String>,
        entry_type: Option<String>,
        label_id: Option<String>,
        include_trash: bool,
        only_favorites: bool,
        sort_field: Option<String>,
        sort_order: Option<String>,
    ) -> Result<Vec<EntryRow>, String> {
        self.with_unlocked(|unlocked| {
            let sort_field = sort_field
                .and_then(|s| SortField::from_str(&s))
                .unwrap_or_default();
            let sort_order = sort_order
                .and_then(|s| SortOrder::from_str(&s))
                .unwrap_or_default();

            let mut filter = EntryFilter::new()
                .with_trash(include_trash)
                .with_search(search_query.unwrap_or_default())
                .with_sort(sort_field, sort_order);

            if let Some(t) = entry_type {
                filter = filter.with_type(t);
            }

            if let Some(l) = label_id {
                filter = filter.with_label(l);
            }

            if only_favorites {
                filter = filter.favorites_only();
            }

            // password/cvv/pin等の秘匿値は一覧表示に不要なため、list_entry_summariesで
            // 復号・cloneを避ける（メモリ安全性の設計方針は docs/architecture.md の
            // 「メモリ安全性」セクション参照）
            let entries = unlocked.list_entry_summaries(&filter);

            Ok(entries
                .into_iter()
                .map(|entry| EntryRow {
                    id: entry.id,
                    entry_type: entry.entry_type,
                    name: entry.name,
                    subtitle: entry.subtitle,
                    is_favorite: entry.is_favorite,
                    created_at: entry.created_at,
                    updated_at: entry.updated_at,
                    deleted_at: entry.deleted_at,
                })
                .collect())
        })
    }

    /// エントリ詳細（復号済み）
    pub fn api_get_entry(&self, id: String) -> Result<EntryDetail, String> {
        self.with_unlocked(|unlocked| {
            let entry = unlocked
                .get_entry(&id)
                .map_err(|e| format!("Failed to get entry: {}", e))?
                .ok_or_else(|| format!("Entry not found: {}", id))?;

            let custom_fields =
                entry.data.custom_fields.as_ref().map(|fields| {
                    serde_json::to_string(fields).unwrap_or_else(|_| "[]".to_string())
                });

            Ok(EntryDetail {
                id: entry.id,
                entry_type: entry.entry_type,
                name: entry.name,
                is_favorite: entry.is_favorite,
                created_at: entry.created_at,
                updated_at: entry.updated_at,
                deleted_at: entry.deleted_at,
                notes: entry.data.notes.as_ref().map(|n| n.as_str().to_string()),
                typed_value: serde_json::to_string(&entry.data.typed_value)
                    .unwrap_or_else(|_| "{}".to_string()),
                labels: entry.labels,
                custom_fields,
            })
        })
    }

    /// エントリ作成
    pub fn api_create_entry(
        &self,
        entry_type: String,
        name: String,
        notes: Option<String>,
        typed_value_json: String,
        label_ids: Vec<String>,
        custom_fields_json: Option<String>,
    ) -> Result<String, String> {
        // Validate JSON format
        serde_json::from_str::<serde_json::Value>(&typed_value_json)
            .map_err(|e| format!("Invalid typed_value JSON: {}", e))?;

        // Validate that the entry type is known (refuse to create unknown types)
        EntryType::from_str(&entry_type)
            .ok_or_else(|| format!("Invalid entry type: {}", entry_type))?;

        let typed_value = TypedValue::parse(&entry_type, &typed_value_json)
            .map_err(|e| format!("Failed to parse typed_value: {}", e))?;

        let custom_fields = if let Some(json) = custom_fields_json {
            let fields: Vec<crate::models::entry_data::CustomField> =
                serde_json::from_str(&json)
                    .map_err(|e| format!("Invalid custom_fields JSON: {}", e))?;
            // Validate that all custom field types are known
            for field in &fields {
                CustomFieldType::from_str(&field.field_type)
                    .ok_or_else(|| format!("Invalid field type: {}", field.field_type))?;
            }
            Some(fields)
        } else {
            None
        };

        let data = crate::models::EntryData {
            entry_type: entry_type.clone(),
            typed_value,
            notes: notes.map(SecretString::from_string),
            custom_fields,
        };

        self.with_unlocked_mut(|unlocked| {
            let entry = unlocked
                .create_entry(name, entry_type, data, label_ids)
                .map_err(|e| format!("Failed to create entry: {}", e))?;
            Ok(entry.id)
        })
    }

    /// エントリ更新
    pub fn api_update_entry(
        &self,
        id: String,
        name: Option<String>,
        notes: Option<String>,
        typed_value_json: Option<String>,
        label_ids: Option<Vec<String>>,
        custom_fields_json: Option<String>,
    ) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            // Get current entry to preserve typed_value if not provided
            let current = unlocked
                .get_entry(&id)
                .map_err(|e| format!("Failed to get entry: {}", e))?
                .ok_or_else(|| format!("Entry not found: {}", id))?;

            let typed_value = if let Some(json) = typed_value_json {
                // Validate JSON format
                serde_json::from_str::<serde_json::Value>(&json)
                    .map_err(|e| format!("Invalid typed_value JSON: {}", e))?;
                TypedValue::parse(&current.entry_type, &json)
                    .map_err(|e| format!("Failed to parse typed_value: {}", e))?
            } else {
                current.data.typed_value.clone()
            };

            let custom_fields = if let Some(json) = custom_fields_json {
                Some(
                    serde_json::from_str(&json)
                        .map_err(|e| format!("Invalid custom_fields JSON: {}", e))?,
                )
            } else {
                current.data.custom_fields.clone()
            };

            // Empty string clears notes to None; None preserves existing value
            let notes = if let Some(n) = notes {
                if n.is_empty() {
                    None
                } else {
                    Some(SecretString::from_string(n))
                }
            } else {
                current.data.notes.clone()
            };

            let data = crate::models::EntryData {
                entry_type: current.entry_type,
                typed_value,
                notes,
                custom_fields,
            };

            unlocked
                .update_entry(&id, name.unwrap_or(current.name), data)
                .map_err(|e| format!("Failed to update entry: {}", e))?;

            if let Some(label_ids) = label_ids {
                unlocked
                    .set_entry_labels(&id, label_ids)
                    .map_err(|e| format!("Failed to set labels: {}", e))?;
            }

            Ok(())
        })
    }

    /// エントリをゴミ箱へ移動
    pub fn api_delete_entry(&self, id: String) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .delete_entry(&id)
                .map_err(|e| format!("Failed to delete entry: {}", e))
        })
    }

    /// ゴミ箱から復元
    pub fn api_restore_entry(&self, id: String) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .restore_entry(&id)
                .map_err(|e| format!("Failed to restore entry: {}", e))
        })
    }

    /// 完全削除
    pub fn api_purge_entry(&self, id: String) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .purge_entry(&id)
                .map_err(|e| format!("Failed to purge entry: {}", e))
        })
    }

    /// お気に入り設定
    pub fn api_set_favorite(&self, id: String, is_favorite: bool) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .set_favorite(&id, is_favorite)
                .map_err(|e| format!("Failed to set favorite: {}", e))
        })
    }

    /// オートフィル候補検索（ホスト名でマッチング）
    ///
    /// 全loginエントリのtyped_value.urlからホスト名を抽出し、
    /// 指定されたホスト名と一致するエントリをパスワードなしで返す。
    /// ホスト名の比較はcaller側（JS）で行うeTLD+1ベースのマッチングではなく、
    /// 完全一致で行う。eTLD+1の判定はJS側で行い、このAPIには正規化済みの
    /// ホスト名リストを渡す設計にすることもできるが、シンプルさのため
    /// 全loginエントリのURL情報を返し、マッチングはJS側に委ねる。
    pub fn api_list_login_urls(&self) -> Result<Vec<AutofillCandidate>, String> {
        self.with_unlocked(|unlocked| {
            let filter = EntryFilter::new().with_type("login".to_string());

            // password等の秘匿値は不要なため、list_entry_summariesで復号・cloneを避ける
            let entries = unlocked.list_entry_summaries(&filter);

            Ok(entries
                .into_iter()
                .filter_map(|entry| {
                    let url = entry.login_url?;
                    Some(AutofillCandidate {
                        id: entry.id,
                        name: entry.name,
                        url,
                        username: entry.subtitle,
                    })
                })
                .collect())
        })
    }

    /// エントリのTOTPコードを生成する（password等の他フィールドは取得しない）
    pub fn api_get_totp_code(&self, id: String) -> Result<Option<String>, String> {
        self.with_unlocked(|unlocked| {
            unlocked
                .get_totp_code(&id)
                .map_err(|e| format!("Failed to generate TOTP: {}", e))
        })
    }

    /// 複数エントリのTOTP周期をまとめて取得する（オートフィル候補抽出用のN+1回避）
    pub fn api_list_totp_periods(&self, ids: Vec<String>) -> Result<Vec<TotpPeriodRow>, String> {
        self.with_unlocked(|unlocked| {
            Ok(unlocked
                .list_totp_periods(&ids)
                .into_iter()
                .map(|(entry_id, period)| TotpPeriodRow { entry_id, period })
                .collect())
        })
    }
}
