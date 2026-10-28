//! センシティブな値のコピーと自動クリア（旧 lib/clipboard.ts）

use std::cell::RefCell;
use std::time::Duration;

use crate::ctx::shared;

thread_local! {
    static CLIPBOARD: RefCell<Option<arboard::Clipboard>> = const { RefCell::new(None) };
    // タイマーは常に1つだけ（新しいコピーで前のタイマーをキャンセル）
    static CLEAR_TIMER: slint::Timer = slint::Timer::default();
    static LAST_COPIED: RefCell<Option<zeroize::Zeroizing<String>>> = const { RefCell::new(None) };
}

fn with_clipboard<T>(
    f: impl FnOnce(&mut arboard::Clipboard) -> Result<T, arboard::Error>,
) -> Result<T, String> {
    CLIPBOARD.with_borrow_mut(|slot| {
        if slot.is_none() {
            // X11 ではクリップボードの所有者がこのオブジェクトなので、使い回して生かしておく
            *slot = Some(arboard::Clipboard::new().map_err(|e| e.to_string())?);
        }
        f(slot.as_mut().expect("clipboard initialized")).map_err(|e| e.to_string())
    })
}

/// クリップボードにコピーし、設定に応じて自動クリアタイマーを開始する。
/// クリア前にクリップボードの内容を確認し、コピーした値と同じ場合のみクリアする
pub fn copy_sensitive(text: &str) -> Result<(), String> {
    with_clipboard(|c| set_text_excluded_from_history(c, text))?;
    LAST_COPIED.with_borrow_mut(|last| *last = Some(zeroize::Zeroizing::new(text.to_string())));

    let clear_seconds = shared().store.app_settings().clipboard_clear_seconds;
    CLEAR_TIMER.with(|timer| {
        timer.stop();
        if clear_seconds > 0 {
            timer.start(
                slint::TimerMode::SingleShot,
                Duration::from_secs(clear_seconds),
                clear_if_unchanged,
            );
        }
    });
    Ok(())
}

/// 自動クリア待ちの値があれば、タイマーを待たずに今クリアする（終了時用。終了するとタイマーは発火しない）
pub fn clear_pending() {
    if CLEAR_TIMER.with(slint::Timer::running) {
        CLEAR_TIMER.with(slint::Timer::stop);
        clear_if_unchanged();
    }
}

/// OS やクリップボードマネージャーの履歴（自動クリアでは消せない）に残らないようにしてコピーする
fn set_text_excluded_from_history(
    clipboard: &mut arboard::Clipboard,
    text: &str,
) -> Result<(), arboard::Error> {
    #[cfg(target_os = "macos")]
    use arboard::SetExtApple;
    #[cfg(all(
        unix,
        not(any(target_os = "macos", target_os = "android", target_os = "emscripten"))
    ))]
    use arboard::SetExtLinux;
    #[cfg(windows)]
    use arboard::SetExtWindows;

    clipboard
        .set()
        .exclude_from_history()
        .text(text.to_string())
}

fn clear_if_unchanged() {
    let last = LAST_COPIED.with_borrow_mut(Option::take);
    let current = with_clipboard(|c| c.get_text());
    let unchanged = match (&current, &last) {
        (Ok(current), Some(last)) => current.as_str() == last.as_str(),
        // 読み取りに失敗した場合は安全側に倒して無条件にクリアする
        (Err(_), _) => true,
        (Ok(_), None) => false,
    };
    if unchanged {
        if let Err(e) = with_clipboard(|c| c.clear()) {
            eprintln!("Failed to clear clipboard: {e}");
        }
    }
}
