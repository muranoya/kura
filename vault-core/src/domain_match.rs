//! URL/ホスト名のドメイン一致判定。
//!
//! Public Suffix List (PSL) を用いた eTLD+1 正規化により、`www.example.com` と
//! `m.example.com` のような兄弟サブドメイン同士も同一サイトとして扱う。
//! アルゴリズムは `extension/src/shared/etld.ts` の実装を移植したもの。
//!
//! PSLデータはリポジトリ直下 `assets/public_suffix_list.dat`
//! （`extension/scripts/update-psl.ts` が定期更新する共有ファイル）をビルド時に
//! 埋め込み、初回呼び出し時に一度だけパースしてキャッシュする。

use std::collections::HashSet;
use std::sync::OnceLock;

const PSL_RAW: &str = include_str!("../../assets/public_suffix_list.dat");

struct PslData {
    rules: HashSet<String>,
    wildcards: HashSet<String>,
    exceptions: HashSet<String>,
}

static PSL_DATA: OnceLock<PslData> = OnceLock::new();

fn parse_psl(content: &str) -> PslData {
    let mut rules = HashSet::new();
    let mut wildcards = HashSet::new();
    let mut exceptions = HashSet::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with("//") {
            continue;
        }

        if let Some(rest) = line.strip_prefix('!') {
            exceptions.insert(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("*.") {
            wildcards.insert(rest.to_string());
        } else {
            rules.insert(line.to_string());
        }
    }

    PslData {
        rules,
        wildcards,
        exceptions,
    }
}

fn psl_data() -> &'static PslData {
    PSL_DATA.get_or_init(|| parse_psl(PSL_RAW))
}

/// PSLルールに基づき、末尾から見た eTLD のラベル数を求める。
///
/// 1. 例外ルール（`!X.Y.Z`）が最優先。マッチした場合 eTLD長 = マッチ部分のラベル数 - 1
/// 2. ワイルドカードルール（`*.X`）。親ドメインがマッチすればそのラベル数を採用
/// 3. 通常ルール。最長一致
/// 4. デフォルト: 最後のラベルのみをTLDとみなす（長さ1）
fn find_etld_length(labels: &[&str]) -> usize {
    let psl = psl_data();

    for i in 0..labels.len() {
        let candidate = labels[i..].join(".");
        if psl.exceptions.contains(candidate.as_str()) {
            return labels.len() - i - 1;
        }
    }

    for i in 0..labels.len() {
        let candidate = labels[i..].join(".");
        if psl.rules.contains(candidate.as_str()) {
            return labels.len() - i;
        }

        if i + 1 < labels.len() {
            let parent = labels[i + 1..].join(".");
            if psl.wildcards.contains(parent.as_str()) {
                return labels.len() - i;
            }
        }
    }

    1
}

/// ホスト名から eTLD+1（登録可能ドメイン）を抽出する。
///
/// 例:
///   "login.example.com"  -> "example.com"
///   "www.example.co.jp"  -> "example.co.jp"
///   "sub.blogspot.com"   -> "sub.blogspot.com"（blogspot.comはワイルドカード公開サフィックス）
///   "example.com"        -> "example.com"
pub fn extract_etld_plus1(hostname: &str) -> String {
    let hostname_lower = hostname.to_lowercase();
    let labels: Vec<&str> = hostname_lower.split('.').collect();
    if labels.len() <= 1 {
        return hostname_lower;
    }

    let etld_length = find_etld_length(&labels);
    let etld_plus1_length = etld_length + 1;

    if etld_plus1_length > labels.len() {
        // ホスト名自体が公開サフィックス（例: "com", "co.uk"）
        return hostname_lower;
    }

    labels[labels.len() - etld_plus1_length..].join(".")
}

/// 2つのホスト名が同一の eTLD+1 を持つか判定する。
pub fn same_etld_plus1(a: &str, b: &str) -> bool {
    extract_etld_plus1(a) == extract_etld_plus1(b)
}

/// WebAuthnの`rp.id`が検証済みoriginに対して有効かどうかを判定する
/// （仕様の"is a registrable domain suffix of, or is equal to, effectiveDomain"）。
///
/// `claimed_rp_id`が`origin_host`自身と一致するか、`origin_host`の祖先ドメイン
/// （例: `origin_host = "login.example.com"`に対する`claimed_rp_id = "example.com"`）
/// であり、かつ両者が同一のeTLD+1に属する場合のみ有効とする。eTLD+1一致の要求により、
/// `claimed_rp_id`が裸の公開サフィックス自体（例: `"co.jp"`）である場合は無効になる
/// （`extract_etld_plus1("co.jp") == "co.jp"`だが`extract_etld_plus1(origin_host)`は
/// 通常これと一致しないため）。
///
/// `android/rust-jni`のCredentialProviderService実装から、ブラウザ発リクエストの
/// requestJson内`rp.id`/`rpId`フィールドを検証する目的で使う
/// （`docs/android-passkey.md` Part 4-1/8-2参照。この関数を介さずrequestJsonの
/// rp.idを直接信用してはならない）。
pub fn is_valid_webauthn_rp_id(origin_host: &str, claimed_rp_id: &str) -> bool {
    if claimed_rp_id.is_empty() {
        return false;
    }
    let origin_host = origin_host.to_lowercase();
    let claimed_rp_id = claimed_rp_id.to_lowercase();
    let is_ancestor_or_self =
        origin_host == claimed_rp_id || origin_host.ends_with(&format!(".{}", claimed_rp_id));
    is_ancestor_or_self && same_etld_plus1(&origin_host, &claimed_rp_id)
}

/// URLからホスト部分を抽出する（scheme/path/portを除去、www除去や小文字化は行わない）。
///
/// `vault-core::import::duplicate::extract_domain` と共有する下位ユーティリティ。
pub(crate) fn extract_host(url: &str) -> Option<&str> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }

    let without_scheme = if let Some(pos) = url.find("://") {
        &url[pos + 3..]
    } else {
        url
    };

    let without_path = without_scheme.split('/').next().unwrap_or(without_scheme);

    let without_port = if let Some(pos) = without_path.rfind(':') {
        if without_path[pos + 1..].chars().all(|c| c.is_ascii_digit()) {
            &without_path[..pos]
        } else {
            without_path
        }
    } else {
        without_path
    };

    if without_port.is_empty() {
        None
    } else {
        Some(without_port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_subdomain() {
        assert_eq!(extract_etld_plus1("login.example.com"), "example.com");
    }

    #[test]
    fn sibling_subdomains_share_etld_plus1() {
        // これがAndroid版で発生していたバグの核心: www./m. は兄弟サブドメインだが
        // 同一のeTLD+1 "facebook.com" に正規化されるべき。
        assert_eq!(extract_etld_plus1("www.facebook.com"), "facebook.com");
        assert_eq!(extract_etld_plus1("m.facebook.com"), "facebook.com");
        assert!(same_etld_plus1("www.facebook.com", "m.facebook.com"));
    }

    #[test]
    fn bare_domain() {
        assert_eq!(extract_etld_plus1("example.com"), "example.com");
    }

    #[test]
    fn compound_tld() {
        assert_eq!(extract_etld_plus1("www.example.co.jp"), "example.co.jp");
    }

    #[test]
    fn wildcard_public_suffix() {
        // blogspot.com はPSLのワイルドカードルール(*.blogspot.com)により
        // "sub.blogspot.com" 全体が公開サフィックスとなり、eTLD+1もそれ自身になる。
        assert_eq!(extract_etld_plus1("sub.blogspot.com"), "sub.blogspot.com");
    }

    #[test]
    fn different_etld_plus1_do_not_match() {
        assert!(!same_etld_plus1("example.com", "other.com"));
    }

    #[test]
    fn case_insensitive() {
        assert!(same_etld_plus1("WWW.Example.COM", "m.example.com"));
    }

    #[test]
    fn rp_id_equal_to_origin_is_valid() {
        assert!(is_valid_webauthn_rp_id(
            "login.sbisec.co.jp",
            "login.sbisec.co.jp"
        ));
    }

    #[test]
    fn rp_id_ancestor_domain_is_valid() {
        // 実際にAndroid版で発生していたケース: ログインページは "login.sbisec.co.jp"
        // だがサイトが登録したrp.idは親ドメイン "sbisec.co.jp"。
        assert!(is_valid_webauthn_rp_id(
            "login.sbisec.co.jp",
            "sbisec.co.jp"
        ));
    }

    #[test]
    fn rp_id_unrelated_domain_is_invalid() {
        assert!(!is_valid_webauthn_rp_id(
            "login.sbisec.co.jp",
            "evil.example.com"
        ));
    }

    #[test]
    fn rp_id_bare_public_suffix_is_invalid() {
        // "co.jp" はPSL上の公開サフィックスそのもの。origin側と同一eTLD+1にならないため無効。
        assert!(!is_valid_webauthn_rp_id("login.sbisec.co.jp", "co.jp"));
    }

    #[test]
    fn rp_id_descendant_of_origin_is_invalid() {
        // originより「狭い」ドメインをrp.idとして自称するのは無効（祖先方向のみ許可）。
        assert!(!is_valid_webauthn_rp_id(
            "sbisec.co.jp",
            "login.sbisec.co.jp"
        ));
    }

    #[test]
    fn rp_id_case_insensitive() {
        assert!(is_valid_webauthn_rp_id(
            "Login.SBISEC.co.jp",
            "SBISEC.co.jp"
        ));
    }

    #[test]
    fn extract_host_strips_scheme_path_port() {
        assert_eq!(
            extract_host("https://www.example.com:8443/login"),
            Some("www.example.com")
        );
        assert_eq!(extract_host("example.com/login"), Some("example.com"));
        assert_eq!(extract_host(""), None);
    }
}
