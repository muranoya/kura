//! エントリの値を index（非秘匿値）と secret（秘匿値）へ振り分ける処理
//! （`docs/vault-format-v2.md` 4章）。
//!
//! どのフィールドが秘匿値かは、書き込むクライアント（ここ）が決めてデータに記録する。
//! 読む側（`combine_*`）はデータの配置に従うだけなので、知らないエントリタイプ・
//! フィールドタイプでも正しく表示・検索・マージできる。
use std::collections::BTreeMap;

use crate::error::{Result, VaultError};
use crate::models::{CustomField, PasskeyFieldData, PasskeyPublicData};
use crate::secret::{PublicJson, PublicString, SecretJson, SecretString};
use zeroize::Zeroizing;

use super::{EntrySecret, IndexCustomField, VaultEntry};

/// 既知のエントリタイプについて、typed_value のうち index に置く（検索対象とする）
/// 非秘匿フィールドを返す。ここに列挙していないフィールドはすべて secret に置く。
/// 未知のエントリタイプでは None（書き込んだクライアントの配置に従う）。
pub fn public_typed_value_keys(entry_type: &str) -> Option<&'static [&'static str]> {
    match entry_type {
        "login" => Some(&["url", "username"]),
        "password" => Some(&["username"]),
        "bank" => Some(&["bank_name", "branch_code", "account_type", "account_holder"]),
        "credit_card" => Some(&["cardholder", "expiry"]),
        "ssh_key" | "secure_note" | "software_license" => Some(&[]),
        _ => None,
    }
}

/// index の値（`secret == false` の場合）を検索対象とするカスタムフィールドの型
pub fn is_searchable_custom_field_type(field_type: &str) -> bool {
    matches!(field_type, "text" | "email" | "url" | "phone")
}

/// typed_value（JSON オブジェクト文字列）を index 側と secret 側に分ける。
///
/// 既知のタイプは `public_typed_value_keys` の表に従う。未知のタイプは、
/// `previous_public` に既にあるキーだけを index に残し、それ以外は secret に置く
/// （どれが非秘匿値か判断できないため、安全側に倒す）。
pub fn split_typed_value(
    entry_type: &str,
    typed_value_json: &str,
    previous_public: Option<&BTreeMap<String, PublicJson>>,
) -> Result<(BTreeMap<String, PublicJson>, BTreeMap<String, SecretJson>)> {
    let value: serde_json::Value =
        serde_json::from_str(typed_value_json).map_err(VaultError::JsonError)?;
    let serde_json::Value::Object(object) = value else {
        return Err(VaultError::InvalidInput(
            "typed_value must be a JSON object".to_string(),
        ));
    };

    let known_public = public_typed_value_keys(entry_type);
    let mut public = BTreeMap::new();
    let mut secret = BTreeMap::new();
    // 値は所有権ごと移すので、平文の複製は作らない
    for (key, value) in object {
        let is_public = match known_public {
            Some(keys) => keys.contains(&key.as_str()),
            None => previous_public.is_some_and(|p| p.contains_key(&key)),
        };
        if is_public {
            public.insert(key, PublicJson::from_value(value));
        } else {
            secret.insert(key, SecretJson::from_value(value));
        }
    }
    Ok((public, secret))
}

/// index 側と secret 側の typed_value を 1 つの JSON オブジェクト文字列に戻す
pub fn combine_typed_value(
    public: &BTreeMap<String, PublicJson>,
    secret: &BTreeMap<String, SecretJson>,
) -> Result<Zeroizing<String>> {
    struct Merged<'a> {
        public: &'a BTreeMap<String, PublicJson>,
        secret: &'a BTreeMap<String, SecretJson>,
    }

    impl serde::Serialize for Merged<'_> {
        fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
            use serde::ser::SerializeMap;
            let mut map = s.serialize_map(None)?;
            for (key, value) in self.public {
                // 同じキーが両側にある場合（通常は起きない）は secret 側を正とする
                if !self.secret.contains_key(key) {
                    map.serialize_entry(key, value)?;
                }
            }
            for (key, value) in self.secret {
                map.serialize_entry(key, value)?;
            }
            map.end()
        }
    }

    let mut buf = crate::secret::to_json_zeroizing(&Merged { public, secret })
        .map_err(VaultError::JsonError)?;
    let json = String::from_utf8(std::mem::take(&mut *buf))
        .map_err(|_| VaultError::InvalidInput("typed_value is not valid UTF-8".to_string()))?;
    Ok(Zeroizing::new(json))
}

/// カスタムフィールドの `secret` 属性を正規化する。
/// password / totp / passkey は常に true。text / email / url / phone はユーザーの指定に従う。
/// 未知の型は既存の配置に従い、新規なら secret に置く。
fn normalized_secret_flag(field: &CustomField, previous: Option<&IndexCustomField>) -> bool {
    if let Some(fixed) = CustomField::fixed_secret_flag(&field.field_type) {
        return fixed;
    }
    if is_searchable_custom_field_type(&field.field_type) {
        return field.secret;
    }
    previous.map(|p| p.secret).unwrap_or(true)
}

/// カスタムフィールドを index 側（メタデータと公開部）と secret 側（field_id → 秘匿値）に分ける。
/// `previous` は更新前の index 上のフィールドで、未知の型の配置と未知の属性の引き継ぎに使う。
pub fn split_custom_fields(
    fields: &[CustomField],
    previous: &[IndexCustomField],
) -> (Vec<IndexCustomField>, BTreeMap<String, SecretString>) {
    let mut index_fields = Vec::with_capacity(fields.len());
    let mut secret_values = BTreeMap::new();

    for field in fields {
        let prev = previous.iter().find(|p| p.id == field.id);
        let secret = normalized_secret_flag(field, prev);

        let public_value = if !secret {
            Some(PublicString::new(field.value.as_str()))
        } else {
            let (public_part, secret_part) = split_secret_custom_value(field, prev);
            secret_values.insert(field.id.clone(), secret_part);
            public_part
        };

        index_fields.push(IndexCustomField {
            id: field.id.clone(),
            name: PublicString::new(field.name.as_str()),
            field_type: field.field_type.clone(),
            secret,
            value: public_value,
            autofill_selector: field.autofill_selector.clone(),
            extra: prev.map(|p| p.extra.clone()).unwrap_or_default(),
        });
    }

    (index_fields, secret_values)
}

/// `secret == true` のカスタムフィールドの値を、index に置く公開部と secret に置く値に分ける
fn split_secret_custom_value(
    field: &CustomField,
    previous: Option<&IndexCustomField>,
) -> (Option<PublicString>, SecretString) {
    let value = field.value.as_str();
    match field.field_type.as_str() {
        // 周期を公開部に持ち、一覧画面のカウントダウン表示で secret を復号せずに済むようにする
        "totp" => {
            let period = crate::totp::parse_totp_period(value);
            (
                Some(PublicString::new(
                    serde_json::json!({ "period": period }).to_string(),
                )),
                SecretString::from_string(value.to_string()),
            )
        }
        // 公開部を index に置き、RP ごとの候補列挙で秘密鍵を復号せずに済むようにする
        "passkey" => match split_passkey_value(value) {
            Some((public_json, private_key)) => (Some(PublicString::new(public_json)), private_key),
            // 解釈できない値は丸ごと secret に置き、既存の公開部はそのまま残す
            None => (
                previous.and_then(|p| p.value.clone()),
                SecretString::from_string(value.to_string()),
            ),
        },
        // 未知の型の公開部は解釈できないので、既存の公開部をそのまま残す
        field_type
            if CustomField::fixed_secret_flag(field_type).is_none()
                && !is_searchable_custom_field_type(field_type) =>
        {
            (
                previous.and_then(|p| p.value.clone()),
                SecretString::from_string(value.to_string()),
            )
        }
        _ => (None, SecretString::from_string(value.to_string())),
    }
}

/// index 側と secret 側のカスタムフィールドを、表示用の `CustomField` に戻す
pub fn combine_custom_fields(
    index_fields: &[IndexCustomField],
    secret_values: &BTreeMap<String, SecretString>,
) -> Vec<CustomField> {
    index_fields
        .iter()
        .map(|f| {
            let public = f.value.as_ref().map(|v| v.as_str());
            let secret = secret_values.get(&f.id).map(|v| v.as_str());
            let value = if !f.secret {
                SecretString::from_string(public.unwrap_or_default().to_string())
            } else if f.field_type == "passkey" {
                combine_passkey_value(public, secret)
            } else {
                SecretString::from_string(secret.or(public).unwrap_or_default().to_string())
            };
            CustomField {
                id: f.id.clone(),
                name: f.name.to_string(),
                field_type: f.field_type.clone(),
                value,
                secret: f.secret,
                autofill_selector: f.autofill_selector.clone(),
            }
        })
        .collect()
}

/// passkey の値で秘密鍵を持つキー。それ以外のキーはすべて公開部として index に置く
const PASSKEY_PRIVATE_KEY: &str = "private_key";

/// passkey の値（JSON オブジェクト）を、`private_key` を除いた公開部の JSON と秘密鍵に分ける。
/// 公開部は構造体を経由せずオブジェクトのまま扱い、新しいクライアントが追加したキーも残す。
/// JSON オブジェクトでない、または `private_key` が文字列でなければ None
fn split_passkey_value(value: &str) -> Option<(String, SecretString)> {
    // 秘密鍵を含むので、途中で抜けてもゼロ化されるようにしておく
    let mut parsed = SecretJson::from_value(serde_json::from_str(value).ok()?);
    let object = parsed.value_mut().as_object_mut()?;
    let private_key = match object.remove(PASSKEY_PRIVATE_KEY)? {
        serde_json::Value::String(private_key) => SecretString::from_string(private_key),
        other => {
            // 取り出した値もゼロ化されるよう、元に戻してから抜ける
            object.insert(PASSKEY_PRIVATE_KEY.to_string(), other);
            return None;
        }
    };
    let public_json = serde_json::to_string(object).ok()?;
    Some((public_json, private_key))
}

fn combine_passkey_value(public: Option<&str>, secret: Option<&str>) -> SecretString {
    /// 公開部のオブジェクトに `private_key` を足して 1 つのオブジェクトとして書き出す
    /// （秘密鍵を JSON 値に複製しない）
    struct Combined<'a> {
        public: &'a serde_json::Map<String, serde_json::Value>,
        private_key: &'a str,
    }

    impl serde::Serialize for Combined<'_> {
        fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
            use serde::ser::SerializeMap;
            let mut map = s.serialize_map(None)?;
            for (key, value) in self.public {
                if key != PASSKEY_PRIVATE_KEY {
                    map.serialize_entry(key, value)?;
                }
            }
            map.serialize_entry(PASSKEY_PRIVATE_KEY, self.private_key)?;
            map.end()
        }
    }

    let parsed = public.and_then(|p| match serde_json::from_str(p) {
        Ok(serde_json::Value::Object(object)) => Some(object),
        _ => None,
    });
    match (parsed, secret) {
        (Some(public), Some(private_key)) => crate::secret::to_json_secret_string(&Combined {
            public: &public,
            private_key,
        })
        .unwrap_or_else(|_| SecretString::from_string(String::new())),
        // 分割できずに丸ごと secret に置いた値
        (None, Some(raw)) => SecretString::from_string(raw.to_string()),
        (_, None) => SecretString::from_string(public.unwrap_or_default().to_string()),
    }
}

/// index 上の Passkey フィールドと secret から、署名に使う `PasskeyFieldData` を取り出す。
/// 表示用の JSON 文字列を経由しないため、秘密鍵の平文を余分に複製しない
pub fn passkey_field_data(
    field: &IndexCustomField,
    secret_values: &BTreeMap<String, SecretString>,
) -> Result<PasskeyFieldData> {
    let secret = secret_values
        .get(&field.id)
        .ok_or_else(|| VaultError::CorruptedEntry(field.id.clone()))?;
    let public = field
        .value
        .as_ref()
        .and_then(|p| PasskeyPublicData::from_json_string(p.as_str()).ok());
    match public {
        Some(public) => Ok(PasskeyFieldData::from_parts(public, secret.clone())),
        // 分割できずに丸ごと secret に置いた値
        None => PasskeyFieldData::from_json_string(secret.as_str()),
    }
}

/// index 上のエントリ（`VaultEntry`）と復号済みの `EntrySecret` から、
/// 表示・編集用の `EntryData` を復元する
pub fn combine_entry_data(
    entry: &VaultEntry,
    secret: &EntrySecret,
) -> Result<crate::models::EntryData> {
    let typed_value_json = combine_typed_value(&entry.public_fields, &secret.fields)?;
    let typed_value = crate::models::TypedValue::parse(&entry.entry_type, &typed_value_json)?;
    let custom_fields = combine_custom_fields(&entry.custom_fields, &secret.custom_fields);
    Ok(crate::models::EntryData {
        entry_type: entry.entry_type.clone(),
        notes: secret.notes.clone(),
        typed_value,
        custom_fields: (!custom_fields.is_empty()).then_some(custom_fields),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field(id: &str, field_type: &str, value: &str, secret: bool) -> CustomField {
        CustomField {
            id: id.to_string(),
            name: format!("name-{}", id),
            field_type: field_type.to_string(),
            value: SecretString::from_string(value.to_string()),
            secret,
            autofill_selector: None,
        }
    }

    #[test]
    fn test_split_login_typed_value() {
        let (public, secret) = split_typed_value(
            "login",
            r#"{"url":"https://example.com","username":"user","password":"pw"}"#,
            None,
        )
        .unwrap();
        assert_eq!(public.keys().collect::<Vec<_>>(), vec!["url", "username"]);
        assert_eq!(secret.keys().collect::<Vec<_>>(), vec!["password"]);
    }

    #[test]
    fn test_split_known_types_follow_table() {
        let cases: &[(&str, &str, &[&str], &[&str])] = &[
            (
                "password",
                r#"{"username":"u","password":"p"}"#,
                &["username"],
                &["password"],
            ),
            (
                "bank",
                r#"{"bank_name":"b","branch_code":"001","account_type":"t","account_holder":"h","account_number":"123","pin":"9"}"#,
                &["account_holder", "account_type", "bank_name", "branch_code"],
                &["account_number", "pin"],
            ),
            (
                "credit_card",
                r#"{"cardholder":"c","expiry":"12/30","number":"4111","cvv":"123","pin":"0"}"#,
                &["cardholder", "expiry"],
                &["cvv", "number", "pin"],
            ),
            ("ssh_key", r#"{"private_key":"k"}"#, &[], &["private_key"]),
            ("secure_note", r#"{"content":"c"}"#, &[], &["content"]),
            (
                "software_license",
                r#"{"license_key":"k"}"#,
                &[],
                &["license_key"],
            ),
        ];
        for (entry_type, json, expected_public, expected_secret) in cases {
            let (public, secret) = split_typed_value(entry_type, json, None).unwrap();
            assert_eq!(
                public.keys().map(String::as_str).collect::<Vec<_>>(),
                *expected_public,
                "{}",
                entry_type
            );
            assert_eq!(
                secret.keys().map(String::as_str).collect::<Vec<_>>(),
                *expected_secret,
                "{}",
                entry_type
            );
        }
    }

    #[test]
    fn test_split_unknown_type_defaults_to_secret() {
        let (public, secret) =
            split_typed_value("wifi", r#"{"ssid":"home","password":"p"}"#, None).unwrap();
        assert!(public.is_empty());
        assert_eq!(secret.len(), 2);
    }

    #[test]
    fn test_split_unknown_type_follows_previous_placement() {
        let mut previous = BTreeMap::new();
        previous.insert(
            "ssid".to_string(),
            PublicJson::from_value(serde_json::json!("old")),
        );
        let (public, secret) = split_typed_value(
            "wifi",
            r#"{"ssid":"home","password":"p","new_key":1}"#,
            Some(&previous),
        )
        .unwrap();
        assert_eq!(public.keys().collect::<Vec<_>>(), vec!["ssid"]);
        assert_eq!(
            secret.keys().collect::<Vec<_>>(),
            vec!["new_key", "password"]
        );
    }

    #[test]
    fn test_split_rejects_non_object() {
        assert!(split_typed_value("login", "[]", None).is_err());
    }

    #[test]
    fn test_typed_value_roundtrip() {
        let json = r#"{"url":null,"username":"user","password":"pw"}"#;
        let (public, secret) = split_typed_value("login", json, None).unwrap();
        let combined = combine_typed_value(&public, &secret).unwrap();
        let a: serde_json::Value = serde_json::from_str(json).unwrap();
        let b: serde_json::Value = serde_json::from_str(&combined).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn test_split_custom_fields_by_secret_flag() {
        let fields = vec![
            field("a", "text", "visible", false),
            field("b", "text", "hidden", true),
            field("c", "password", "pw", false),
            field("d", "email", "x@example.com", false),
        ];
        let (index, secrets) = split_custom_fields(&fields, &[]);

        assert!(!index[0].secret);
        assert_eq!(index[0].value.as_deref(), Some("visible"));
        assert!(index[1].secret);
        assert!(index[1].value.is_none());
        // password 型は secret == false を指定しても secret に置く
        assert!(index[2].secret);
        assert!(index[2].value.is_none());
        assert!(!index[3].secret);

        assert_eq!(secrets.keys().collect::<Vec<_>>(), vec!["b", "c"]);
        assert_eq!(secrets["b"].as_str(), "hidden");
    }

    #[test]
    fn test_split_totp_keeps_period_public() {
        let uri = "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=60";
        let (index, secrets) = split_custom_fields(&[field("t", "totp", uri, false)], &[]);
        assert!(index[0].secret);
        let public: serde_json::Value =
            serde_json::from_str(index[0].value.as_deref().unwrap()).unwrap();
        assert_eq!(public["period"], 60);
        assert!(!index[0]
            .value
            .as_deref()
            .unwrap()
            .contains("JBSWY3DPEHPK3PXP"));
        assert_eq!(secrets["t"].as_str(), uri);

        let combined = combine_custom_fields(&index, &secrets);
        assert_eq!(combined[0].value.as_str(), uri);
    }

    #[test]
    fn test_split_passkey_keeps_private_key_secret() {
        let passkey = PasskeyFieldData {
            rp_id: "example.com".to_string(),
            rp_name: None,
            user_handle: "h".to_string(),
            user_name: "u".to_string(),
            user_display_name: "U".to_string(),
            credential_id: "cid".to_string(),
            private_key: SecretString::from_string("PRIVATE".to_string()),
        };
        let value = passkey.to_json_string().unwrap();
        let (index, secrets) =
            split_custom_fields(&[field("p", "passkey", value.as_str(), false)], &[]);
        let public = index[0].value.as_deref().unwrap();
        assert!(!public.contains("PRIVATE"));
        assert!(public.contains("example.com"));
        assert_eq!(secrets["p"].as_str(), "PRIVATE");

        let combined = combine_custom_fields(&index, &secrets);
        let restored = PasskeyFieldData::from_json_string(combined[0].value.as_str()).unwrap();
        assert_eq!(restored.private_key.as_str(), "PRIVATE");
        assert_eq!(restored.credential_id, "cid");
        assert!(combined[0].secret);
    }

    #[test]
    fn test_split_unparseable_passkey_goes_to_secret_whole() {
        let (index, secrets) =
            split_custom_fields(&[field("p", "passkey", "not json", false)], &[]);
        assert!(index[0].value.is_none());
        assert_eq!(secrets["p"].as_str(), "not json");
        let combined = combine_custom_fields(&index, &secrets);
        assert_eq!(combined[0].value.as_str(), "not json");
    }

    /// index 上の passkey フィールド（公開部は `public_json`、秘密鍵は "PRIVATE"）と、
    /// それを表示用に戻したものを、編集せずに保存し直した結果を返す
    fn resave_passkey(
        public_json: &str,
    ) -> (Vec<IndexCustomField>, BTreeMap<String, SecretString>) {
        let index = vec![IndexCustomField {
            id: "p".to_string(),
            name: PublicString::new("Passkey"),
            field_type: "passkey".to_string(),
            secret: true,
            value: Some(PublicString::new(public_json)),
            autofill_selector: None,
            extra: Default::default(),
        }];
        let secrets = BTreeMap::from([(
            "p".to_string(),
            SecretString::from_string("PRIVATE".to_string()),
        )]);
        let combined = combine_custom_fields(&index, &secrets);
        split_custom_fields(&combined, &index)
    }

    #[test]
    fn test_resave_passkey_preserves_unknown_public_keys() {
        // 新しいクライアントが公開部に追加したキーを、編集しただけで失わない
        let public = r#"{"rp_id":"example.com","user_handle":"h","user_name":"u","user_display_name":"U","credential_id":"cid","algorithm":-8}"#;
        let (index, secrets) = resave_passkey(public);
        let saved: serde_json::Value =
            serde_json::from_str(index[0].value.as_deref().unwrap()).unwrap();
        assert_eq!(saved["algorithm"], -8);
        assert_eq!(saved["credential_id"], "cid");
        assert_eq!(secrets["p"].as_str(), "PRIVATE");
    }

    #[test]
    fn test_resave_passkey_with_unparseable_public_part_keeps_it() {
        // 公開部を解釈できなくても（必須キーの欠落など）、編集しただけで公開部を失わない
        let public =
            r#"{"rp_id":"example.com","user_handle":"h","user_name":"u","credential_id":"cid"}"#;
        let (index, secrets) = resave_passkey(public);
        let saved: serde_json::Value =
            serde_json::from_str(index[0].value.as_deref().unwrap()).unwrap();
        assert_eq!(
            saved,
            serde_json::from_str::<serde_json::Value>(public).unwrap()
        );
        assert_eq!(secrets["p"].as_str(), "PRIVATE");
    }

    #[test]
    fn test_resave_passkey_with_non_json_public_part_keeps_it() {
        let (index, secrets) = resave_passkey("not json");
        assert_eq!(index[0].value.as_deref(), Some("not json"));
        assert_eq!(secrets["p"].as_str(), "PRIVATE");
    }

    #[test]
    fn test_split_unknown_field_type() {
        // 新規の未知タイプは secret に置く
        let (index, secrets) = split_custom_fields(&[field("u", "date", "2000", false)], &[]);
        assert!(index[0].secret);
        assert_eq!(secrets["u"].as_str(), "2000");

        // 既存の配置（非秘匿）があればそれに従う
        let mut previous = index[0].clone();
        previous.secret = false;
        previous.value = Some(PublicString::new("1999"));
        let (index, secrets) =
            split_custom_fields(&[field("u", "date", "2001", false)], &[previous]);
        assert!(!index[0].secret);
        assert_eq!(index[0].value.as_deref(), Some("2001"));
        assert!(secrets.is_empty());
    }

    #[test]
    fn test_split_custom_fields_preserves_order_and_extra() {
        let mut previous = split_custom_fields(&[field("b", "text", "x", false)], &[])
            .0
            .remove(0);
        previous
            .extra
            .insert("future".to_string(), serde_json::json!(1));
        let fields = vec![
            field("c", "text", "1", false),
            field("b", "text", "2", false),
        ];
        let (index, _) = split_custom_fields(&fields, &[previous]);
        assert_eq!(
            index.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(),
            vec!["c", "b"]
        );
        assert_eq!(index[1].extra["future"], 1);
    }
}
