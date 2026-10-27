//! ラベル管理

use std::cell::RefCell;
use std::rc::Rc;

use slint::{ComponentHandle, Model, ModelRc, VecModel};

use crate::ctx::{self, shared};
use crate::{AppWindow, LabelItem, Labels};

thread_local! {
    static ITEMS: Rc<VecModel<LabelItem>> = Rc::new(VecModel::default());
    static DELETE_TARGET: RefCell<Option<String>> = const { RefCell::new(None) };
}

pub fn setup(app: &AppWindow) {
    let labels = app.global::<Labels>();
    labels.set_items(ITEMS.with(|m| ModelRc::from(m.clone())));

    labels.on_create(ctx::handler(app, create));
    labels.on_save_rename(ctx::handler(app, rename));
    let weak = app.as_weak();
    labels.on_delete_requested(move |id| {
        if let Some(app) = weak.upgrade() {
            DELETE_TARGET.with_borrow_mut(|t| *t = Some(id.to_string()));
            super::open_confirm(
                &app,
                "delete-label",
                "ラベルを削除",
                "このラベルを削除します。エントリへの割り当てのみ削除され、エントリ自体は削除されません。",
                "削除",
                true,
            );
        }
    });
}

pub fn enter(app: &AppWindow) {
    let labels = app.global::<Labels>();
    labels.set_error("".into());
    labels.set_new_name("".into());
    labels.set_editing_id("".into());
    labels.set_editing_name("".into());
    labels.set_loading(true);
    reload(app);
}

pub fn reload(_app: &AppWindow) {
    ctx::run_blocking(
        || shared().vault.api_list_labels(),
        |app, result| {
            let labels = app.global::<Labels>();
            labels.set_loading(false);
            match result {
                Ok(rows) => ITEMS.with(|m| {
                    m.set_vec(
                        rows.into_iter()
                            .map(|l| LabelItem {
                                id: l.id.into(),
                                name: l.name.into(),
                                selected: false,
                            })
                            .collect::<Vec<_>>(),
                    )
                }),
                Err(e) => labels.set_error(format!("ラベル読み込み失敗: {e}").into()),
            }
        },
    );
}

/// 変更を保存・同期し、サイドバーのラベル一覧も更新する
fn after_change(app: &AppWindow) -> Result<(), String> {
    ctx::save_and_sync(app)?;
    super::refresh_sidebar_labels(app);
    Ok(())
}

fn create(app: &AppWindow) {
    let labels = app.global::<Labels>();
    let name = labels.get_new_name().to_string();
    if name.trim().is_empty() {
        labels.set_error("ラベル名を入力してください".into());
        return;
    }
    labels.set_creating(true);
    let result = shared()
        .vault
        .api_create_label(name.clone())
        .and_then(|id| {
            after_change(app)?;
            Ok(id)
        });
    labels.set_creating(false);
    match result {
        Ok(id) => {
            ITEMS.with(|m| {
                m.push(LabelItem {
                    id: id.into(),
                    name: name.into(),
                    selected: false,
                })
            });
            labels.set_new_name("".into());
            labels.set_error("".into());
        }
        Err(e) => labels.set_error(format!("ラベル作成失敗: {e}").into()),
    }
}

fn rename(app: &AppWindow) {
    let labels = app.global::<Labels>();
    let id = labels.get_editing_id().to_string();
    let name = labels.get_editing_name().to_string();
    if id.is_empty() || name.trim().is_empty() {
        labels.set_error("ラベル名を入力してください".into());
        return;
    }
    let result = shared()
        .vault
        .api_rename_label(id.clone(), name.clone())
        .and_then(|()| after_change(app));
    match result {
        Ok(()) => {
            ITEMS.with(|m| {
                if let Some(i) = m.iter().position(|l| l.id.as_str() == id) {
                    let mut item = m.row_data(i).expect("row exists");
                    item.name = name.into();
                    m.set_row_data(i, item);
                }
            });
            labels.set_editing_id("".into());
            labels.set_editing_name("".into());
            labels.set_error("".into());
        }
        Err(e) => labels.set_error(format!("ラベル更新失敗: {e}").into()),
    }
}

pub fn delete_confirmed(app: &AppWindow) {
    let Some(id) = DELETE_TARGET.with_borrow_mut(Option::take) else {
        super::close_confirm(app);
        return;
    };
    let result = shared()
        .vault
        .api_delete_label(id.clone())
        .and_then(|()| after_change(app));
    super::close_confirm(app);
    match result {
        Ok(()) => ITEMS.with(|m| {
            if let Some(i) = m.iter().position(|l| l.id.as_str() == id) {
                m.remove(i);
            }
        }),
        Err(e) => app
            .global::<Labels>()
            .set_error(format!("ラベル削除失敗: {e}").into()),
    }
}
