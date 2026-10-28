//! エントリ種別ごとのフィールド定義と、詳細表示・編集フォーム用データへの変換。
//!
//! `entry_type` / `field_type` は永続化層では文字列のまま扱う（CLAUDE.md の前方互換性ポリシー）。
//! ここで知らない種別も表示・保存できるよう、未知の値はそのまま通す。

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// 作成ダイアログ・フィルターの並び順
pub const ENTRY_TYPES: [&str; 7] = [
    "login",
    "bank",
    "ssh_key",
    "secure_note",
    "credit_card",
    "password",
    "software_license",
];

pub fn entry_type_label(entry_type: &str) -> String {
    match entry_type {
        "login" => "ログイン",
        "bank" => "銀行口座",
        "ssh_key" => "SSHキー",
        "secure_note" => "セキュアノート",
        "credit_card" => "クレジットカード",
        "password" => "パスワード",
        "software_license" => "ソフトウェアライセンス",
        other => other,
    }
    .to_string()
}

pub fn section_label(entry_type: &str) -> Option<&'static str> {
    Some(match entry_type {
        "login" => "ログイン情報",
        "bank" => "銀行口座",
        "credit_card" => "クレジットカード",
        "ssh_key" => "SSH キー",
        "secure_note" => "ノート",
        "password" => "パスワード情報",
        "software_license" => "ライセンス情報",
        _ => return None,
    })
}

pub fn custom_field_type_label(field_type: &str) -> String {
    match field_type {
        "text" => "テキスト",
        "password" => "パスワード",
        "email" => "メール",
        "url" => "URL",
        "phone" => "電話番号",
        "totp" => "ワンタイムパスワード",
        "passkey" => "パスキー",
        other => other,
    }
    .to_string()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    Text,
    Secret,
    Multiline,
    Markdown,
}

impl FieldKind {
    pub fn as_str(self) -> &'static str {
        match self {
            FieldKind::Text => "text",
            FieldKind::Secret => "secret",
            FieldKind::Multiline => "multiline",
            FieldKind::Markdown => "markdown",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FieldSpec {
    pub key: &'static str,
    pub label: &'static str,
    pub kind: FieldKind,
    pub placeholder: &'static str,
    /// パスワード生成パネルを出すか
    pub generator: bool,
    /// 詳細画面でクリック時にブラウザで開くか
    pub is_url: bool,
}

const fn text(key: &'static str, label: &'static str) -> FieldSpec {
    FieldSpec {
        key,
        label,
        kind: FieldKind::Text,
        placeholder: "",
        generator: false,
        is_url: false,
    }
}

const fn secret(key: &'static str, label: &'static str) -> FieldSpec {
    FieldSpec {
        kind: FieldKind::Secret,
        generator: true,
        ..text(key, label)
    }
}

const fn with_placeholder(spec: FieldSpec, placeholder: &'static str) -> FieldSpec {
    FieldSpec {
        placeholder,
        ..spec
    }
}

/// 種別固有フィールドの定義（旧 EntryForm.renderForm / EntryDetailContent と同じ並び）
pub fn field_specs(entry_type: &str) -> Vec<FieldSpec> {
    match entry_type {
        "login" => vec![
            text("username", "ユーザー名"),
            secret("password", "パスワード"),
            FieldSpec {
                is_url: true,
                ..with_placeholder(text("url", "URL"), "https://example.com")
            },
        ],
        "bank" => vec![
            text("bank_name", "銀行名"),
            text("branch_code", "支店コード"),
            with_placeholder(text("account_type", "口座種別"), "普通 / 当座 / 貯蓄"),
            text("account_holder", "口座名義"),
            text("account_number", "口座番号"),
            secret("pin", "PIN"),
        ],
        "ssh_key" => vec![FieldSpec {
            kind: FieldKind::Multiline,
            ..text("private_key", "秘密鍵")
        }],
        "secure_note" => vec![FieldSpec {
            kind: FieldKind::Markdown,
            ..text("content", "内容")
        }],
        "credit_card" => vec![
            text("cardholder", "カード名義"),
            with_placeholder(text("number", "カード番号"), "1234 5678 9012 3456"),
            with_placeholder(text("expiry", "有効期限"), "MM/YY"),
            FieldSpec {
                generator: false,
                ..with_placeholder(secret("cvv", "CVV"), "123")
            },
            secret("pin", "暗証番号"),
        ],
        "password" => vec![
            text("username", "ユーザー名"),
            secret("password", "パスワード"),
        ],
        "software_license" => vec![text("license_key", "ライセンスキー")],
        _ => vec![],
    }
}

/// typedValue から文字列値を取り出す（null・数値などは空文字扱い）
pub fn typed_string(typed: &Map<String, Value>, key: &str) -> String {
    match typed.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

/// フォームの値で typedValue を組み立てる。
/// 編集時は元の値を土台にして、フォームに出していないキーも消さずに残す。
/// 新規作成時は空欄のキーを含めない（旧実装は触ったキーだけを送っていた）
pub fn build_typed_value(
    original: &Map<String, Value>,
    values: &[(String, String)],
) -> Map<String, Value> {
    let mut typed = original.clone();
    for (key, value) in values {
        if value.is_empty() && !original.contains_key(key) {
            continue;
        }
        typed.insert(key.clone(), Value::String(value.clone()));
    }
    typed
}

// ---------------------------------------------------------------------------
// カスタムフィールド
// ---------------------------------------------------------------------------

/// オートフィル対象の DOM 要素の条件（docs/extension-custom-field-autofill.md 2-1節）
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Selector {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub type_: Option<String>,
}

impl Selector {
    /// 全属性が空なら None に正規化する（「常にマッチしない」無効な状態を保存しない）
    pub fn from_parts(tag: &str, name: &str, id: &str, type_: &str) -> Option<Self> {
        let opt = |s: &str| (!s.is_empty()).then(|| s.to_string());
        let selector = Self {
            tag: opt(tag),
            name: opt(name),
            id: opt(id),
            type_: opt(type_),
        };
        (selector != Self::default()).then_some(selector)
    }

    /// `input[name="account_id"]` 形式の要約（docs/extension-custom-field-autofill.md 4-1節）
    pub fn summary(&self) -> String {
        let tag = self
            .tag
            .as_deref()
            .filter(|t| !t.is_empty())
            .unwrap_or("input");
        let mut out = tag.to_string();
        for (attr, value) in [
            ("name", &self.name),
            ("id", &self.id),
            ("type", &self.type_),
        ] {
            if let Some(v) = value.as_deref().filter(|v| !v.is_empty()) {
                out.push_str(&format!("[{attr}=\"{v}\"]"));
            }
        }
        out
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CustomField {
    pub id: String,
    pub name: String,
    pub field_type: String,
    pub value: String,
    #[serde(default)]
    pub secret: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autofill_selector: Option<Selector>,
    /// このバージョンが知らないキー（将来の版が追加したもの）を落とさずに保存し直すため
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// ユーザーが「秘匿」を切り替えられる型。password / totp / passkey は常に秘匿
pub fn is_secret_toggleable(field_type: &str) -> bool {
    matches!(field_type, "text" | "email" | "url" | "phone")
}

/// 秘匿フィールドかどうか。vault-core が返す secret（保存先）に従う
pub fn is_secret_custom_field(field: &CustomField) -> bool {
    field.secret || !is_secret_toggleable(&field.field_type)
}

pub fn parse_custom_fields(value: &Value) -> Vec<CustomField> {
    serde_json::from_value(value.clone()).unwrap_or_default()
}

#[derive(Debug, Default, Deserialize)]
pub struct PasskeyData {
    pub rp_id: Option<String>,
    pub rp_name: Option<String>,
    pub user_name: Option<String>,
}

/// パスキーの値は秘密鍵を含む JSON なので、表示には識別情報だけを使う
pub fn parse_passkey(value: &str) -> Option<PasskeyData> {
    serde_json::from_str(value).ok()
}

pub fn passkey_summary(value: &str) -> String {
    match parse_passkey(value).and_then(|d| d.rp_id) {
        Some(rp_id) if !rp_id.is_empty() => format!("{rp_id} のパスキー"),
        _ => "パスキー".to_string(),
    }
}

/// 一時的な ID（旧実装の `Math.random().toString(36).substring(7)` 相当）
pub fn random_field_id() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u128(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default(),
    );
    let mut n = hasher.finish();
    let mut id = String::new();
    for _ in 0..6 {
        let digit = (n % 36) as u32;
        id.push(std::char::from_digit(digit, 36).unwrap_or('0'));
        n /= 36;
    }
    id
}

/// 秘匿値のマスク表示（8〜32文字の黒丸）
pub fn mask(value: &str) -> String {
    "•".repeat(value.chars().count().clamp(8, 32))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn selector_summary_matches_extension_format() {
        let s = Selector::from_parts("", "account_id", "", "").unwrap();
        assert_eq!(s.summary(), "input[name=\"account_id\"]");
        let s = Selector::from_parts("select", "a", "b", "c").unwrap();
        assert_eq!(s.summary(), "select[name=\"a\"][id=\"b\"][type=\"c\"]");
        assert_eq!(Selector::from_parts("", "", "", ""), None);
    }

    #[test]
    fn selector_serializes_only_set_attributes() {
        let s = Selector::from_parts("", "n", "", "password").unwrap();
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            json!({"name": "n", "type": "password"})
        );
    }

    #[test]
    fn custom_fields_roundtrip_vault_core_json() {
        let value = json!([
            {"id": "a", "name": "Email", "field_type": "email", "value": "x@y", "secret": false},
            {"id": "b", "name": "PIN", "field_type": "password", "value": "1", "secret": true,
             "autofill_selector": {"name": "pin"}}
        ]);
        let fields = parse_custom_fields(&value);
        assert_eq!(fields.len(), 2);
        assert!(!is_secret_custom_field(&fields[0]));
        assert!(is_secret_custom_field(&fields[1]));
        assert_eq!(
            fields[1].autofill_selector.as_ref().unwrap().summary(),
            "input[name=\"pin\"]"
        );
        let back = serde_json::to_value(&fields).unwrap();
        assert_eq!(back[0].get("autofill_selector"), None);
        assert_eq!(back[1]["autofill_selector"], json!({"name": "pin"}));
    }

    #[test]
    fn unknown_keys_survive_roundtrip() {
        let fields = parse_custom_fields(
            &json!([{"id": "a", "name": "n", "field_type": "text", "value": "v", "future_key": [1]}]),
        );
        assert_eq!(
            serde_json::to_value(&fields).unwrap()[0]["future_key"],
            json!([1])
        );
    }

    #[test]
    fn unknown_field_types_are_kept() {
        let fields = parse_custom_fields(
            &json!([{"id": "z", "name": "n", "field_type": "future", "value": "v"}]),
        );
        assert_eq!(fields[0].field_type, "future");
        // 未知の型は秘匿扱い（切り替え不可の型と同じ）
        assert!(is_secret_custom_field(&fields[0]));
    }

    #[test]
    fn build_typed_value_keeps_unknown_keys_and_skips_untouched_empty() {
        let original = json!({"username": "u", "legacy": 1, "url": null})
            .as_object()
            .unwrap()
            .clone();
        let typed = build_typed_value(
            &original,
            &[
                ("username".into(), "new".into()),
                ("password".into(), "".into()),
                ("url".into(), "".into()),
            ],
        );
        assert_eq!(typed["username"], "new");
        assert_eq!(typed["legacy"], 1);
        assert_eq!(typed["url"], "");
        assert!(!typed.contains_key("password"));
    }

    #[test]
    fn passkey_summary_never_exposes_value() {
        let value = r#"{"rp_id":"example.com","private_key":"SECRET"}"#;
        assert_eq!(passkey_summary(value), "example.com のパスキー");
        assert_eq!(passkey_summary("not json"), "パスキー");
    }

    #[test]
    fn mask_length_is_clamped() {
        assert_eq!(mask("ab").chars().count(), 8);
        assert_eq!(mask(&"x".repeat(100)).chars().count(), 32);
    }

    #[test]
    fn every_known_type_has_specs_and_labels() {
        for t in ENTRY_TYPES {
            assert!(!field_specs(t).is_empty(), "{t}");
            assert!(section_label(t).is_some(), "{t}");
            assert_ne!(entry_type_label(t), t);
        }
        assert!(field_specs("future").is_empty());
        assert_eq!(entry_type_label("future"), "future");
    }

    #[test]
    fn random_ids_are_short_base36() {
        let id = random_field_id();
        assert_eq!(id.len(), 6);
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric()));
    }
}
