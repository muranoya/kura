fn main() {
    // アプリはライトテーマのみ。OS のダークモード設定に引きずられないよう fluent-light に固定する
    let config = slint_build::CompilerConfiguration::new().with_style("fluent-light".into());
    slint_build::compile_with_config("ui/app.slint", config).expect("Slint build failed");
}
