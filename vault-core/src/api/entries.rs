use crate::models::{
    entry_data::CustomFieldType, EntryFilter, EntryType, SortField, SortOrder, TypedValue,
};

use super::{AutofillCandidate, EntryDetail, EntryRow, TotpPeriodRow, VaultManager};
use crate::models::entry_data::CustomField;
use crate::secret::SecretString;

/// passkey は WebAuthn API だけが作るため `CustomFieldType`（ユーザーが選べる型）には含めないが、
/// 編集フォームはエントリのカスタムフィールドを丸ごと送り返すので、既知の型として受け入れる
const PASSKEY_FIELD_TYPE: &str = "passkey";

/// カスタムフィールドの JSON を読み、未知のフィールドタイプを拒否する。
/// ただし `existing` に同じ ID・同じタイプのフィールドがある場合は、新しいクライアントが
/// 作ったフィールドを編集時に送り返しているだけなので受け入れる（前方互換性）
fn parse_custom_fields(json: &str, existing: &[CustomField]) -> Result<Vec<CustomField>, String> {
    let fields: Vec<CustomField> =
        serde_json::from_str(json).map_err(|e| format!("Invalid custom_fields JSON: {}", e))?;
    for field in &fields {
        let known = CustomFieldType::from_str(&field.field_type).is_some()
            || field.field_type == PASSKEY_FIELD_TYPE;
        let preserved = existing
            .iter()
            .any(|f| f.id == field.id && f.field_type == field.field_type);
        if !known && !preserved {
            return Err(format!("Invalid field type: {}", field.field_type));
        }
    }
    Ok(fields)
}

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

            // 一覧表示は index だけで処理し、secret は復号しない（メモリ安全性の設計方針は
            // docs/architecture.md の「メモリ安全性」セクション参照）
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

    /// エントリ詳細（復号済み）。対象エントリの secret だけを復号する
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
                secret_field_keys: entry.secret_field_keys,
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
        // Validate that the entry type is known (refuse to create unknown types)
        EntryType::from_str(&entry_type)
            .ok_or_else(|| format!("Invalid entry type: {}", entry_type))?;

        let typed_value = TypedValue::parse(&entry_type, &typed_value_json)
            .map_err(|e| format!("Failed to parse typed_value: {}", e))?;

        let custom_fields = custom_fields_json
            .map(|json| parse_custom_fields(&json, &[]))
            .transpose()?;

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
                TypedValue::parse(&current.entry_type, &json)
                    .map_err(|e| format!("Failed to parse typed_value: {}", e))?
            } else {
                current.data.typed_value.clone()
            };

            let custom_fields = if let Some(json) = custom_fields_json {
                let existing = current.data.custom_fields.as_deref().unwrap_or_default();
                Some(parse_custom_fields(&json, existing)?)
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
                .update_entry(&id, name.unwrap_or(current.name), data, label_ids)
                .map_err(|e| format!("Failed to update entry: {}", e))
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

    /// オートフィル候補検索（ドメインでマッチング）
    ///
    /// 全loginエントリのtyped_value.urlおよびURL型カスタムフィールドからホスト名を
    /// 抽出し、指定された `page_hostname` とマッチするエントリをパスワードなしで返す。
    /// マッチング判定はvault-core側（本関数）で一元的に行う。これにより
    /// Android・拡張機能のいずれから呼んでも同一の挙動になる。
    ///
    /// - `strict_subdomain = false`（デフォルト）: PSLベースのeTLD+1が一致すれば
    ///   マッチする（例: `www.example.com` と `m.example.com` は同一サイトとみなす）。
    /// - `strict_subdomain = true`: ホスト名の完全一致のみをマッチとする。
    ///   どのサイトで厳密一致が必要かはvault-coreの関知するところではなく、
    ///   呼び出し側（拡張機能のサイト別パターンDB等）が判断してこの引数に渡す。
    /// - `insecure_page = true`: ページが平文の HTTP。明示的に `http://` で保存した
    ///   URLだけを照合する。HTTPS 用に保存したパスワードを、改ざんされうるページに
    ///   出さないため（ダウングレード対策）。スキームのないURLは HTTPS とみなす。
    pub fn api_list_login_candidates(
        &self,
        page_hostname: &str,
        strict_subdomain: bool,
        insecure_page: bool,
    ) -> Result<Vec<AutofillCandidate>, String> {
        self.with_unlocked(|unlocked| {
            let filter = EntryFilter::new().with_type("login".to_string());

            // password等の秘匿値は不要なため、index だけで処理する（secret は復号しない）
            let entries = unlocked.list_entry_summaries(&filter);
            let page_hostname_lower = page_hostname.to_lowercase();

            Ok(entries
                .into_iter()
                .filter_map(|entry| {
                    let allowed = |url: &str| !insecure_page || is_http_url(url);
                    let login_url = entry.login_url.as_deref().filter(|u| allowed(u));
                    let additional_urls: Vec<String> = entry
                        .additional_urls
                        .iter()
                        .filter(|u| allowed(u))
                        .cloned()
                        .collect();
                    let url = match_autofill_url(
                        login_url,
                        &additional_urls,
                        &page_hostname_lower,
                        strict_subdomain,
                    )?;
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

    /// エントリのTOTPコードを生成する（対象エントリの secret だけを復号する）
    pub fn api_get_totp_code(&self, id: String) -> Result<Option<String>, String> {
        self.with_unlocked(|unlocked| {
            unlocked
                .get_totp_code(&id)
                .map_err(|e| format!("Failed to generate TOTP: {}", e))
        })
    }

    /// 複数エントリのTOTP周期をまとめて取得する（オートフィル候補抽出用のN+1回避）。
    /// totp フィールドの公開部（周期）から返し、secret は復号しない
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

/// 明示的に `http://` スキームのURLか（大文字小文字は区別しない）
fn is_http_url(url: &str) -> bool {
    url.trim()
        .get(..7)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("http://"))
}

/// オートフィル候補のURLマッチングを行う。
///
/// `login_url`（typed_value.url）と URL型カスタムフィールド（`additional_urls`）の
/// いずれかが `page_hostname` にマッチするかを判定し、マッチした場合は代表URLを返す。
/// 代表URLとしては `login_url` を優先し、`login_url` が存在しない場合はマッチした
/// カスタムフィールドURLを返す。
///
/// - `strict_subdomain = false`: PSLベースのeTLD+1が一致すればマッチ
/// - `strict_subdomain = true`: ホスト名の完全一致のみマッチ
fn match_autofill_url(
    login_url: Option<&str>,
    additional_urls: &[String],
    page_hostname_lower: &str,
    strict_subdomain: bool,
) -> Option<String> {
    let candidate_urls: Vec<&str> = login_url
        .into_iter()
        .chain(additional_urls.iter().map(String::as_str))
        .collect();

    let any_matched = candidate_urls.iter().any(|url| {
        let Some(entry_host) = crate::domain_match::extract_host(url) else {
            return false;
        };
        if strict_subdomain {
            entry_host.eq_ignore_ascii_case(page_hostname_lower)
        } else {
            crate::domain_match::same_etld_plus1(entry_host, page_hostname_lower)
        }
    });
    if !any_matched {
        return None;
    }
    // 代表URLとして login_url を優先し、なければマッチしたカスタムフィールドURL
    Some(login_url.map(|u| u.to_string()).unwrap_or_else(|| {
        candidate_urls
            .iter()
            .find_map(|url| {
                let entry_host = crate::domain_match::extract_host(url)?;
                let matched = if strict_subdomain {
                    entry_host.eq_ignore_ascii_case(page_hostname_lower)
                } else {
                    crate::domain_match::same_etld_plus1(entry_host, page_hostname_lower)
                };
                matched.then(|| url.to_string())
            })
            .unwrap_or_default()
    }))
}

#[cfg(test)]
mod tests {
    use super::{is_http_url, match_autofill_url, parse_custom_fields};

    #[test]
    fn test_is_http_url() {
        assert!(is_http_url("http://192.168.1.1/"));
        assert!(is_http_url("  HTTP://router.local"));
        assert!(!is_http_url("https://example.com"));
        assert!(!is_http_url("example.com"));
        assert!(!is_http_url("http:/broken"));
        assert!(!is_http_url(""));
    }

    #[test]
    fn test_parse_custom_fields_rejects_new_unknown_type() {
        let json = r#"[{"id":"cf1","name":"X","field_type":"future_type","value":"v"}]"#;
        assert!(parse_custom_fields(json, &[]).is_err());
    }

    #[test]
    fn test_parse_custom_fields_accepts_preserved_unknown_type() {
        // 新しいクライアントが作った未知タイプのフィールドを、古いクライアントが
        // 編集時にそのまま送り返すケース
        let json = r#"[{"id":"cf1","name":"X","field_type":"future_type","value":"v"}]"#;
        let existing = parse_custom_fields(
            r#"[{"id":"cf1","name":"X","field_type":"text","value":"v"}]"#,
            &[],
        )
        .unwrap();
        assert!(parse_custom_fields(json, &existing).is_err());

        let mut existing = existing;
        existing[0].field_type = "future_type".to_string();
        assert!(parse_custom_fields(json, &existing).is_ok());
    }

    #[test]
    fn test_match_autofill_url_login_url_match() {
        let result =
            match_autofill_url(Some("https://example.com/login"), &[], "example.com", false);
        assert_eq!(result.as_deref(), Some("https://example.com/login"));
    }

    #[test]
    fn test_match_autofill_url_no_match() {
        let result = match_autofill_url(
            Some("https://example.com"),
            &["https://other.com".to_string()],
            "unrelated.org",
            false,
        );
        assert_eq!(result, None);
    }

    #[test]
    fn test_match_autofill_url_custom_field_url_match() {
        // login_url はページと不一致だが、カスタムフィールドURLがマッチする
        let result = match_autofill_url(
            Some("https://example.com"),
            &["https://github.com/login".to_string()],
            "github.com",
            false,
        );
        // login_url が存在するため代表URLとしてそれを返す
        assert_eq!(result.as_deref(), Some("https://example.com"));
    }

    #[test]
    fn test_match_autofill_url_custom_field_only_match() {
        // login_url がなく、カスタムフィールドURLのみでマッチする
        let result = match_autofill_url(
            None,
            &["https://github.com/login".to_string()],
            "github.com",
            false,
        );
        assert_eq!(result.as_deref(), Some("https://github.com/login"));
    }

    #[test]
    fn test_match_autofill_url_etld_plus1_match() {
        // www. 付きのカスタムフィールドURLが eTLD+1 でマッチ
        let result = match_autofill_url(
            None,
            &["https://www.example.com/path".to_string()],
            "m.example.com",
            false,
        );
        assert_eq!(result.as_deref(), Some("https://www.example.com/path"));
    }

    #[test]
    fn test_match_autofill_url_strict_subdomain_match() {
        let result = match_autofill_url(
            None,
            &["https://www.example.com".to_string()],
            "www.example.com",
            true,
        );
        assert_eq!(result.as_deref(), Some("https://www.example.com"));
    }

    #[test]
    fn test_match_autofill_url_strict_subdomain_no_match() {
        // strict_subdomain = true ではサブドメイン違いはマッチしない
        let result = match_autofill_url(
            None,
            &["https://www.example.com".to_string()],
            "m.example.com",
            true,
        );
        assert_eq!(result, None);
    }

    #[test]
    fn test_match_autofill_url_invalid_url_ignored() {
        // extract_host は空文字列を拒否するため、空のURLはマッチ対象外
        let result = match_autofill_url(
            None,
            &["".to_string(), "https://example.com".to_string()],
            "example.com",
            false,
        );
        // 空URLはスキップされ、2番目のURLがマッチする
        assert_eq!(result.as_deref(), Some("https://example.com"));
    }

    #[test]
    fn test_match_autofill_url_multiple_custom_fields() {
        // 複数のカスタムフィールドURLのうち2番目がマッチ
        let result = match_autofill_url(
            None,
            &[
                "https://other.com".to_string(),
                "https://example.com/path".to_string(),
            ],
            "example.com",
            false,
        );
        assert_eq!(result.as_deref(), Some("https://example.com/path"));
    }
}
