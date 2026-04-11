set shell := ["bash", "-c"]
set positional-arguments := true

# ディレクトリの定義
MOBILE_DIR := "mobile"
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

# Desktop app - Generate icons from SVG
@_desktop-icons:
	echo "🎨 Generating desktop icons..."
	cd {{DESKTOP_DIR}} && pnpm install --silent
	bash assets/icons/convert2png.sh
	cd {{DESKTOP_DIR}} && pnpm tauri icon ../assets/icons/locked_icon.svg

# Desktop app - Development (Tauri with hot reload)
@dev-desktop: _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🚀 Starting desktop app in development mode..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "📥 Installing dependencies..."
	cd {{DESKTOP_DIR}} && pnpm install
	echo ""
	echo "🖥️  Starting development server with hot reload..."
	echo "💡 Use right-click → Inspect to open DevTools"
	echo ""
	cd {{DESKTOP_DIR}} && pnpm tauri dev --config src-tauri/tauri.conf.dev.json

# Desktop app - Linux (AppImage)
@release-desktop-linux: _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building desktop app for Linux (AppImage)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "📥 Installing dependencies..."
	cd {{DESKTOP_DIR}} && pnpm install
	echo ""
	echo "🖥️  Building AppImage..."
	cd {{DESKTOP_DIR}} && pnpm tauri build --bundles appimage
	echo ""
	echo "✅ Linux build completed!"
	echo "  - Output: {{DESKTOP_DIR}}/src-tauri/target/release/bundle/appimage/"

# Desktop app - macOS (DMG)
@release-desktop-macos: _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building desktop app for macOS (DMG)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "📥 Installing dependencies..."
	cd {{DESKTOP_DIR}} && pnpm install
	echo ""
	echo "🖥️  Building DMG..."
	cd {{DESKTOP_DIR}} && pnpm tauri build --bundles dmg
	echo ""
	echo "✅ macOS build completed!"
	echo "  - Output: {{DESKTOP_DIR}}/src-tauri/target/release/bundle/dmg/"

# Desktop app - Windows (NSIS installer)
@release-desktop-windows: _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building desktop app for Windows (NSIS)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "📥 Installing dependencies..."
	cd {{DESKTOP_DIR}} && pnpm install
	echo ""
	echo "🖥️  Building NSIS installer..."
	cd {{DESKTOP_DIR}} && pnpm tauri build --bundles nsis
	echo ""
	echo "✅ Windows build completed!"
	echo "  - Output: {{DESKTOP_DIR}}/src-tauri/target/release/bundle/nsis/"

# Extension - Generate icons from SVG
@_extension-icons:
	echo "🎨 Generating extension icons..."
	bash assets/icons/convert2png.sh

# Browser extension (Chrome + Firefox)
@release-extension: _extension-icons
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
	cd {{EXTENSION_DIR}}/dist && zip -r ../kura-extension-chrome.zip .
	echo ""
	echo "🏗️  Building Firefox extension..."
	cd {{EXTENSION_DIR}} && pnpm run build:firefox
	echo ""
	echo "📦 Packaging Firefox extension..."
	cd {{EXTENSION_DIR}}/dist && zip -r ../kura-extension-firefox.zip .
	echo ""
	echo "✅ Extension build completed!"
	echo "  - Chrome:  {{EXTENSION_DIR}}/kura-extension-chrome.zip"
	echo "  - Firefox: {{EXTENSION_DIR}}/kura-extension-firefox.zip"

# Firefox extension - Sign with AMO (unlisted)
@sign-firefox:
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔏 Signing Firefox extension via AMO..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	if [ -z "$AMO_API_KEY" ] || [ -z "$AMO_API_SECRET" ]; then \
		echo "❌ AMO_API_KEY and AMO_API_SECRET must be set."; \
		echo "   Get your keys at: https://addons.mozilla.org/developers/addon/api/key/"; \
		exit 1; \
	fi
	if [ ! -f {{EXTENSION_DIR}}/kura-extension-firefox.zip ]; then \
		echo "❌ Firefox extension zip not found. Run 'just release-extension' first."; \
		exit 1; \
	fi
	echo "📦 Signing extension..."
	cd {{EXTENSION_DIR}} && pnpm web-ext sign \
		--source-dir dist \
		--channel unlisted \
		--api-key "$AMO_API_KEY" \
		--api-secret "$AMO_API_SECRET" \
		--artifacts-dir .
	echo ""
	echo "✅ Signed .xpi created in {{EXTENSION_DIR}}/"

# Browser extension - Development (HMR付き)
@dev-extension: _extension-icons
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
@build-android-jni: _android-icons
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
	{{ADB}} -d shell am start -n net.meshpeak.kura/.MainActivity
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
	{{ADB}} shell am start -n net.meshpeak.kura/.MainActivity
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
	echo "║                  🎉 All releases completed!                ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"

# vault-core のテスト
@test-vault-core:
	echo "🧪 Testing vault-core..."
	cargo test --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml
	echo "✅ vault-core tests passed!"

# extension のテスト（wasm-bridge + TypeScript）
@test-extension:
	echo "🧪 Testing extension (wasm-bridge)..."
	cargo test --manifest-path {{EXTENSION_DIR}}/wasm-bridge/Cargo.toml
	echo "🧪 Testing extension (TypeScript)..."
	cd {{EXTENSION_DIR}} && pnpm install --silent && pnpm test
	echo "✅ extension tests passed!"

# Android のテスト
@test-android: _android-icons
	echo "🧪 Testing Android..."
	cd {{ANDROID_DIR}} && ./gradlew testDebugUnitTest
	echo "✅ Android tests passed!"

# Desktop のテスト（フロントエンド）
@test-desktop: _desktop-icons
	echo "🧪 Testing desktop (frontend)..."
	cd {{DESKTOP_DIR}} && pnpm install && pnpm test
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
	cargo clippy --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml -- -D warnings
	echo ""
	echo "🦀 Cargo fmt check (vault-core)..."
	cargo fmt --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml -- --check
	echo ""
	echo "✅ vault-core checks passed!"

# Desktop app - Lint & format check (TypeScript + Biome + Rust)
@check-desktop: _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔍 Checking desktop app (lint & format)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "📥 Installing dependencies..."
	cd {{DESKTOP_DIR}} && pnpm install --silent
	echo ""
	echo "📝 TypeScript type check..."
	cd {{DESKTOP_DIR}} && pnpm tsc --noEmit
	echo ""
	echo "🔧 Biome check (lint & format)..."
	cd {{DESKTOP_DIR}} && pnpm run check
	echo ""
	echo "🦀 Cargo check (src-tauri)..."
	cargo check --manifest-path {{DESKTOP_DIR}}/src-tauri/Cargo.toml
	echo ""
	echo "🦀 Cargo fmt check (src-tauri)..."
	cargo fmt --manifest-path {{DESKTOP_DIR}}/src-tauri/Cargo.toml -- --check
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
@check-android:
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
	cd {{DESKTOP_DIR}} && rm -rf dist/ build/ node_modules/
	find {{DESKTOP_DIR}}/src-tauri/icons/ -maxdepth 1 \( -name '*.png' -o -name '*.ico' -o -name '*.icns' \) -delete 2>/dev/null || true
	echo "  - Extension..."
	cd {{EXTENSION_DIR}} && rm -rf dist/ build/ node_modules/ wasm/ public/ test-pages/fixtures/ kura-extension-chrome.zip kura-extension-firefox.zip
	find {{EXTENSION_DIR}}/ -maxdepth 1 -name '*.xpi' -delete 2>/dev/null || true
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
	echo "    just dev-desktop              - Start desktop app in dev mode (hot reload)"
	echo "    just release-desktop-linux    - Build Linux AppImage"
	echo "    just release-desktop-macos    - Build macOS DMG"
	echo "    just release-desktop-windows  - Build Windows NSIS installer"
	echo ""
	echo "  🔌 Extension:"
	echo "    just dev-extension            - Start extension in dev mode (HMR)"
	echo "    just release-extension        - Build Chrome & Firefox extensions"
	echo "    just sign-firefox             - Sign Firefox extension via AMO (unlisted)"
	echo ""
	echo "  🧪 Test:"
	echo "    just test-vault-core      - Run vault-core tests"
	echo "    just test-extension       - Run extension tests"
	echo "    just test-android         - Run Android tests"
	echo "    just test-desktop         - Run desktop tests (frontend)"
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
	echo "    just clean                - Clean build artifacts"
