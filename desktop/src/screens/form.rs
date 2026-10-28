//! アイテムの作成・編集フォーム（旧 EntryCreate / EntryEdit / EntryForm）

use std::cell::RefCell;
use std::rc::Rc;

use serde_json::{Map, Value};
use slint::{ComponentHandle, Model, ModelRc, VecModel};

use crate::ctx::{self, shared};
use crate::fields::{self, CustomField, Selector};
use crate::{qr, AppWindow, CustomFieldItem, EntryForm, EntryList, FormField, LabelItem, Page};

#[derive(Default)]
struct State {
    /// 編集中のエントリ ID（新規作成なら None）
    editing_id: Option<String>,
    /// 編集前の typedValue。フォームに出さないキーも保存し直すために保持する
    original_typed: Map<String, Value>,
    original_notes: Option<String>,
    /// 編集前のカスタムフィールド（未知のキーを引き継ぐため）
    original_custom: Vec<CustomField>,
    generation: u64,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
    static FIELDS: Rc<VecModel<FormField>> = Rc::new(VecModel::default());
    static CUSTOM: Rc<VecModel<CustomFieldItem>> = Rc::new(VecModel::default());
    static LABELS: Rc<VecModel<LabelItem>> = Rc::new(VecModel::default());
}

pub fn setup(app: &AppWindow) {
    let form = app.global::<EntryForm>();
    form.set_fields(FIELDS.with(|m| ModelRc::from(m.clone())));
    form.set_custom_fields(CUSTOM.with(|m| ModelRc::from(m.clone())));
    form.set_labels(LABELS.with(|m| ModelRc::from(m.clone())));

    let weak = app.as_weak();
    form.on_select_type(move |entry_type| {
        if let Some(app) = weak.upgrade() {
            set_entry_type(&app, &entry_type, &Map::new());
            app.global::<EntryForm>().set_type_dialog_open(false);
        }
    });
    let weak = app.as_weak();
    form.on_cancel(move || {
        if let Some(app) = weak.upgrade() {
            app.global::<EntryForm>().set_type_dialog_open(false);
            super::navigate(&app, Page::Entries);
        }
    });
    form.on_save(ctx::handler(app, save));
    let weak = app.as_weak();
    form.on_add_custom_field(move |field_type| {
        let Some(app) = weak.upgrade() else { return };
        let field = CustomField {
            id: fields::random_field_id(),
            name: if field_type == "totp" {
                "TOTP".into()
            } else {
                String::new()
            },
            field_type: field_type.to_string(),
            ..Default::default()
        };
        CUSTOM.with(|m| m.push(custom_item(&field)));
        app.global::<EntryForm>().set_picking_field_type(false);
    });
    form.on_remove_custom_field(|index| {
        CUSTOM.with(|m| {
            if (index as usize) < m.row_count() {
                m.remove(index as usize);
            }
        });
    });
    form.on_move_custom_field(|index, delta| {
        CUSTOM.with(|m| {
            let from = index as usize;
            let to = index + delta;
            if to < 0 || to as usize >= m.row_count() || from >= m.row_count() {
                return;
            }
            let item = m.remove(from);
            m.insert(to as usize, item);
        });
    });
    let weak = app.as_weak();
    form.on_scan_totp_qr(move |index| {
        if let Some(app) = weak.upgrade() {
            scan_totp_qr(&app, index as usize);
        }
    });
    let weak = app.as_weak();
    form.on_create_label(move |name| {
        if let Some(app) = weak.upgrade() {
            create_label(&app, name.trim().to_string());
        }
    });
}

fn custom_item(field: &CustomField) -> CustomFieldItem {
    let selector = field.autofill_selector.clone().unwrap_or_default();
    CustomFieldItem {
        id: field.id.as_str().into(),
        name: field.name.as_str().into(),
        field_type: field.field_type.as_str().into(),
        type_label: fields::custom_field_type_label(&field.field_type).into(),
        value: field.value.as_str().into(),
        secret: field.secret,
        passkey_summary: if field.field_type == "passkey" {
            fields::passkey_summary(&field.value).into()
        } else {
            Default::default()
        },
        selector_tag: selector.tag.unwrap_or_default().into(),
        selector_type: selector.type_.unwrap_or_default().into(),
        selector_name: selector.name.unwrap_or_default().into(),
        selector_id: selector.id.unwrap_or_default().into(),
        expanded: false,
    }
}

fn set_entry_type(app: &AppWindow, entry_type: &str, typed: &Map<String, Value>) {
    app.global::<EntryForm>().set_entry_type(entry_type.into());
    let rows: Vec<FormField> = fields::field_specs(entry_type)
        .into_iter()
        .map(|spec| FormField {
            key: spec.key.into(),
            label: spec.label.into(),
            value: fields::typed_string(typed, spec.key).into(),
            kind: spec.kind.as_str().into(),
            placeholder: spec.placeholder.into(),
            generator: spec.generator,
        })
        .collect();
    FIELDS.with(|m| m.set_vec(rows));
}

fn reset_form(app: &AppWindow) {
    let form = app.global::<EntryForm>();
    form.set_name("".into());
    form.set_notes("".into());
    form.set_error("".into());
    form.set_qr_error("".into());
    form.set_saving(false);
    form.set_scanning_qr(false);
    form.set_active_generator("".into());
    form.set_picking_field_type(false);
    form.set_creating_label(false);
    FIELDS.with(|m| m.set_vec(Vec::new()));
    CUSTOM.with(|m| m.set_vec(Vec::new()));
    LABELS.with(|m| m.set_vec(Vec::new()));
}

pub fn clear(app: &AppWindow) {
    reset_form(app);
    let form = app.global::<EntryForm>();
    form.set_type_dialog_open(false);
    form.set_loaded(false);
    STATE.with_borrow_mut(|s| *s = State::default());
}

fn label_items(labels: Vec<vault_core::api::LabelRow>, selected: &[String]) -> Vec<LabelItem> {
    labels
        .into_iter()
        .map(|l| LabelItem {
            selected: selected.contains(&l.id),
            id: l.id.into(),
            name: l.name.into(),
        })
        .collect()
}

pub fn enter_create(app: &AppWindow) {
    reset_form(app);
    let generation = STATE.with_borrow_mut(|s| {
        let generation = s.generation + 1;
        *s = State {
            generation,
            ..Default::default()
        };
        generation
    });
    let form = app.global::<EntryForm>();
    form.set_editing(false);
    form.set_loaded(true);
    set_entry_type(app, "login", &Map::new());
    form.set_type_dialog_open(true);
    ctx::run_blocking(
        || shared().vault.api_list_labels(),
        move |_app, result| {
            if STATE.with_borrow(|s| s.generation != generation) {
                return;
            }
            match result {
                Ok(labels) => LABELS.with(|m| m.set_vec(label_items(labels, &[]))),
                Err(e) => eprintln!("ラベル読み込み失敗: {e}"),
            }
        },
    );
}

pub fn enter_edit(app: &AppWindow, id: String) {
    reset_form(app);
    let generation = STATE.with_borrow_mut(|s| {
        let generation = s.generation + 1;
        *s = State {
            generation,
            editing_id: Some(id.clone()),
            ..Default::default()
        };
        generation
    });
    let form = app.global::<EntryForm>();
    form.set_editing(true);
    form.set_loaded(false);
    form.set_type_dialog_open(false);
    super::navigate(app, Page::EntryEdit);
    ctx::run_blocking(
        move || {
            let entry = shared().vault.api_get_entry(id)?;
            let labels = shared().vault.api_list_labels()?;
            Ok::<_, String>((entry, labels))
        },
        move |app, result| {
            if STATE.with_borrow(|s| s.generation != generation) {
                return;
            }
            let form = app.global::<EntryForm>();
            match result {
                Ok((entry, labels)) => {
                    let typed: Map<String, Value> =
                        serde_json::from_str(&entry.typed_value).unwrap_or_default();
                    let custom: Vec<CustomField> = entry
                        .custom_fields
                        .as_deref()
                        .and_then(|json| serde_json::from_str::<Value>(json).ok())
                        .map(|v| fields::parse_custom_fields(&v))
                        .unwrap_or_default();
                    form.set_name(entry.name.as_str().into());
                    form.set_notes(entry.notes.as_deref().unwrap_or("").into());
                    set_entry_type(&app, &entry.entry_type, &typed);
                    CUSTOM.with(|m| m.set_vec(custom.iter().map(custom_item).collect::<Vec<_>>()));
                    LABELS.with(|m| m.set_vec(label_items(labels, &entry.labels)));
                    STATE.with_borrow_mut(|s| {
                        s.original_typed = typed;
                        s.original_notes = entry.notes;
                        s.original_custom = custom;
                    });
                    form.set_loaded(true);
                }
                Err(e) => form.set_error(format!("アイテム読み込み失敗: {e}").into()),
            }
        },
    );
}

/// フォームのカスタムフィールドを vault-core の JSON 形式に戻す
fn collect_custom_fields() -> Vec<CustomField> {
    let originals = STATE.with_borrow(|s| s.original_custom.clone());
    CUSTOM.with(|m| {
        m.iter()
            .map(|item| {
                let original = originals.iter().find(|f| f.id == item.id.as_str());
                CustomField {
                    id: item.id.to_string(),
                    name: item.name.to_string(),
                    field_type: item.field_type.to_string(),
                    // パスキーの値は編集させていないので元の値をそのまま使う
                    value: item.value.to_string(),
                    secret: item.secret,
                    autofill_selector: Selector::from_parts(
                        &item.selector_tag,
                        &item.selector_name,
                        &item.selector_id,
                        &item.selector_type,
                    ),
                    extra: original.map(|f| f.extra.clone()).unwrap_or_default(),
                }
            })
            .collect()
    })
}

fn save(app: &AppWindow) {
    let form = app.global::<EntryForm>();
    let name = form.get_name().to_string();
    if name.trim().is_empty() {
        form.set_error("名前を入力してください".into());
        return;
    }
    let (editing_id, original_typed, original_notes) = STATE.with_borrow(|s| {
        (
            s.editing_id.clone(),
            s.original_typed.clone(),
            s.original_notes.clone(),
        )
    });

    let values: Vec<(String, String)> = FIELDS.with(|m| {
        m.iter()
            .map(|f| (f.key.to_string(), f.value.to_string()))
            .collect()
    });
    let typed_json = Value::Object(fields::build_typed_value(&original_typed, &values)).to_string();
    let custom = collect_custom_fields();
    let notes = form.get_notes().to_string();
    let notes = (!notes.is_empty() || original_notes.is_some()).then_some(notes);
    let label_ids: Vec<String> = LABELS.with(|m| {
        m.iter()
            .filter(|l| l.selected)
            .map(|l| l.id.to_string())
            .collect()
    });
    let entry_type = form.get_entry_type().to_string();

    form.set_saving(true);
    form.set_error("".into());
    ctx::run_blocking(
        move || {
            let vault = &shared().vault;
            match &editing_id {
                Some(id) => vault.api_update_entry(
                    id.clone(),
                    Some(name),
                    notes,
                    Some(typed_json),
                    Some(label_ids),
                    Some(serde_json::to_string(&custom).map_err(|e| e.to_string())?),
                )?,
                None => {
                    let custom_json = if custom.is_empty() {
                        None
                    } else {
                        Some(serde_json::to_string(&custom).map_err(|e| e.to_string())?)
                    };
                    vault.api_create_entry(
                        entry_type,
                        name,
                        notes,
                        typed_json,
                        label_ids,
                        custom_json,
                    )?;
                }
            }
            ctx::save_local()?;
            Ok::<_, String>(editing_id)
        },
        |app, result| {
            let form = app.global::<EntryForm>();
            form.set_saving(false);
            match result {
                Ok(editing_id) => {
                    ctx::sync_in_background(&app);
                    // 編集後は一覧で同じアイテムを選択したままにする
                    if let Some(id) = editing_id {
                        app.global::<EntryList>().set_selected_id(id.into());
                    }
                    super::navigate(&app, Page::Entries);
                }
                Err(e) => {
                    let editing = form.get_editing();
                    let message = if editing {
                        "保存失敗"
                    } else {
                        "アイテム作成失敗"
                    };
                    if editing {
                        form.set_error(format!("{message}: {e}").into());
                    } else {
                        ctx::push_error(&app, format!("{message}: {e}"), None);
                    }
                }
            }
        },
    );
}

fn scan_totp_qr(app: &AppWindow, index: usize) {
    let Some(field_id) = CUSTOM.with(|m| m.row_data(index).map(|f| f.id.to_string())) else {
        return;
    };
    let form = app.global::<EntryForm>();
    form.set_qr_error("".into());
    form.set_scanning_qr(true);
    ctx::run_async(
        async move {
            let file = rfd::AsyncFileDialog::new()
                .add_filter("Image", &["png", "jpg", "jpeg", "gif", "bmp", "webp"])
                .pick_file()
                .await?;
            let bytes = file.read().await;
            Some(qr::decode_totp(&bytes, |value| {
                vault_core::api::api_generate_totp_from_value(value.to_string()).map(|_| ())
            }))
        },
        move |app, result| {
            let form = app.global::<EntryForm>();
            form.set_scanning_qr(false);
            match result {
                None => {}
                Some(Ok(value)) => CUSTOM.with(|m| {
                    // 読み取り中に並べ替えられても正しい行を更新できるよう ID で探す
                    if let Some(i) = m.iter().position(|f| f.id.as_str() == field_id) {
                        let mut item = m.row_data(i).expect("row exists");
                        item.value = value.into();
                        m.set_row_data(i, item);
                    }
                }),
                Some(Err(e)) => form.set_qr_error(e.message().into()),
            }
        },
    );
}

fn create_label(app: &AppWindow, name: String) {
    if name.is_empty() {
        return;
    }
    app.global::<EntryForm>().set_creating_label(true);
    ctx::run_blocking(
        move || {
            let id = shared().vault.api_create_label(name.clone())?;
            Ok::<_, String>((id, name))
        },
        |app, result| {
            app.global::<EntryForm>().set_creating_label(false);
            match result {
                Ok((id, name)) => LABELS.with(|m| {
                    m.push(LabelItem {
                        id: id.into(),
                        name: name.into(),
                        selected: true,
                    })
                }),
                Err(e) => eprintln!("ラベル作成失敗: {e}"),
            }
        },
    );
}
