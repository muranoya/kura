//! 1Password (.1pux) からのインポート（旧 Import1puxDialog）

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;

use slint::{ComponentHandle, ModelRc, SharedString, VecModel};

use vault_core::import::{
    DuplicateConfidence, ImportAction, ImportItemAction, ImportPreview, ImportPreviewItem,
    ImportResult,
};

use crate::ctx::{self, shared};
use crate::fields::entry_type_label;
use crate::{AppWindow, FilterChip, Import, ImportRow, Settings};

#[derive(Default)]
struct State {
    file: Option<PathBuf>,
    preview: Option<ImportPreview>,
    actions: HashMap<String, ImportAction>,
    type_filter: Option<String>,
    // "none" / "high" / "medium" / "low"
    dup_filter: Option<String>,
    archived_filter: bool,
    completed: bool,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

pub fn setup(app: &AppWindow) {
    let import = app.global::<Import>();

    import.on_select_file(ctx::handler(app, select_file));
    let weak = app.as_weak();
    import.on_chip_clicked(move |key| {
        let Some(app) = weak.upgrade() else { return };
        STATE.with_borrow_mut(|s| {
            let toggle = |current: &mut Option<String>, value: &str| {
                *current = if current.as_deref() == Some(value) {
                    None
                } else {
                    Some(value.to_string())
                };
            };
            if key == "all" {
                s.type_filter = None;
                s.dup_filter = None;
                s.archived_filter = false;
            } else if let Some(t) = key.strip_prefix("type:") {
                toggle(&mut s.type_filter, t);
            } else if let Some(c) = key.strip_prefix("dup:") {
                toggle(&mut s.dup_filter, c);
            } else if key == "archived" {
                s.archived_filter = !s.archived_filter;
            }
        });
        if key == "all" {
            app.global::<Import>().set_search("".into());
        }
        refresh_preview(&app);
    });
    import.on_search_changed(ctx::handler(app, refresh_preview));
    let weak = app.as_weak();
    import.on_set_action(move |source_id, index| {
        let Some(app) = weak.upgrade() else { return };
        STATE.with_borrow_mut(|s| {
            let Some(item) = s
                .preview
                .as_ref()
                .and_then(|p| p.items.iter().find(|i| i.source_id == source_id.as_str()))
            else {
                return;
            };
            let action = match index {
                0 => ImportAction::Import,
                1 => ImportAction::Skip,
                n => match item.duplicates.get(n as usize - 2) {
                    Some(d) => ImportAction::Overwrite {
                        existing_entry_id: d.existing_entry_id.clone(),
                    },
                    None => return,
                },
            };
            s.actions.insert(source_id.to_string(), action);
        });
        refresh_counts(&app);
    });
    let weak = app.as_weak();
    import.on_bulk(move |import_all| {
        let Some(app) = weak.upgrade() else { return };
        let search = app.global::<Import>().get_search().to_string();
        STATE.with_borrow_mut(|s| {
            let visible: Vec<String> = filtered_items(s, &search)
                .map(|i| i.source_id.clone())
                .collect();
            for id in visible {
                s.actions.insert(
                    id,
                    if import_all {
                        ImportAction::Import
                    } else {
                        ImportAction::Skip
                    },
                );
            }
        });
        refresh_preview(&app);
    });
    import.on_execute(ctx::handler(app, execute));
    import.on_close(ctx::handler(app, close));
}

fn set_step(app: &AppWindow, step: &str) {
    app.global::<Import>().set_step(step.into());
}

pub fn clear(app: &AppWindow) {
    STATE.with_borrow_mut(|s| *s = State::default());
    let import = app.global::<Import>();
    import.set_step("idle".into());
    import.set_error("".into());
    import.set_search("".into());
    import.set_rows(ModelRc::default());
    import.set_chips(ModelRc::default());
    import.set_result_chips(ModelRc::default());
    import.set_result_errors(ModelRc::default());
    import.set_labels_created("".into());
}

/// ダイアログを閉じる。インポートが完了していれば保存して同期する
pub fn close(app: &AppWindow) {
    let step = app.global::<Import>().get_step();
    if step == "loading" || step == "executing" {
        return;
    }
    let completed = STATE.with_borrow(|s| s.completed);
    clear(app);
    app.global::<Settings>().set_dialog("".into());
    if completed {
        // 同期の失敗は致命的ではない
        if ctx::save_and_sync(app).is_ok() {
            super::refresh_sidebar_labels(app);
        }
    }
}

fn select_file(app: &AppWindow) {
    app.global::<Import>().set_error("".into());
    ctx::run_async(
        async {
            rfd::AsyncFileDialog::new()
                .add_filter("1Password Export", &["1pux"])
                .pick_file()
                .await
                .map(|f| f.path().to_path_buf())
        },
        |app, path| {
            let Some(path) = path else { return };
            set_step(&app, "loading");
            let file = path.clone();
            ctx::run_blocking(
                move || {
                    let bytes =
                        std::fs::read(&file).map_err(|e| format!("Failed to read file: {e}"))?;
                    let json = shared().vault.api_import_1pux_preview(bytes)?;
                    serde_json::from_str::<ImportPreview>(&json)
                        .map_err(|e| format!("Parse error: {e}"))
                },
                move |app, result| match result {
                    Ok(preview) => {
                        STATE.with_borrow_mut(|s| {
                            s.actions = preview
                                .items
                                .iter()
                                .map(|i| (i.source_id.clone(), i.default_action.clone()))
                                .collect();
                            s.preview = Some(preview);
                            s.file = Some(path);
                        });
                        set_step(&app, "preview");
                        refresh_preview(&app);
                    }
                    Err(e) => {
                        app.global::<Import>().set_error(e.into());
                        set_step(&app, "idle");
                    }
                },
            );
        },
    );
}

fn confidence_key(confidence: &DuplicateConfidence) -> &'static str {
    match confidence {
        DuplicateConfidence::High => "high",
        DuplicateConfidence::Medium => "medium",
        DuplicateConfidence::Low => "low",
    }
}

fn has_confidence(item: &ImportPreviewItem, confidence: &str) -> bool {
    item.duplicates
        .iter()
        .any(|d| confidence_key(&d.confidence) == confidence)
}

fn filtered_items<'a>(
    s: &'a State,
    search: &'a str,
) -> impl Iterator<Item = &'a ImportPreviewItem> + 'a {
    let query = search.to_lowercase();
    s.preview
        .iter()
        .flat_map(|p| p.items.iter())
        .filter(move |item| {
            if s.type_filter
                .as_deref()
                .is_some_and(|t| item.target_entry_type != t)
            {
                return false;
            }
            match s.dup_filter.as_deref() {
                Some("none") if !item.duplicates.is_empty() => return false,
                Some(c) if c != "none" && !has_confidence(item, c) => return false,
                _ => {}
            }
            if s.archived_filter && !item.is_archived {
                return false;
            }
            query.is_empty() || item.source_name.to_lowercase().contains(&query)
        })
}

fn chip(key: &str, text: String, variant: &str, clickable: bool) -> FilterChip {
    FilterChip {
        key: key.into(),
        text: text.into(),
        variant: variant.into(),
        clickable,
    }
}

fn refresh_counts(app: &AppWindow) {
    let count = STATE.with_borrow(|s| {
        s.actions
            .values()
            .filter(|a| !matches!(a, ImportAction::Skip))
            .count()
    });
    app.global::<Import>().set_import_count(count as i32);
}

fn refresh_preview(app: &AppWindow) {
    let import = app.global::<Import>();
    let search = import.get_search().to_string();
    STATE.with_borrow(|s| {
        let Some(preview) = &s.preview else { return };
        let mut subtitle = String::new();
        if !preview.source_account_name.is_empty() {
            subtitle.push_str(&format!("アカウント: {} · ", preview.source_account_name));
        }
        subtitle.push_str(&preview.source_vault_names.join(", "));
        import.set_subtitle(subtitle.into());

        let filtering = s.type_filter.is_some()
            || s.dup_filter.is_some()
            || s.archived_filter
            || !search.is_empty();
        let mut chips = vec![chip(
            "all",
            format!("合計 {} 件", preview.stats.total_items),
            if filtering { "secondary" } else { "default" },
            true,
        )];
        for (t, count) in &preview.stats.by_target_type {
            let active = s.type_filter.as_deref() == Some(t);
            chips.push(chip(
                &format!("type:{t}"),
                format!("{} {count}", entry_type_label(t)),
                if active { "primary" } else { "secondary" },
                true,
            ));
        }
        let none = preview
            .items
            .iter()
            .filter(|i| i.duplicates.is_empty())
            .count();
        let dup_counts = [
            ("none", none, format!("重複なし {none} 件")),
            ("high", 0, String::new()),
            ("medium", 0, String::new()),
            ("low", 0, String::new()),
        ];
        for (key, count, text) in dup_counts {
            let (count, text) = if key == "none" {
                (count, text)
            } else {
                let n = preview
                    .items
                    .iter()
                    .filter(|i| has_confidence(i, key))
                    .count();
                let label = match key {
                    "high" => "重複(高)",
                    "medium" => "重複(中)",
                    _ => "重複(低)",
                };
                (n, format!("{label} {n} 件"))
            };
            if count == 0 {
                continue;
            }
            let active = s.dup_filter.as_deref() == Some(key);
            let idle = if key == "none" {
                "secondary"
            } else {
                "destructive"
            };
            chips.push(chip(
                &format!("dup:{key}"),
                text,
                if active { "primary" } else { idle },
                true,
            ));
        }
        if preview.stats.archived_count > 0 {
            chips.push(chip(
                "archived",
                format!("アーカイブ済み {} 件", preview.stats.archived_count),
                if s.archived_filter {
                    "primary"
                } else {
                    "muted"
                },
                true,
            ));
        }
        if preview.stats.attachment_warning_count > 0 {
            chips.push(chip(
                "attachments",
                format!(
                    "添付ファイル警告 {} 件",
                    preview.stats.attachment_warning_count
                ),
                "muted",
                false,
            ));
        }
        import.set_chips(ModelRc::new(VecModel::from(chips)));

        let rows: Vec<ImportRow> = filtered_items(s, &search)
            .map(|item| {
                let mut actions: Vec<SharedString> = vec!["取り込む".into(), "スキップ".into()];
                actions.extend(
                    item.duplicates
                        .iter()
                        .map(|d| SharedString::from(format!("上書き: {}", d.existing_entry_name))),
                );
                let action_index = match s.actions.get(&item.source_id) {
                    Some(ImportAction::Import) => 0,
                    Some(ImportAction::Overwrite { existing_entry_id }) => item
                        .duplicates
                        .iter()
                        .position(|d| &d.existing_entry_id == existing_entry_id)
                        .map(|i| i as i32 + 2)
                        .unwrap_or(1),
                    _ => 1,
                };
                let duplicate = item.duplicates.first().map(|d| {
                    let confidence = match d.confidence {
                        DuplicateConfidence::High => " (高)",
                        DuplicateConfidence::Medium => " (中)",
                        DuplicateConfidence::Low => " (低)",
                    };
                    format!("重複: {}{confidence}", d.existing_entry_name)
                });
                ImportRow {
                    source_id: item.source_id.as_str().into(),
                    name: item.source_name.as_str().into(),
                    type_label: entry_type_label(&item.target_entry_type).into(),
                    archived: item.is_archived,
                    category: if item.source_category.is_direct_mapping {
                        SharedString::default()
                    } else {
                        item.source_category.category_name.as_str().into()
                    },
                    has_attachments: item.has_attachments,
                    duplicate: duplicate.unwrap_or_default().into(),
                    actions: ModelRc::new(VecModel::from(actions)),
                    action_index,
                }
            })
            .collect();
        import.set_rows(ModelRc::new(VecModel::from(rows)));
    });
    refresh_counts(app);
}

fn execute(app: &AppWindow) {
    let Some((file, actions)) = STATE.with_borrow(|s| {
        let preview = s.preview.as_ref()?;
        let actions: Vec<ImportItemAction> = preview
            .items
            .iter()
            .map(|item| ImportItemAction {
                source_id: item.source_id.clone(),
                action: s
                    .actions
                    .get(&item.source_id)
                    .cloned()
                    .unwrap_or(ImportAction::Skip),
                target_entry_type: Some(item.target_entry_type.clone()),
            })
            .collect();
        Some((s.file.clone()?, actions))
    }) else {
        return;
    };
    let import = app.global::<Import>();
    import.set_error("".into());
    set_step(app, "executing");
    ctx::run_blocking(
        move || {
            let bytes = std::fs::read(&file).map_err(|e| format!("Failed to read file: {e}"))?;
            let actions_json = serde_json::to_string(&actions).map_err(|e| e.to_string())?;
            let json = shared()
                .vault
                .api_import_1pux_execute(bytes, actions_json)?;
            serde_json::from_str::<ImportResult>(&json).map_err(|e| format!("Parse error: {e}"))
        },
        |app, result| match result {
            Ok(result) => show_result(&app, result),
            Err(e) => {
                app.global::<Import>().set_error(e.into());
                set_step(&app, "preview");
            }
        },
    );
}

fn show_result(app: &AppWindow, result: ImportResult) {
    STATE.with_borrow_mut(|s| s.completed = true);
    let import = app.global::<Import>();
    let mut chips = Vec::new();
    for (count, text, variant) in [
        (result.created_count, "作成", "success"),
        (result.overwritten_count, "上書き", "primary"),
        (result.skipped_count, "スキップ", "muted"),
        (result.error_count, "エラー", "destructive"),
    ] {
        if count > 0 {
            chips.push(chip("", format!("{text} {count} 件"), variant, false));
        }
    }
    import.set_result_chips(ModelRc::new(VecModel::from(chips)));
    import.set_labels_created(result.labels_created.join(", ").into());
    let errors: Vec<SharedString> = result
        .items
        .iter()
        .filter(|i| !i.success)
        .map(|i| format!("{}: {}", i.source_name, i.error.as_deref().unwrap_or("")).into())
        .collect();
    import.set_result_errors(ModelRc::new(VecModel::from(errors)));
    set_step(app, "result");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_action_json_matches_old_frontend() {
        assert_eq!(
            serde_json::to_string(&ImportAction::Import).unwrap(),
            "\"import\""
        );
        assert_eq!(
            serde_json::to_string(&ImportAction::Skip).unwrap(),
            "\"skip\""
        );
        assert_eq!(
            serde_json::to_value(ImportAction::Overwrite {
                existing_entry_id: "x".into()
            })
            .unwrap(),
            serde_json::json!({"overwrite": {"existing_entry_id": "x"}})
        );
        let parsed: ImportAction =
            serde_json::from_str(r#"{"overwrite":{"existing_entry_id":"y"}}"#).unwrap();
        assert_eq!(
            parsed,
            ImportAction::Overwrite {
                existing_entry_id: "y".into()
            }
        );
    }
}
