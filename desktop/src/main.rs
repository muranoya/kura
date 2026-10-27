// Windows のリリースビルドでコンソールウィンドウを出さない
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod ctx;
mod fields;
mod markdown;
mod paths;
mod qr;
mod s3;
mod screens;
mod store;
mod vault;

slint::include_modules!();

fn main() -> Result<(), slint::PlatformError> {
    // S3 通信と重い暗号処理は tokio 側で行い、UI は Slint のイベントループ（メインスレッド）で動かす
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to start the async runtime");

    let app = AppWindow::new()?;
    ctx::init(runtime.handle().clone(), &app);

    // トレイが使えない環境（StatusNotifier のない Linux デスクトップなど）でもアプリ自体は動かす
    let tray = match AppTray::new() {
        Ok(tray) => Some(tray),
        Err(e) => {
            eprintln!("System tray is unavailable: {e}");
            None
        }
    };
    screens::setup(&app, tray);

    // 表示中のトレイアイコンはイベントループを生かし続けるので、ウィンドウを閉じたら明示的に終了する。
    // そうしないとアンロックされたまま裏で動き続け、ウィンドウも二度と開けなくなる
    app.window().on_close_requested(|| {
        let _ = slint::quit_event_loop();
        slint::CloseRequestResponse::HideWindow
    });

    app.run()?;

    // 終了時もメモリ上の vault をロックしてから抜ける
    let _ = ctx::shared().vault.api_lock();
    drop(runtime);
    Ok(())
}
