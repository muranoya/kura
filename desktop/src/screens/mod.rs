//! 画面遷移とアプリ全体の状態遷移（旧 App.tsx）

mod auth;
mod entries;
mod form;
mod import;
mod labels;
mod onboarding;
mod settings;

use std::cell::{Cell, RefCell};
use std::time::Duration;

use slint::{ComponentHandle, ModelRc, VecModel};

use crate::ctx::{self, shared};
use crate::{
    clipboard, fields, markdown, vault, AppTray, AppWindow, Confirm, Errors, LabelItem, Nav, Page,
    PwGen, SyncState, Util,
};

thread_local! {
    static TRAY: RefCell<Option<AppTray>> = const { RefCell::new(None) };
    static PERIODIC_SYNC: slint::Timer = slint::Timer::default();
    static CLOCK: slint::Timer = slint::Timer::default();
    static AUTOLOCK: slint::Timer = slint::Timer::default();
    static UNLOCKED: Cell<bool> = const { Cell::new(false) };
}

pub fn setup(app: &AppWindow, tray: Option<AppTray>) {
    if let Some(tray) = &tray {
        let weak = app.as_weak();
        tray.on_quit(move || {
            if let Some(app) = weak.upgrade() {
                let _ = app.hide();
            }
            let _ = slint::quit_event_loop();
        });
    }
    TRAY.with_borrow_mut(|t| *t = tray);

    setup_util(app);
    setup_nav(app);
    setup_confirm(app);
    setup_sync(app);
    setup_generator(app);
    setup_autolock(app);

    onboarding::setup(app);
    auth::setup(app);
    entries::setup(app);
    form::setup(app);
    labels::setup(app);
    settings::setup(app);
    import::setup(app);

    initial_state(app);
}

fn setup_util(app: &AppWindow) {
    let util = app.global::<Util>();
    let weak = app.as_weak();
    util.on_copy(move |text| {
        if let Err(e) = clipboard::copy_sensitive(&text) {
            if let Some(app) = weak.upgrade() {
                ctx::push_error(
                    &app,
                    format!("コピーに失敗しました: {e}"),
                    Some("clipboard"),
                );
            }
        }
    });
    let weak = app.as_weak();
    util.on_open_url(move |url| {
        if let Err(e) = open::that_detached(url.as_str()) {
            if let Some(app) = weak.upgrade() {
                ctx::push_error(
                    &app,
                    format!("URL を開けませんでした: {e}"),
                    Some("open-url"),
                );
            }
        }
    });
    util.on_render_markdown(|source| markdown::render(&source));
    util.on_entry_type_label(|t| fields::entry_type_label(&t).into());

    let errors = app.global::<Errors>();
    errors.on_dismiss(ctx::handler(app, ctx::dismiss_latest_error));
}

fn setup_nav(app: &AppWindow) {
    let nav = app.global::<Nav>();
    let weak = app.as_weak();
    nav.on_navigate(move |page| {
        if let Some(app) = weak.upgrade() {
            navigate(&app, page);
        }
    });
    let weak = app.as_weak();
    nav.on_open_label(move |id, name| {
        if let Some(app) = weak.upgrade() {
            let nav = app.global::<Nav>();
            nav.set_label_id(id);
            nav.set_label_name(name);
            navigate(&app, Page::LabelEntries);
        }
    });
}

/// 画面を切り替え、遷移先の初期化を行う
pub fn navigate(app: &AppWindow, page: Page) {
    let nav = app.global::<Nav>();
    let previous = nav.get_page();
    // フォームから一覧に戻る場合だけ選択を引き継ぐ（旧実装の location.state.selectedId）
    let from_form = matches!(previous, Page::EntryEdit | Page::EntryCreate);
    nav.set_page(page);
    match page {
        Page::StorageSetup => onboarding::enter_storage_setup(app),
        Page::Entries | Page::Favorites | Page::LabelEntries => entries::enter(app, from_form),
        Page::Trash => entries::enter_trash(app),
        Page::EntryCreate => form::enter_create(app),
        Page::Labels => labels::enter(app),
        Page::Settings => settings::enter(app),
        _ => {}
    }
    if UNLOCKED.get() {
        refresh_sidebar_labels(app);
    }
}

pub fn refresh_sidebar_labels(_app: &AppWindow) {
    ctx::run_blocking(
        || shared().vault.api_list_labels(),
        |app, result| {
            if let Ok(labels) = result {
                let items: Vec<LabelItem> = labels
                    .into_iter()
                    .map(|l| LabelItem {
                        id: l.id.into(),
                        name: l.name.into(),
                        selected: false,
                    })
                    .collect();
                app.global::<Nav>()
                    .set_labels(ModelRc::new(VecModel::from(items)));
            }
        },
    );
}

/// 同期でデータが変わったときに、表示中の画面を読み込み直す（旧 SyncContext.notifySynced）
pub fn notify_synced(app: &AppWindow) {
    refresh_sidebar_labels(app);
    match app.global::<Nav>().get_page() {
        Page::Entries | Page::Favorites | Page::LabelEntries => entries::reload(app),
        Page::Trash => entries::reload_trash(app),
        Page::Labels => labels::reload(app),
        _ => {}
    }
}

fn setup_confirm(app: &AppWindow) {
    let weak = app.as_weak();
    app.global::<Confirm>().on_confirmed(move |action| {
        let Some(app) = weak.upgrade() else { return };
        match action.as_str() {
            "delete-entry" => entries::delete_confirmed(&app),
            "purge-entry" => entries::purge_confirmed(&app),
            "delete-label" => labels::delete_confirmed(&app),
            "export" => settings::export_confirmed(&app),
            "logout-lock" | "logout-settings" => logout(&app),
            other => eprintln!("Unknown confirm action: {other}"),
        }
    });
}

pub fn close_confirm(app: &AppWindow) {
    let confirm = app.global::<Confirm>();
    confirm.set_processing(false);
    confirm.set_open(false);
}

pub fn open_confirm(
    app: &AppWindow,
    action: &str,
    title: &str,
    description: &str,
    confirm_text: &str,
    dangerous: bool,
) {
    let confirm = app.global::<Confirm>();
    confirm.set_action(action.into());
    confirm.set_title(title.into());
    confirm.set_description(description.into());
    confirm.set_confirm_text(confirm_text.into());
    confirm.set_dangerous(dangerous);
    confirm.set_processing(false);
    confirm.set_open(true);
}

// ---------------------------------------------------------------------------
// 起動・アンロック・ロック・ログアウト
// ---------------------------------------------------------------------------

fn initial_state(app: &AppWindow) {
    onboarding::load_terms(app);
    if !vault::vault_file_exists() {
        navigate(app, Page::Welcome);
        return;
    }
    let result = vault::read_vault_file().and_then(|bytes| match bytes {
        Some(bytes) => shared().vault.api_load_vault(bytes, String::new()),
        None => Ok(()),
    });
    match result {
        Ok(()) => show_locked(app),
        Err(e) => {
            eprintln!("Failed to initialize app: {e}");
            navigate(app, Page::Welcome);
        }
    }
}

fn set_tray_locked(locked: bool) {
    TRAY.with_borrow(|tray| {
        if let Some(tray) = tray {
            tray.set_locked(locked);
        }
    });
}

fn show_locked(app: &AppWindow) {
    UNLOCKED.set(false);
    set_tray_locked(true);
    navigate(app, Page::Lock);
}

/// アンロック直後の共通処理
pub fn enter_unlocked(app: &AppWindow) {
    UNLOCKED.set(true);
    set_tray_locked(false);
    ctx::refresh_sync_header(app);
    PERIODIC_SYNC.with(|timer| {
        let weak = app.as_weak();
        timer.start(
            slint::TimerMode::Repeated,
            Duration::from_secs(60),
            move || {
                if let Some(app) = weak.upgrade() {
                    periodic_sync(&app);
                }
            },
        );
    });
    navigate(app, Page::Entries);
}

fn periodic_sync(_app: &AppWindow) {
    ctx::run_async(ctx::sync_if_configured(), |app, result| match result {
        Ok(synced) => {
            ctx::refresh_sync_header(&app);
            if synced {
                notify_synced(&app);
            }
        }
        Err(_) => ctx::push_error(&app, "同期に失敗しました", Some("periodic-sync")),
    });
}

fn stop_unlocked_timers() {
    PERIODIC_SYNC.with(slint::Timer::stop);
    AUTOLOCK.with(slint::Timer::stop);
}

/// 画面上に残っている機密情報（詳細・フォーム・生成パスワードなど）を消す
fn clear_sensitive_ui(app: &AppWindow) {
    entries::clear(app);
    form::clear(app);
    settings::clear(app);
    import::clear(app);
    app.global::<PwGen>().set_password("".into());
    app.global::<crate::LargeText>().set_open(false);
    app.global::<crate::LargeText>().set_value("".into());
    close_confirm(app);
    ctx::clear_errors(app);
}

/// ロックして vault をファイルへ書き出す
pub fn lock(app: &AppWindow) {
    if !UNLOCKED.get() {
        return;
    }
    stop_unlocked_timers();
    match shared().vault.api_lock() {
        Ok(bytes) => {
            if let Err(e) = vault::write_vault_file(&bytes) {
                eprintln!("Failed to write vault on lock: {e}");
            }
        }
        Err(e) => eprintln!("Lock failed: {e}"),
    }
    shared().set_s3_config(None);
    clear_sensitive_ui(app);
    show_locked(app);
}

/// 設定とローカルキャッシュを削除し、初期設定からやり直す
fn logout(app: &AppWindow) {
    stop_unlocked_timers();
    let _ = shared().vault.api_lock();
    let result = shared()
        .store
        .clear()
        .and_then(|()| vault::delete_vault_file());
    if let Err(e) = result {
        close_confirm(app);
        if UNLOCKED.get() {
            ctx::push_error(app, format!("ログアウトに失敗しました: {e}"), None);
        } else {
            auth::set_error(app, &format!("ログアウト失敗: {e}"));
        }
        return;
    }
    UNLOCKED.set(false);
    shared().set_s3_config(None);
    shared().set_pending_s3_config(None);
    clear_sensitive_ui(app);
    onboarding::reset(app);
    auth::reset(app);
    set_tray_locked(true);
    app.global::<Nav>().set_labels(ModelRc::default());
    navigate(app, Page::Welcome);
}

// ---------------------------------------------------------------------------
// 同期ボタン・パスワード生成・自動ロック
// ---------------------------------------------------------------------------

fn setup_sync(app: &AppWindow) {
    let sync = app.global::<SyncState>();
    let weak = app.as_weak();
    sync.on_sync_now(move || {
        let Some(app) = weak.upgrade() else { return };
        let Some(config) = shared().s3_config() else {
            return;
        };
        app.global::<SyncState>().set_syncing(true);
        ctx::run_async(async move { vault::sync(&config).await }, |app, result| {
            app.global::<SyncState>().set_syncing(false);
            match result {
                Ok(result) => {
                    if let Some(ts) = result.last_synced_at {
                        let _ = shared().store.set(crate::store::keys::LAST_SYNC_TIME, &ts);
                    }
                    ctx::refresh_sync_header(&app);
                    if result.synced {
                        notify_synced(&app);
                    }
                }
                Err(e) => ctx::push_error(
                    &app,
                    format!("同期に失敗しました: {e}"),
                    Some("manual-sync"),
                ),
            }
        });
    });

    // 「n分前」の表示を定期的に更新する
    CLOCK.with(|timer| {
        let weak = app.as_weak();
        timer.start(
            slint::TimerMode::Repeated,
            Duration::from_secs(30),
            move || {
                if let Some(app) = weak.upgrade() {
                    if UNLOCKED.get() {
                        ctx::refresh_sync_header(&app);
                    }
                }
            },
        );
    });
}

fn setup_generator(app: &AppWindow) {
    let weak = app.as_weak();
    app.global::<PwGen>().on_generate(move || {
        let Some(app) = weak.upgrade() else { return };
        let generator = app.global::<PwGen>();
        let result = vault_core::api::api_generate_password(
            generator.get_length().round() as i32,
            generator.get_lowercase(),
            generator.get_uppercase(),
            generator.get_numbers(),
            generator.get_symbols1(),
            generator.get_symbols2(),
            generator.get_symbols3(),
        );
        match result {
            Ok(password) => generator.set_password(password.into()),
            Err(e) => eprintln!("Failed to generate password: {e}"),
        }
    });
}

/// ウィンドウのフォーカスが外れてから設定時間が経つと自動でロックする
fn setup_autolock(app: &AppWindow) {
    use slint::winit_030::{winit, EventResult, WinitWindowAccessor};

    let weak = app.as_weak();
    app.window().on_winit_window_event(move |_window, event| {
        if let winit::event::WindowEvent::Focused(focused) = event {
            if let Some(app) = weak.upgrade() {
                on_focus_changed(&app, *focused);
            }
        }
        EventResult::Propagate
    });
}

fn on_focus_changed(app: &AppWindow, focused: bool) {
    AUTOLOCK.with(|timer| {
        timer.stop();
        if focused || !UNLOCKED.get() {
            return;
        }
        let minutes = shared().store.app_settings().autolock_minutes;
        if minutes == 0 {
            return;
        }
        let weak = app.as_weak();
        timer.start(
            slint::TimerMode::SingleShot,
            Duration::from_secs(minutes * 60),
            move || {
                if let Some(app) = weak.upgrade() {
                    lock(&app);
                }
            },
        );
    });
}
