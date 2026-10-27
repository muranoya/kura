//! アイテム一覧（全て / お気に入り / ラベル別）と詳細ペイン、ゴミ箱

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use serde_json::{Map, Value};
use slint::{ComponentHandle, Model, ModelRc, SharedString, VecModel};
use vault_core::api::{EntryDetail, EntryRow};

use crate::ctx::{self, shared};
use crate::fields::{self, ENTRY_TYPES};
use crate::store::{keys, SortConfig};
use crate::{markdown, AppWindow, DetailRow, EntryList, EntryRowItem, Nav, Page, Trash};

const SORTS: [(&str, &str); 6] = [
    ("created_at", "desc"),
    ("created_at", "asc"),
    ("updated_at", "desc"),
    ("updated_at", "asc"),
    ("name", "asc"),
    ("name", "desc"),
];

#[derive(Default)]
struct State {
    rows: Vec<EntryRow>,
    trash_rows: Vec<EntryRow>,
    initial_load_done: bool,
    /// 削除・完全削除の確認ダイアログの対象
    pending_target: Option<String>,
    /// 読み込みの世代。古い結果で新しい表示を上書きしないため
    list_generation: u64,
    detail_generation: u64,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
    static SEARCH_DEBOUNCE: slint::Timer = slint::Timer::default();
    static TOTP_TICK: slint::Timer = slint::Timer::default();
    static DETAIL_ROWS: Rc<VecModel<DetailRow>> = Rc::new(VecModel::default());
    static LIST_ROWS: Rc<VecModel<EntryRowItem>> = Rc::new(VecModel::default());
    static TRASH_ROWS: Rc<VecModel<EntryRowItem>> = Rc::new(VecModel::default());
}

pub fn setup(app: &AppWindow) {
    let list = app.global::<EntryList>();
    list.set_entries(LIST_ROWS.with(|m| ModelRc::from(m.clone())));
    list.set_detail_rows(DETAIL_ROWS.with(|m| ModelRc::from(m.clone())));
    app.global::<Trash>()
        .set_entries(TRASH_ROWS.with(|m| ModelRc::from(m.clone())));

    let weak = app.as_weak();
    list.on_filters_changed(move || {
        let Some(app) = weak.upgrade() else { return };
        persist_filters(&app);
        // 入力中の過剰な読み込みを防ぐ
        let weak = app.as_weak();
        SEARCH_DEBOUNCE.with(|t| {
            t.start(
                slint::TimerMode::SingleShot,
                Duration::from_millis(300),
                move || {
                    if let Some(app) = weak.upgrade() {
                        reload(&app);
                    }
                },
            )
        });
    });
    let weak = app.as_weak();
    list.on_select(move |id| {
        if let Some(app) = weak.upgrade() {
            app.global::<EntryList>().set_selected_id(id.clone());
            load_detail(&app, id.to_string());
        }
    });
    list.on_toggle_favorite(ctx::handler(app, toggle_favorite));
    let weak = app.as_weak();
    list.on_edit(move || {
        if let Some(app) = weak.upgrade() {
            let id = app.global::<EntryList>().get_selected_id().to_string();
            super::form::enter_edit(&app, id);
        }
    });
    let weak = app.as_weak();
    list.on_create(move || {
        if let Some(app) = weak.upgrade() {
            super::navigate(&app, Page::EntryCreate);
        }
    });
    let weak = app.as_weak();
    list.on_delete_requested(move |id| {
        if let Some(app) = weak.upgrade() {
            STATE.with_borrow_mut(|s| s.pending_target = Some(id.to_string()));
            super::open_confirm(
                &app,
                "delete-entry",
                "アイテムを削除",
                "このアイテムをゴミ箱に移動します。後から復元できます。",
                "削除",
                true,
            );
        }
    });
    list.on_toggle_mask(|index| {
        DETAIL_ROWS.with(|model| {
            let index = index as usize;
            if let Some(mut row) = model.row_data(index) {
                row.masked = !row.masked;
                model.set_row_data(index, row);
            }
        });
    });

    let trash = app.global::<Trash>();
    let weak = app.as_weak();
    trash.on_filters_changed(move || {
        if let Some(app) = weak.upgrade() {
            persist_sort(app.global::<Trash>().get_sort_index());
            apply_trash_filters(&app);
        }
    });
    let weak = app.as_weak();
    trash.on_restore(move |id| {
        if let Some(app) = weak.upgrade() {
            restore(&app, id.to_string());
        }
    });
    let weak = app.as_weak();
    trash.on_purge_requested(move |id| {
        if let Some(app) = weak.upgrade() {
            STATE.with_borrow_mut(|s| s.pending_target = Some(id.to_string()));
            super::open_confirm(
                &app,
                "purge-entry",
                "完全に削除",
                "このアイテムは完全に削除されます。この操作は取り消せません。",
                "削除",
                true,
            );
        }
    });

    // TOTP のコードと残り秒数を毎秒更新する
    TOTP_TICK.with(|t| {
        t.start(
            slint::TimerMode::Repeated,
            Duration::from_secs(1),
            refresh_totp_rows,
        );
    });
}

fn sort_index_of(config: &SortConfig) -> i32 {
    SORTS
        .iter()
        .position(|(f, o)| *f == config.field && *o == config.order)
        .unwrap_or(0) as i32
}

fn type_index_of(entry_type: Option<&str>) -> i32 {
    entry_type
        .and_then(|t| ENTRY_TYPES.iter().position(|e| *e == t))
        .map(|i| i as i32 + 1)
        .unwrap_or(0)
}

fn type_at(index: i32) -> Option<String> {
    (index > 0)
        .then(|| ENTRY_TYPES.get(index as usize - 1).map(|t| t.to_string()))
        .flatten()
}

fn sort_at(index: i32) -> (&'static str, &'static str) {
    SORTS
        .get(index.max(0) as usize)
        .copied()
        .unwrap_or(SORTS[0])
}

fn persist_sort(index: i32) {
    let (field, order) = sort_at(index);
    let _ = shared().store.set(
        keys::SORT_CONFIG,
        &SortConfig {
            field: field.into(),
            order: order.into(),
        },
    );
}

fn persist_filters(app: &AppWindow) {
    let list = app.global::<EntryList>();
    persist_sort(list.get_sort_index());
    let _ = shared()
        .store
        .set(keys::ENTRY_TYPE_FILTER, &type_at(list.get_type_index()));
}

fn row_item(row: &EntryRow) -> EntryRowItem {
    EntryRowItem {
        id: row.id.as_str().into(),
        entry_type: row.entry_type.as_str().into(),
        name: row.name.as_str().into(),
        subtitle: row.subtitle.as_deref().unwrap_or("").into(),
        deleted_at: row
            .deleted_at
            .map(|ts| ctx::format_timestamp(ts, true))
            .unwrap_or_else(|| "-".into())
            .into(),
    }
}

/// エントリリストの内容が実質的に変わったか（変わらなければ再描画しない）
fn entries_changed(prev: &[EntryRow], next: &[EntryRow]) -> bool {
    prev.len() != next.len()
        || prev.iter().zip(next).any(|(a, b)| {
            a.id != b.id
                || a.updated_at != b.updated_at
                || a.is_favorite != b.is_favorite
                || a.deleted_at != b.deleted_at
                || a.name != b.name
        })
}

// ---------------------------------------------------------------------------
// 一覧
// ---------------------------------------------------------------------------

/// 一覧画面に入ったとき。フォームから戻った場合は選択中のアイテムを保つ
pub fn enter(app: &AppWindow, keep_selection: bool) {
    let list = app.global::<EntryList>();
    let store = &shared().store;
    list.set_sort_index(sort_index_of(
        &store.get(keys::SORT_CONFIG).unwrap_or_default(),
    ));
    list.set_type_index(type_index_of(
        store.get::<String>(keys::ENTRY_TYPE_FILTER).as_deref(),
    ));
    list.set_search("".into());
    list.set_error("".into());
    LIST_ROWS.with(|m| m.set_vec(Vec::new()));
    STATE.with_borrow_mut(|s| {
        s.rows.clear();
        s.initial_load_done = false;
    });
    let selected = list.get_selected_id();
    if keep_selection && !selected.is_empty() {
        load_detail(app, selected.to_string());
    } else {
        list.set_selected_id("".into());
        clear_detail(app);
    }
    reload(app);
}

pub fn reload(app: &AppWindow) {
    let list = app.global::<EntryList>();
    let nav = app.global::<Nav>();
    let page = nav.get_page();
    let only_favorites = page == Page::Favorites;
    let label_id = (page == Page::LabelEntries).then(|| nav.get_label_id().to_string());
    let search = list.get_search().to_string();
    let entry_type = type_at(list.get_type_index());
    let (sort_field, sort_order) = sort_at(list.get_sort_index());

    let (initial, generation) = STATE.with_borrow_mut(|s| {
        s.list_generation += 1;
        (!s.initial_load_done, s.list_generation)
    });
    // 初回のみローディング表示、同期による再読み込みはバックグラウンドで行う
    if initial {
        list.set_loading(true);
    }
    ctx::run_blocking(
        move || {
            shared().vault.api_list_entries(
                (!search.is_empty()).then_some(search),
                entry_type,
                label_id,
                false,
                only_favorites,
                Some(sort_field.into()),
                Some(sort_order.into()),
            )
        },
        move |app, result| {
            if STATE.with_borrow(|s| s.list_generation != generation) {
                return;
            }
            let list = app.global::<EntryList>();
            list.set_loading(false);
            STATE.with_borrow_mut(|s| s.initial_load_done = true);
            match result {
                Ok(rows) => {
                    let changed = STATE.with_borrow(|s| entries_changed(&s.rows, &rows));
                    if changed {
                        LIST_ROWS
                            .with(|m| m.set_vec(rows.iter().map(row_item).collect::<Vec<_>>()));
                        STATE.with_borrow_mut(|s| s.rows = rows);
                    }
                }
                Err(e) => list.set_error(format!("アイテム読み込み失敗: {e}").into()),
            }
        },
    );
}

pub fn clear(app: &AppWindow) {
    clear_detail(app);
    app.global::<EntryList>().set_selected_id("".into());
    LIST_ROWS.with(|m| m.set_vec(Vec::new()));
    TRASH_ROWS.with(|m| m.set_vec(Vec::new()));
    STATE.with_borrow_mut(|s| *s = State::default());
}

// ---------------------------------------------------------------------------
// 詳細ペイン
// ---------------------------------------------------------------------------

fn clear_detail(app: &AppWindow) {
    let list = app.global::<EntryList>();
    list.set_has_detail(false);
    list.set_detail_loading(false);
    list.set_detail_name("".into());
    list.set_detail_labels(ModelRc::default());
    DETAIL_ROWS.with(|m| m.set_vec(Vec::new()));
}

fn load_detail(app: &AppWindow, id: String) {
    let generation = STATE.with_borrow_mut(|s| {
        s.detail_generation += 1;
        s.detail_generation
    });
    app.global::<EntryList>().set_detail_loading(true);
    ctx::run_blocking(
        move || {
            let entry = shared().vault.api_get_entry(id)?;
            let labels = shared().vault.api_list_labels()?;
            Ok::<_, String>((entry, labels))
        },
        move |app, result| {
            if STATE.with_borrow(|s| s.detail_generation != generation) {
                return;
            }
            let list = app.global::<EntryList>();
            list.set_detail_loading(false);
            match result {
                Ok((entry, labels)) => show_detail(&app, &entry, &labels),
                Err(e) => {
                    eprintln!("Failed to load entry detail: {e}");
                    clear_detail(&app);
                }
            }
        },
    );
}

fn detail_row(kind: &str) -> DetailRow {
    DetailRow {
        kind: kind.into(),
        ..Default::default()
    }
}

fn heading(label: &str) -> DetailRow {
    DetailRow {
        label: label.into(),
        ..detail_row("heading")
    }
}

fn field_row(key: &str, label: &str, value: &str, secret: bool, is_url: bool) -> DetailRow {
    DetailRow {
        key: key.into(),
        label: label.into(),
        value: value.into(),
        masked_value: fields::mask(value).into(),
        secret,
        // 別のエントリを選んだらマスク状態をリセットする（常にマスクから始める）
        masked: secret,
        is_url,
        ..detail_row("field")
    }
}

fn totp_row(field: &fields::CustomField, selector: String) -> DetailRow {
    let mut row = DetailRow {
        key: field.id.as_str().into(),
        label: field.name.as_str().into(),
        value: field.value.as_str().into(),
        selector: selector.into(),
        ..detail_row("totp")
    };
    update_totp(&mut row);
    row
}

fn update_totp(row: &mut DetailRow) {
    let period = vault_core::api::api_parse_totp_period(row.value.to_string()).max(1);
    let now = chrono::Utc::now().timestamp().max(0) as u64;
    row.totp_period = period as i32;
    row.totp_remaining = (period - now % period) as i32;
    match vault_core::api::api_generate_totp_from_value(row.value.to_string()) {
        Ok(code) => {
            row.totp_code = code.into();
            row.error = SharedString::default();
        }
        Err(e) => {
            row.totp_code = SharedString::default();
            row.error = e.into();
        }
    }
}

fn refresh_totp_rows() {
    DETAIL_ROWS.with(|model| {
        for i in 0..model.row_count() {
            if let Some(mut row) = model.row_data(i) {
                if row.kind == "totp" {
                    update_totp(&mut row);
                    model.set_row_data(i, row);
                }
            }
        }
    });
}

/// エントリを詳細ペインの行の並びに変換する（旧 EntryDetailContent）
fn build_detail_rows(entry: &EntryDetail) -> Vec<DetailRow> {
    let typed: Map<String, Value> = serde_json::from_str(&entry.typed_value).unwrap_or_default();
    let mut rows = Vec::new();

    if let Some(section) = fields::section_label(&entry.entry_type) {
        rows.push(heading(section));
        if entry.entry_type == "secure_note" {
            // セキュアノートは秘匿値として保存されるが、メモと同様にマスクせず Markdown で表示する
            let content = fields::typed_string(&typed, "content");
            if content.is_empty() {
                rows.push(detail_row("unset"));
            } else {
                rows.push(DetailRow {
                    md: markdown::render(&content),
                    ..detail_row("markdown")
                });
            }
        } else {
            for spec in fields::field_specs(&entry.entry_type) {
                let value = fields::typed_string(&typed, spec.key);
                let secret = entry.secret_field_keys.iter().any(|k| k == spec.key);
                rows.push(field_row(spec.key, spec.label, &value, secret, spec.is_url));
            }
        }
    }

    let custom: Vec<fields::CustomField> = entry
        .custom_fields
        .as_deref()
        .and_then(|json| serde_json::from_str::<Value>(json).ok())
        .map(|v| fields::parse_custom_fields(&v))
        .unwrap_or_default();
    let (secret_fields, public_fields): (Vec<_>, Vec<_>) = custom
        .iter()
        .partition(|f| fields::is_secret_custom_field(f));
    for (title, group) in [
        ("フィールド", public_fields),
        ("秘匿フィールド", secret_fields),
    ] {
        if group.is_empty() {
            continue;
        }
        rows.push(heading(title));
        for field in group {
            let selector = field
                .autofill_selector
                .as_ref()
                .map(fields::Selector::summary)
                .unwrap_or_default();
            let row = match field.field_type.as_str() {
                "totp" => totp_row(field, selector),
                "passkey" => {
                    // 値は秘密鍵を含むため表示しない
                    let data = fields::parse_passkey(&field.value);
                    let title = data
                        .as_ref()
                        .and_then(|d| {
                            d.rp_name
                                .clone()
                                .filter(|s| !s.is_empty())
                                .or_else(|| d.rp_id.clone())
                        })
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "パスキー".into());
                    DetailRow {
                        label: "パスキー".into(),
                        value: title.into(),
                        sub: data.and_then(|d| d.user_name).unwrap_or_default().into(),
                        selector: selector.into(),
                        ..detail_row("passkey")
                    }
                }
                field_type => {
                    let secret = fields::is_secret_custom_field(field);
                    DetailRow {
                        selector: selector.into(),
                        ..field_row(
                            &field.id,
                            &field.name,
                            &field.value,
                            secret,
                            field_type == "url" && !secret,
                        )
                    }
                }
            };
            rows.push(row);
        }
    }

    if let Some(notes) = entry.notes.as_deref().filter(|n| !n.is_empty()) {
        rows.push(heading("メモ"));
        rows.push(DetailRow {
            value: notes.into(),
            ..detail_row("notes")
        });
    }
    rows
}

fn show_detail(app: &AppWindow, entry: &EntryDetail, labels: &[vault_core::api::LabelRow]) {
    let list = app.global::<EntryList>();
    list.set_detail_name(entry.name.as_str().into());
    list.set_detail_type(fields::entry_type_label(&entry.entry_type).into());
    list.set_detail_favorite(entry.is_favorite);
    let label_names: Vec<SharedString> = entry
        .labels
        .iter()
        .filter_map(|id| labels.iter().find(|l| &l.id == id))
        .map(|l| l.name.as_str().into())
        .collect();
    list.set_detail_labels(ModelRc::new(VecModel::from(label_names)));
    list.set_detail_updated(
        if entry.updated_at > 0 {
            ctx::format_timestamp(entry.updated_at, false)
        } else {
            Default::default()
        }
        .into(),
    );
    list.set_detail_created(
        if entry.created_at > 0 {
            ctx::format_timestamp(entry.created_at, false)
        } else {
            Default::default()
        }
        .into(),
    );
    DETAIL_ROWS.with(|m| m.set_vec(build_detail_rows(entry)));
    list.set_has_detail(true);
}

fn toggle_favorite(app: &AppWindow) {
    let list = app.global::<EntryList>();
    let id = list.get_selected_id().to_string();
    if id.is_empty() {
        return;
    }
    let favorite = !list.get_detail_favorite();
    let result = shared()
        .vault
        .api_set_favorite(id, favorite)
        .and_then(|()| ctx::save_and_sync(app));
    match result {
        Ok(()) => {
            list.set_detail_favorite(favorite);
            reload(app);
        }
        Err(e) => list.set_error(format!("お気に入り変更失敗: {e}").into()),
    }
}

pub fn delete_confirmed(app: &AppWindow) {
    let Some(id) = STATE.with_borrow_mut(|s| s.pending_target.take()) else {
        super::close_confirm(app);
        return;
    };
    let list = app.global::<EntryList>();
    let result = shared()
        .vault
        .api_delete_entry(id.clone())
        .and_then(|()| ctx::save_and_sync(app));
    super::close_confirm(app);
    match result {
        Ok(()) => {
            if list.get_selected_id() == id.as_str() {
                list.set_selected_id("".into());
                clear_detail(app);
            }
            reload(app);
        }
        Err(e) => list.set_error(format!("削除失敗: {e}").into()),
    }
}

// ---------------------------------------------------------------------------
// ゴミ箱
// ---------------------------------------------------------------------------

pub fn enter_trash(app: &AppWindow) {
    let trash = app.global::<Trash>();
    trash.set_sort_index(sort_index_of(
        &shared().store.get(keys::SORT_CONFIG).unwrap_or_default(),
    ));
    // ゴミ箱の種別フィルターは保存しない（旧実装と同じ）
    trash.set_type_index(0);
    trash.set_search("".into());
    trash.set_error("".into());
    reload_trash(app);
}

pub fn reload_trash(app: &AppWindow) {
    let trash = app.global::<Trash>();
    trash.set_loading(true);
    ctx::run_blocking(
        || {
            shared()
                .vault
                .api_list_entries(None, None, None, true, false, None, None)
        },
        |app, result| {
            let trash = app.global::<Trash>();
            trash.set_loading(false);
            match result {
                Ok(rows) => {
                    STATE.with_borrow_mut(|s| {
                        s.trash_rows = rows
                            .into_iter()
                            .filter(|r| r.deleted_at.is_some())
                            .collect()
                    });
                    apply_trash_filters(&app);
                }
                Err(e) => trash.set_error(format!("ゴミ箱読み込み失敗: {e}").into()),
            }
        },
    );
}

/// ゴミ箱はクライアント側で種別・名前の絞り込みと並び替えを行う
fn apply_trash_filters(app: &AppWindow) {
    let trash = app.global::<Trash>();
    let entry_type = type_at(trash.get_type_index());
    let query = trash.get_search().trim().to_lowercase();
    let (field, order) = sort_at(trash.get_sort_index());
    let mut rows: Vec<EntryRow> = STATE.with_borrow(|s| {
        s.trash_rows
            .iter()
            .filter(|r| entry_type.as_deref().is_none_or(|t| r.entry_type == t))
            .filter(|r| query.is_empty() || r.name.to_lowercase().contains(&query))
            .cloned()
            .collect()
    });
    rows.sort_by(|a, b| {
        let ord = match field {
            "name" => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            "updated_at" => a.updated_at.cmp(&b.updated_at),
            _ => a.created_at.cmp(&b.created_at),
        };
        if order == "desc" {
            ord.reverse()
        } else {
            ord
        }
    });
    TRASH_ROWS.with(|m| m.set_vec(rows.iter().map(row_item).collect::<Vec<_>>()));
}

fn restore(app: &AppWindow, id: String) {
    let result = shared()
        .vault
        .api_restore_entry(id.clone())
        .and_then(|()| ctx::save_and_sync(app));
    match result {
        Ok(()) => {
            STATE.with_borrow_mut(|s| s.trash_rows.retain(|r| r.id != id));
            apply_trash_filters(app);
        }
        Err(e) => app
            .global::<Trash>()
            .set_error(format!("復元失敗: {e}").into()),
    }
}

pub fn purge_confirmed(app: &AppWindow) {
    let Some(id) = STATE.with_borrow_mut(|s| s.pending_target.take()) else {
        super::close_confirm(app);
        return;
    };
    let result = shared()
        .vault
        .api_purge_entry(id.clone())
        .and_then(|()| ctx::save_and_sync(app));
    super::close_confirm(app);
    match result {
        Ok(()) => {
            STATE.with_borrow_mut(|s| s.trash_rows.retain(|r| r.id != id));
            apply_trash_filters(app);
        }
        Err(e) => app
            .global::<Trash>()
            .set_error(format!("完全削除失敗: {e}").into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str, updated_at: i64) -> EntryRow {
        EntryRow {
            id: id.into(),
            entry_type: "login".into(),
            name: id.into(),
            subtitle: None,
            is_favorite: false,
            created_at: 0,
            updated_at,
            deleted_at: None,
        }
    }

    #[test]
    fn detects_list_changes() {
        let a = vec![row("a", 1), row("b", 1)];
        assert!(!entries_changed(&a, &a.clone()));
        assert!(entries_changed(&a, &[row("a", 1)]));
        assert!(entries_changed(&a, &[row("a", 2), row("b", 1)]));
    }

    #[test]
    fn filter_indexes_roundtrip() {
        for (i, t) in ENTRY_TYPES.iter().enumerate() {
            assert_eq!(type_index_of(Some(t)), i as i32 + 1);
            assert_eq!(type_at(i as i32 + 1).as_deref(), Some(*t));
        }
        assert_eq!(type_at(0), None);
        assert_eq!(type_index_of(Some("unknown")), 0);
        let sort = SortConfig {
            field: "name".into(),
            order: "desc".into(),
        };
        assert_eq!(sort_at(sort_index_of(&sort)), ("name", "desc"));
    }
}
