set shell := ["bash", "-c"]
set positional-arguments := true

# ディレクトリの定義
DESKTOP_DIR := "desktop"
EXTENSION_DIR := "extension"
VAULT_CORE_DIR := "vault-core"
ANDROID_DIR := "android"
ANDROID_JNI_DIR := "android/rust-jni"

# Android SDK
ANDROID_HOME := env("ANDROID_HOME", env("ANDROID_SDK_ROOT", "~/Android/Sdk"))
ADB := ANDROID_HOME / "platform-tools/adb"
EMULATOR := ANDROID_HOME / "emulator/emulator"

# デフォルトレシピ
default: help

# VERSION ファイルの内容を各ターゲット（package.json / Cargo.toml 等）に反映
@_sync-version:
	node scripts/sync-version.mjs

# Desktop app - Generate icons from SVG（ウィンドウ・トレイ・インストーラ用の PNG）
@_desktop-icons:
	echo "🎨 Generating desktop icons..."
	bash assets/icons/convert2png.sh

# cargo-packager がなければ入れる（インストーラ生成に使う）
@_cargo-packager:
	command -v cargo-packager >/dev/null || cargo install cargo-packager --locked

# cargo-about がなければ入れる（サードパーティライセンス一覧の生成に使う）
@_cargo-about:
	command -v cargo-about >/dev/null || cargo install cargo-about --locked --features cli

# Desktop app - About 画面のサードパーティライセンス一覧（desktop/third-party-licenses.json）を作り直す
@desktop-licenses: _cargo-about
	echo "📜 Generating desktop third-party licenses..."
	cargo about generate --format json -m {{DESKTOP_DIR}}/Cargo.toml -c {{DESKTOP_DIR}}/about.toml --locked --fail | node scripts/desktop-licenses.mjs

# バンドルしている外部データ（PSL・Passkey の特権アプリ許可リスト）を配布元から取り直す
@update-assets:
	echo "🌐 Updating bundled external assets..."
	node scripts/update-assets.mjs

# Desktop app - Development
@dev-desktop: _sync-version _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🚀 Starting desktop app in development mode..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "💡 Debug builds use the net.meshpeak.kura.debug data directory (override with KURA_DATA_DIR)"
	echo ""
	cargo run -p kura-desktop

# Desktop app - Linux (AppImage + deb)
@release-desktop-linux: _sync-version _desktop-icons desktop-licenses _cargo-packager
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building desktop app for Linux (AppImage + deb)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	cargo build --release -p kura-desktop
	cd {{DESKTOP_DIR}} && cargo packager --release --formats appimage,deb
	echo ""
	echo "✅ Linux build completed!"
	echo "  - Output: target/packager/"

# Desktop app - macOS (DMG, Apple Silicon / arm64 only, ad-hoc signed)
@release-desktop-macos: _sync-version _desktop-icons desktop-licenses _cargo-packager
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building desktop app for macOS arm64 (DMG, ad-hoc signed)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	cargo build --release -p kura-desktop --target aarch64-apple-darwin
	cd {{DESKTOP_DIR}} && cargo packager --release --target aarch64-apple-darwin --formats dmg
	echo ""
	echo "✅ macOS build completed!"
	echo "  - Output: target/packager/"

# Desktop app - Windows (NSIS installer)
@release-desktop-windows: _sync-version _desktop-icons desktop-licenses _cargo-packager
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building desktop app for Windows (NSIS)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	cargo build --release -p kura-desktop
	cd {{DESKTOP_DIR}} && cargo packager --release --formats nsis
	echo ""
	echo "✅ Windows build completed!"
	echo "  - Output: target/packager/"

# Extension - Generate icons from SVG
@_extension-icons:
	echo "🎨 Generating extension icons..."
	bash assets/icons/convert2png.sh

# Browser extension (Chrome + Firefox)
@release-extension: _sync-version _extension-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building browser extensions (Chrome + Firefox)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Building WASM package from vault-core..."
	wasm-pack build {{EXTENSION_DIR}}/wasm-bridge --target bundler --out-dir ../wasm
	echo ""
	echo "📥 Installing dependencies..."
	cd {{EXTENSION_DIR}} && pnpm install
	echo ""
	echo "🏗️  Building Chrome extension..."
	cd {{EXTENSION_DIR}} && pnpm run build
	echo ""
	echo "📦 Packaging Chrome extension..."
	rm -f {{EXTENSION_DIR}}/kura-extension-chrome.zip
	cd {{EXTENSION_DIR}}/dist && zip -r ../kura-extension-chrome.zip .
	echo ""
	echo "🏗️  Building Firefox extension..."
	cd {{EXTENSION_DIR}} && pnpm run build:firefox
	echo ""
	echo "📦 Packaging Firefox extension..."
	rm -f {{EXTENSION_DIR}}/kura-extension-firefox.zip
	cd {{EXTENSION_DIR}}/dist && zip -r ../kura-extension-firefox.zip .
	echo ""
	echo "✅ Extension build completed!"
	echo "  - Chrome:  {{EXTENSION_DIR}}/kura-extension-chrome.zip"
	echo "  - Firefox: {{EXTENSION_DIR}}/kura-extension-firefox.zip"

# AMO 提出用ソースコードバンドル (git archive ベース、HEAD のみ)
@source-bundle-extension:
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "📚 Building AMO source bundle..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	cd {{EXTENSION_DIR}} && pnpm exec tsx scripts/source-bundle.ts


# Browser extension - Development (HMR付き)
@dev-extension: _sync-version _extension-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🚀 Starting extension in development mode..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Building WASM package from vault-core..."
	wasm-pack build {{EXTENSION_DIR}}/wasm-bridge --target web --out-dir ../wasm
	echo ""
	echo "📥 Installing dependencies..."
	cd {{EXTENSION_DIR}} && pnpm install
	echo ""
	echo "🔌 Starting extension dev server..."
	cd {{EXTENSION_DIR}} && pnpm run dev

# Android app - Generate icons from SVG
@_android-icons:
	echo "🎨 Generating Android icons..."
	bash assets/icons/convert2png.sh

# Android app - Build native libraries (Rust → .so)
@build-android-jni: _sync-version _android-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🦀 Building vault_jni native libraries for Android..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	if ! command -v cargo-ndk &> /dev/null; then \
		echo "📥 Installing cargo-ndk..."; \
		cargo install cargo-ndk; \
	fi
	echo "🔧 Building for arm64-v8a (aarch64)..."
	cargo ndk -t arm64-v8a -o {{ANDROID_DIR}}/app/src/main/jniLibs build --manifest-path {{ANDROID_JNI_DIR}}/Cargo.toml --release
	echo ""
	echo "🔧 Building for armeabi-v7a (armv7)..."
	cargo ndk -t armeabi-v7a -o {{ANDROID_DIR}}/app/src/main/jniLibs build --manifest-path {{ANDROID_JNI_DIR}}/Cargo.toml --release
	echo ""
	echo "🔧 Building for x86_64..."
	cargo ndk -t x86_64 -o {{ANDROID_DIR}}/app/src/main/jniLibs build --manifest-path {{ANDROID_JNI_DIR}}/Cargo.toml --release
	echo ""
	echo "🔧 Building for x86..."
	cargo ndk -t x86 -o {{ANDROID_DIR}}/app/src/main/jniLibs build --manifest-path {{ANDROID_JNI_DIR}}/Cargo.toml --release
	echo ""
	echo "✅ Native libraries built!"
	echo "  - Output: {{ANDROID_DIR}}/app/src/main/jniLibs/"

# Android app - Debug build
@build-android-debug: build-android-jni
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🤖 Building Android app (debug)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	cd {{ANDROID_DIR}} && ./gradlew assembleDebug
	echo ""
	echo "✅ Android debug build completed!"
	echo "  - APK: {{ANDROID_DIR}}/app/build/outputs/apk/debug/app-debug.apk"

# Android app - Release build
@release-android: build-android-jni
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🤖 Building Android app (release)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	cd {{ANDROID_DIR}} && ./gradlew assembleRelease
	echo ""
	echo "✅ Android release build completed!"
	echo "  - APK: {{ANDROID_DIR}}/app/build/outputs/apk/release/app-release-unsigned.apk"

# Android app - Build & install on USB-connected device
@run-android-device: build-android-debug
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "📱 Installing app on USB-connected device..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	DEVICE_COUNT=$({{ADB}} devices | grep -w "device" | grep -v "List" | wc -l); \
	if [ "$DEVICE_COUNT" -eq 0 ]; then \
		echo "❌ No device found. Check USB connection and USB debugging is enabled."; \
		exit 1; \
	fi; \
	echo "🔍 Connected device(s):"; \
	{{ADB}} devices -l | grep -w "device" | grep -v "List"
	echo ""
	echo "📦 Installing APK..."
	{{ADB}} -d install -r {{ANDROID_DIR}}/app/build/outputs/apk/debug/app-debug.apk
	echo ""
	echo "🚀 Starting app..."
	{{ADB}} -d shell am start -n net.meshpeak.kura.debug/net.meshpeak.kura.MainActivity
	echo ""
	echo "✅ App is running on device! Use '{{ADB}} -d logcat | grep kura' for logs"

# Android app - Build, launch emulator, install and start (all ABIs)
@run-android: build-android-debug
	just _run-android-emulator

# Android app - Launch emulator, install APK and start app
@_run-android-emulator:
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "📱 Launching Android emulator and installing app..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	AVD=$({{EMULATOR}} -list-avds | head -1); \
	if [ -z "$AVD" ]; then \
		echo "❌ No AVD found. Create one with Android Studio or avdmanager."; \
		exit 1; \
	fi; \
	echo "🔍 Using AVD: $AVD"; \
	if ! {{ADB}} devices | grep -q "emulator.*device"; then \
		echo "🚀 Starting emulator..."; \
		{{EMULATOR}} -avd "$AVD" &>/dev/null & \
		echo "⏳ Waiting for emulator to boot..."; \
		{{ADB}} wait-for-device; \
		while [ "$({{ADB}} shell getprop sys.boot_completed 2>/dev/null)" != "1" ]; do \
			sleep 1; \
		done; \
		echo "✅ Emulator booted!"; \
	else \
		echo "✅ Emulator already running"; \
	fi
	echo ""
	echo "📦 Installing APK..."
	{{ADB}} install -r {{ANDROID_DIR}}/app/build/outputs/apk/debug/app-debug.apk
	echo ""
	echo "🚀 Starting app..."
	{{ADB}} shell am start -n net.meshpeak.kura.debug/net.meshpeak.kura.MainActivity
	echo ""
	echo "✅ App is running! Use '{{ADB}} logcat | grep kura' for logs"

# Build all releases
@release-all:
	echo ""
	echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗"
	echo "║                    kura Release Build                  ║"
	echo "║         Building all apps: Android, Desktop,           ║"
	echo "║              Extension, and other clients              ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"
	just release-android
	just release-desktop-linux
	just release-extension
	echo ""
	echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗"
	echo "║                 🎉 All releases completed!             ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"

# vault-core のテスト
# --all-features必須: api/importモジュールはdesktop/android/wasm featureでgateされており、
# feature指定なしだとコンパイル・テストされずに素通りしてしまう
@test-vault-core:
	echo "🧪 Testing vault-core..."
	cargo test --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml --all-features
	echo "✅ vault-core tests passed!"

# extension のテスト（wasm-bridge + TypeScript）
# generate-etld/generate-patternsはgitignore対象の自動生成ファイルを作るため、
# check-extensionを経ずに単体実行してもtestが通るようここで明示的に生成する
@test-extension:
	echo "🧪 Testing extension (wasm-bridge)..."
	cargo test --manifest-path {{EXTENSION_DIR}}/wasm-bridge/Cargo.toml
	echo "🔧 Generating code (eTLD + patterns)..."
	cd {{EXTENSION_DIR}} && pnpm install --silent && pnpm run generate-etld && pnpm run generate-patterns
	echo "🧪 Testing extension (TypeScript)..."
	cd {{EXTENSION_DIR}} && pnpm test
	echo "✅ extension tests passed!"

# Android のテスト
@test-android: _android-icons
	echo "🧪 Testing Android..."
	cd {{ANDROID_DIR}} && ./gradlew testDebugUnitTest
	echo "✅ Android tests passed!"

# Desktop のテスト
@test-desktop: _desktop-icons
	echo "🧪 Testing desktop..."
	cargo test -p kura-desktop
	echo "✅ desktop tests passed!"

# Extension - Start manual autofill test environment (fixture + MinIO + test pages)
test-manual-autofill:
	#!/usr/bin/env bash
	set -euo pipefail
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🧪 Starting autofill manual test environment..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Generating vault fixture..."
	cargo test -p vault_core --test generate_test_vault -- --ignored
	echo ""
	echo "🐳 Starting MinIO..."
	docker compose -f docker-compose.test.yml up -d --wait minio
	echo ""
	echo "🪣 Creating bucket..."
	docker compose -f docker-compose.test.yml run --rm createbuckets
	echo ""
	echo "📦 Seeding vault data..."
	docker compose -f docker-compose.test.yml run --rm seedvault
	echo ""
	echo "✅ Environment ready!"
	echo ""
	echo "  Master Password: kura-test"
	echo ""
	echo "  Transfer Config (設定転送文字列):"
	echo "  $(cat {{EXTENSION_DIR}}/test-pages/fixtures/transfer-config.txt)"
	echo ""
	echo "  拡張機能のオンボーディングで「設定を転送」を選び、"
	echo "  上記の文字列とマスターパスワード kura-test を入力してください。"
	echo ""
	echo "🌐 Starting test page server..."
	cd {{EXTENSION_DIR}} && npx tsx test-pages/server.ts

# Extension - Stop manual autofill test environment
@test-manual-autofill-stop:
	echo "🛑 Stopping MinIO..."
	docker compose -f docker-compose.test.yml down
	echo "✅ Test environment stopped."

# 全テスト実行
@test-all:
	just test-vault-core
	just test-extension
	just test-android
	just test-desktop
	echo ""
	echo "✅ All tests passed!"

# vault-core - Lint & format check (Rust)
@check-vault-core:
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔍 Checking vault-core (lint & format)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Cargo clippy (vault-core)..."
	cargo clippy --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml --all-features -- -D warnings
	echo ""
	echo "🦀 Cargo fmt check (vault-core)..."
	cargo fmt --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml -- --check
	echo ""
	echo "✅ vault-core checks passed!"

# Desktop app - Lint & format check (Rust + Slint)
@check-desktop: _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔍 Checking desktop app (lint & format)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Cargo clippy (desktop + Slint UI)..."
	cargo clippy -p kura-desktop --all-targets -- -D warnings
	echo ""
	echo "🦀 Cargo fmt check (desktop)..."
	cargo fmt -p kura-desktop -- --check
	echo ""
	echo "✅ Desktop checks passed!"

# Browser extension - Lint & format check (TypeScript + Biome + Rust)
@check-extension:
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔍 Checking extension (lint & format)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Building WASM package..."
	wasm-pack build {{EXTENSION_DIR}}/wasm-bridge --target bundler --out-dir ../wasm
	echo ""
	echo "📥 Installing dependencies..."
	cd {{EXTENSION_DIR}} && pnpm install --silent
	echo ""
	echo "🔧 Generating code (eTLD + patterns)..."
	cd {{EXTENSION_DIR}} && pnpm run generate-etld && pnpm run generate-patterns
	echo ""
	echo "📝 TypeScript type check..."
	cd {{EXTENSION_DIR}} && pnpm tsc --noEmit
	echo ""
	echo "🔧 Biome check (lint & format)..."
	cd {{EXTENSION_DIR}} && pnpm run check
	echo ""
	echo "🦀 Cargo check (wasm-bridge)..."
	cargo check --manifest-path {{EXTENSION_DIR}}/wasm-bridge/Cargo.toml
	echo ""
	echo "🦀 Cargo fmt check (wasm-bridge)..."
	cargo fmt --manifest-path {{EXTENSION_DIR}}/wasm-bridge/Cargo.toml -- --check
	echo ""
	echo "✅ Extension checks passed!"

# Android app - Lint & format check (Kotlin + Rust)
@check-android: _android-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔍 Checking Android app (lint & format)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Cargo check (rust-jni)..."
	cargo check --manifest-path {{ANDROID_JNI_DIR}}/Cargo.toml
	echo ""
	echo "🦀 Cargo fmt check (rust-jni)..."
	cargo fmt --manifest-path {{ANDROID_JNI_DIR}}/Cargo.toml -- --check
	echo ""
	echo "🤖 Kotlin lint (Gradle)..."
	cd {{ANDROID_DIR}} && ./gradlew lintDebug
	echo ""
	echo "✅ Android checks passed!"

# 全 lint & format チェック
@check-all:
	echo ""
	echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗"
	echo "║              kura Lint & Format Check                  ║"
	echo "║       Checking all apps: Desktop, Extension, Android   ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"
	just check-vault-core
	just check-desktop
	just check-extension
	just check-android
	echo ""
	echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗"
	echo "║              ✅ All checks passed!                     ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"

# クリーンアップ
@clean:
	echo "🧹 Cleaning build artifacts..."
	echo "  - Cargo workspace (target/)..."
	cargo clean
	echo "  - Desktop..."
	rm -rf {{DESKTOP_DIR}}/icons/
	echo "  - Extension..."
	cd {{EXTENSION_DIR}} && rm -rf dist/ build/ node_modules/ wasm/ public/ test-pages/fixtures/ kura-extension-chrome.zip kura-extension-firefox.zip
	find {{EXTENSION_DIR}}/ -maxdepth 1 \( -name '*.xpi' -o -name 'kura-extension-source-*.zip' \) -delete 2>/dev/null || true
	rm -f {{EXTENSION_DIR}}/src/shared/etld-data.generated.ts {{EXTENSION_DIR}}/src/shared/patterns-data.generated.ts
	echo "  - Vault-core..."
	rm -rf {{VAULT_CORE_DIR}}/pkg/
	echo "  - Android..."
	cd {{ANDROID_DIR}} && rm -rf app/build/ app/src/main/jniLibs/ .gradle/ build/ app/src/main/assets/legal/
	find {{ANDROID_DIR}}/app/src/main/res/ -path '*/mipmap-*/ic_launcher.png' -delete -o -path '*/mipmap-*/ic_launcher_foreground.png' -delete 2>/dev/null || true
	echo "✅ Cleanup completed!"

# ヘルプ表示
@help:
	echo "Usage:"
	echo "  🤖 Android:"
	echo "    just build-android-debug       - Build Android debug APK"
	echo "    just release-android           - Build Android release APK"
	echo "    just build-android-jni         - Build Rust native libraries only"
	echo "    just run-android               - Build & run on emulator"
	echo "    just run-android-device        - Build & install on USB device"
	echo ""
	echo "  🖥️  Desktop:"
	echo "    just dev-desktop              - Start desktop app in dev mode"
	echo "    just release-desktop-linux    - Build Linux AppImage + deb"
	echo "    just release-desktop-macos    - Build macOS DMG"
	echo "    just release-desktop-windows  - Build Windows NSIS installer"
	echo "    just desktop-licenses         - Regenerate third-party licenses for About screen"
	echo ""
	echo "  🔌 Extension:"
	echo "    just dev-extension            - Start extension in dev mode (HMR)"
	echo "    just release-extension        - Build Chrome & Firefox extensions"
	echo "    just source-bundle-extension  - Build AMO source bundle zip"
	echo ""
	echo "  🧪 Test:"
	echo "    just test-vault-core      - Run vault-core tests"
	echo "    just test-extension       - Run extension tests"
	echo "    just test-android         - Run Android tests"
	echo "    just test-desktop         - Run desktop tests"
	echo "    just test-all             - Run all tests"
	echo "    just test-manual-autofill      - Start autofill manual test environment"
	echo "    just test-manual-autofill-stop - Stop autofill test environment"
	echo ""
	echo "  🔍 Check (Lint & Format):"
	echo "    just check-vault-core     - Lint & format check for vault-core"
	echo "    just check-desktop        - Lint & format check for desktop"
	echo "    just check-extension      - Lint & format check for extension"
	echo "    just check-android        - Lint & format check for Android"
	echo "    just check-all            - Run all lint & format checks"
	echo ""
	echo "  🔧 Utilities:"
	echo "    just release-all          - Build all apps for release"
	echo "    just update-assets        - Update bundled PSL & Passkey privileged allowlist"
	echo "    just clean                - Clean build artifacts"
