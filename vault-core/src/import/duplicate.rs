use crate::store::VaultEntry;

use super::{DuplicateCandidate, DuplicateConfidence};
use super::onepux::types::ParsedItem;

/// Detect duplicate candidates for a parsed item against existing vault entries.
pub fn detect_duplicates(
    item: &ParsedItem,
    target_entry_type: &str,
    existing_entries: &[(&str, &VaultEntry)],
) -> Vec<DuplicateCandidate> {
    let mut candidates = Vec::new();

    let item_name_normalized = normalize_name(&item.title);
    let item_url_domain = item.url.as_deref().and_then(|u| extract_domain(u));

    for &(id, entry) in existing_entries {
        // Skip deleted/purged entries
        if entry.deleted_at.is_some() {
            continue;
        }

        // Try High confidence first
        if let Some(reason) = check_high_confidence(item, target_entry_type, entry) {
            candidates.push(DuplicateCandidate {
                existing_entry_id: id.to_string(),
                existing_entry_name: entry.name.clone(),
                existing_entry_type: entry.entry_type.clone(),
                confidence: DuplicateConfidence::High,
                reason,
            });
            continue;
        }

        // Medium confidence
        let entry_name_normalized = normalize_name(&entry.name);
        if entry_name_normalized == item_name_normalized && !item_name_normalized.is_empty()
            && entry.entry_type == target_entry_type
        {
            candidates.push(DuplicateCandidate {
                existing_entry_id: id.to_string(),
                existing_entry_name: entry.name.clone(),
                existing_entry_type: entry.entry_type.clone(),
                confidence: DuplicateConfidence::Medium,
                reason: "同一名 + 同一タイプ".to_string(),
            });
            continue;
        }

        // Medium: Login domain match
        if target_entry_type == "login" && entry.entry_type == "login" {
            if let Some(ref item_domain) = item_url_domain {
                if let Some(entry_domain) = get_entry_url_domain(entry) {
                    if *item_domain == entry_domain && !item_domain.is_empty() {
                        candidates.push(DuplicateCandidate {
                            existing_entry_id: id.to_string(),
                            existing_entry_name: entry.name.clone(),
                            existing_entry_type: entry.entry_type.clone(),
                            confidence: DuplicateConfidence::Medium,
                            reason: format!("同一ドメイン: {}", item_domain),
                        });
                        continue;
                    }
                }
            }
        }

        // Low confidence: name match only (different types)
        if entry_name_normalized == item_name_normalized && !item_name_normalized.is_empty() {
            candidates.push(DuplicateCandidate {
                existing_entry_id: id.to_string(),
                existing_entry_name: entry.name.clone(),
                existing_entry_type: entry.entry_type.clone(),
                confidence: DuplicateConfidence::Low,
                reason: "名前が一致".to_string(),
            });
        }
    }

    // Sort by confidence (High first)
    candidates.sort_by_key(|c| match c.confidence {
        DuplicateConfidence::High => 0,
        DuplicateConfidence::Medium => 1,
        DuplicateConfidence::Low => 2,
    });

    candidates
}

fn check_high_confidence(item: &ParsedItem, target_type: &str, entry: &VaultEntry) -> Option<String> {
    if entry.entry_type != target_type {
        return None;
    }

    let typed_value: serde_json::Value = serde_json::from_str(entry.typed_value.as_ref()).ok()?;

    match target_type {
        "login" | "password" => {
            let entry_url = typed_value.get("url").and_then(|v| v.as_str());
            let entry_username = typed_value.get("username").and_then(|v| v.as_str());

            let item_domain = item.url.as_deref().and_then(|u| extract_domain(u));
            let entry_domain = entry_url.and_then(|u| extract_domain(u));

            if let (Some(id), Some(ed)) = (&item_domain, &entry_domain) {
                if id == ed {
                    if let (Some(iu), Some(eu)) = (&item.username, entry_username) {
                        if iu == eu {
                            return Some(format!("URL + ユーザー名一致: {}@{}", iu, id));
                        }
                    }
                }
            }
            None
        }
        "credit_card" => {
            let entry_number = typed_value.get("number").and_then(|v| v.as_str()).unwrap_or("");
            let entry_holder = typed_value.get("cardholder").and_then(|v| v.as_str()).unwrap_or("");

            let item_number = find_field(item, &["card number", "number", "ccnum"]).unwrap_or_default();
            let item_holder = find_field(item, &["cardholder name", "cardholder"]).unwrap_or_default();

            let entry_last4 = last_n(entry_number, 4);
            let item_last4 = last_n(&item_number, 4);

            if !entry_last4.is_empty() && entry_last4 == item_last4
                && !entry_holder.is_empty() && entry_holder.to_lowercase() == item_holder.to_lowercase()
            {
                return Some(format!("カード下4桁 + 名義一致: ****{}", entry_last4));
            }
            None
        }
        "bank" => {
            let entry_account = typed_value.get("account_number").and_then(|v| v.as_str()).unwrap_or("");
            let entry_branch = typed_value.get("branch_code").and_then(|v| v.as_str()).unwrap_or("");

            let item_account = find_field(item, &["account number"]).unwrap_or_default();
            let item_branch = find_field(item, &["routing number", "branch code", "sort code"]).unwrap_or_default();

            if !entry_account.is_empty() && entry_account == item_account
                && !entry_branch.is_empty() && entry_branch == item_branch
            {
                return Some("口座番号 + 支店コード一致".to_string());
            }
            None
        }
        "ssh_key" => {
            let entry_key = typed_value.get("private_key").and_then(|v| v.as_str()).unwrap_or("");
            let item_key = find_field(item, &["private key"]).unwrap_or_default();

            let entry_prefix = &entry_key[..entry_key.len().min(64)];
            let item_prefix = &item_key[..item_key.len().min(64)];

            if !entry_prefix.is_empty() && entry_prefix == item_prefix {
                return Some("秘密鍵の先頭一致".to_string());
            }
            None
        }
        "software_license" => {
            let entry_key = typed_value.get("license_key").and_then(|v| v.as_str()).unwrap_or("");
            let item_key = find_field(item, &["license key", "reg code", "product key", "key"]).unwrap_or_default();

            if !entry_key.is_empty() && entry_key == item_key {
                return Some("ライセンスキー一致".to_string());
            }
            None
        }
        _ => None,
    }
}

fn find_field(item: &ParsedItem, names: &[&str]) -> Option<String> {
    for field in &item.fields {
        let title_lower = field.field_title.to_lowercase();
        for name in names {
            if title_lower == *name {
                let val = field.value.to_string_value();
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
    }
    None
}

/// Normalize a name for comparison: lowercase + trim whitespace.
fn normalize_name(name: &str) -> String {
    name.trim().to_lowercase()
}

/// Extract domain from a URL, removing scheme, www prefix, port, and path.
pub fn extract_domain(url: &str) -> Option<String> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }

    // Remove scheme
    let without_scheme = if let Some(pos) = url.find("://") {
        &url[pos + 3..]
    } else {
        url
    };

    // Remove path
    let without_path = without_scheme.split('/').next().unwrap_or(without_scheme);

    // Remove port
    let without_port = if let Some(pos) = without_path.rfind(':') {
        // Make sure the part after ':' is actually a port number
        if without_path[pos + 1..].chars().all(|c| c.is_ascii_digit()) {
            &without_path[..pos]
        } else {
            without_path
        }
    } else {
        without_path
    };

    // Remove www. prefix
    let domain = without_port.strip_prefix("www.").unwrap_or(without_port);

    if domain.is_empty() {
        None
    } else {
        Some(domain.to_lowercase())
    }
}

fn get_entry_url_domain(entry: &VaultEntry) -> Option<String> {
    let typed_value: serde_json::Value = serde_json::from_str(entry.typed_value.as_ref()).ok()?;
    let url = typed_value.get("url").and_then(|v| v.as_str())?;
    extract_domain(url)
}

fn last_n(s: &str, n: usize) -> String {
    let chars: Vec<char> = s.chars().filter(|c| c.is_ascii_digit()).collect();
    if chars.len() >= n {
        chars[chars.len() - n..].iter().collect()
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_domain() {
        assert_eq!(extract_domain("https://www.example.com/login"), Some("example.com".into()));
        assert_eq!(extract_domain("http://example.com:8080/path"), Some("example.com".into()));
        assert_eq!(extract_domain("https://sub.example.com"), Some("sub.example.com".into()));
        assert_eq!(extract_domain("example.com"), Some("example.com".into()));
        assert_eq!(extract_domain(""), None);
    }

    #[test]
    fn test_normalize_name() {
        assert_eq!(normalize_name("  Example Login  "), "example login");
        assert_eq!(normalize_name("GitHub"), "github");
    }

    #[test]
    fn test_last_n() {
        assert_eq!(last_n("4111111111111111", 4), "1111");
        assert_eq!(last_n("4111-1111-1111-2345", 4), "2345");
        assert_eq!(last_n("12", 4), "");
    }
}
