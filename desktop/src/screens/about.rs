//! このアプリについて（バージョン・サードパーティライセンス一覧）

use std::cell::RefCell;

use serde::Deserialize;
use slint::{ComponentHandle, ModelRc, VecModel};

use crate::{About, AppWindow, LicenseItem};

/// `just desktop-licenses` で生成する。同じ全文は texts に1つだけ持ち、packages から番号で参照する
const THIRD_PARTY_LICENSES: &str = include_str!("../../third-party-licenses.json");

#[derive(Deserialize)]
struct Notices {
    texts: Vec<String>,
    packages: Vec<Package>,
}

#[derive(Deserialize)]
struct Package {
    name: String,
    version: String,
    license: String,
    texts: Vec<usize>,
}

thread_local! {
    static NOTICES: RefCell<Option<Notices>> = const { RefCell::new(None) };
    /// 表示中の一覧の各行が packages の何番目か
    static SHOWN: RefCell<Vec<usize>> = const { RefCell::new(Vec::new()) };
}

pub fn setup(app: &AppWindow) {
    let about = app.global::<About>();
    about.set_version(format!("v{}", env!("CARGO_PKG_VERSION")).into());

    let weak = app.as_weak();
    about.on_search_changed(move || {
        if let Some(app) = weak.upgrade() {
            refresh_list(&app);
        }
    });
    let weak = app.as_weak();
    about.on_open_license(move |row| {
        if let Some(app) = weak.upgrade() {
            open_license(&app, row as usize);
        }
    });
}

pub fn enter(app: &AppWindow) {
    let about = app.global::<About>();
    about.set_search("".into());
    about.set_dialog_open(false);
    refresh_list(app);
}

/// 一覧は数百件あり、About 画面を開かない限り不要なので、初めて開いたときに読み込む
fn with_notices<R>(f: impl FnOnce(&Notices) -> R) -> R {
    NOTICES.with_borrow_mut(|notices| {
        let notices = notices.get_or_insert_with(|| {
            serde_json::from_str(THIRD_PARTY_LICENSES)
                .expect("third-party-licenses.json is malformed")
        });
        f(notices)
    })
}

fn refresh_list(app: &AppWindow) {
    let about = app.global::<About>();
    let query = about.get_search().trim().to_lowercase();
    let (shown, items): (Vec<usize>, Vec<LicenseItem>) = with_notices(|notices| {
        notices
            .packages
            .iter()
            .enumerate()
            .filter(|(_, p)| query.is_empty() || p.name.to_lowercase().contains(&query))
            .map(|(i, p)| {
                let item = LicenseItem {
                    name: p.name.as_str().into(),
                    version: p.version.as_str().into(),
                    license: p.license.as_str().into(),
                };
                (i, item)
            })
            .unzip()
    });
    SHOWN.with_borrow_mut(|s| *s = shown);
    about.set_items(ModelRc::new(VecModel::from(items)));
}

fn open_license(app: &AppWindow, row: usize) {
    let Some(index) = SHOWN.with_borrow(|s| s.get(row).copied()) else {
        return;
    };
    let about = app.global::<About>();
    with_notices(|notices| {
        let package = &notices.packages[index];
        let text = package
            .texts
            .iter()
            .map(|&t| notices.texts[t].as_str())
            .collect::<Vec<_>>()
            .join("\n\n----------------------------------------\n\n");
        about.set_dialog_title(format!("{} {}", package.name, package.version).into());
        about.set_dialog_license(package.license.as_str().into());
        about.set_dialog_text(text.into());
    });
    about.set_dialog_open(true);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 生成ファイルの参照が壊れていると、開いたときに panic する
    #[test]
    fn test_third_party_licenses_are_consistent() {
        let notices: Notices = serde_json::from_str(THIRD_PARTY_LICENSES).unwrap();
        assert!(!notices.packages.is_empty());
        for p in &notices.packages {
            assert!(!p.texts.is_empty(), "{} has no license text", p.name);
            for &t in &p.texts {
                assert!(
                    t < notices.texts.len(),
                    "{} refers to missing text {t}",
                    p.name
                );
            }
        }
        // Slint の Royalty-free ライセンスを選んでいることを一覧にも残す
        assert!(notices
            .packages
            .iter()
            .any(|p| p.name == "slint" && p.license.contains("Slint-Royalty-free")));
    }
}
