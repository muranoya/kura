set shell := ["zsh", "-c"]
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

# Desktop app (Tauri)
@release-desktop: _desktop-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building desktop app (Tauri)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "📥 Installing dependencies..."
	cd {{DESKTOP_DIR}} && pnpm install
	echo ""
	echo "🏗️  Building frontend assets..."
	cd {{DESKTOP_DIR}} && pnpm run build
	echo ""
	echo "🖥️  Building native desktop application..."
	cd {{DESKTOP_DIR}} && pnpm run tauri build
	echo ""
	echo "✅ Desktop build completed!"
	echo "  - Output: {{DESKTOP_DIR}}/src-tauri/target/release/"

# Extension - Generate icons from SVG
@_extension-icons:
	echo "🎨 Generating extension icons..."
	bash assets/icons/convert2png.sh

# Browser extension - Chrome
@release-extension-chrome: _extension-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building Chrome extension..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Building WASM package from vault-core..."
	wasm-pack build {{EXTENSION_DIR}}/wasm-bridge --target bundler --out-dir ../wasm
	echo ""
	echo "📥 Installing dependencies..."
	cd {{EXTENSION_DIR}} && pnpm install
	echo ""
	echo "🏗️  Building extension..."
	cd {{EXTENSION_DIR}} && pnpm run build
	echo ""
	echo "📦 Packaging extension..."
	cd {{EXTENSION_DIR}}/dist && zip -r ../kura-extension-chrome.zip .
	echo ""
	echo "✅ Chrome extension build completed!"
	echo "  - Output: {{EXTENSION_DIR}}/dist/"
	echo "  - Package: {{EXTENSION_DIR}}/kura-extension-chrome.zip"

# Browser extension - Firefox
@release-extension-firefox: _extension-icons
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building Firefox extension..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	echo "🦀 Building WASM package from vault-core..."
	wasm-pack build {{EXTENSION_DIR}}/wasm-bridge --target bundler --out-dir ../wasm
	echo ""
	echo "📥 Installing dependencies..."
	cd {{EXTENSION_DIR}} && pnpm install
	echo ""
	echo "🏗️  Building Firefox extension..."
	cd {{EXTENSION_DIR}} && pnpm run build:firefox
	echo ""
	echo "📦 Packaging extension..."
	cd {{EXTENSION_DIR}}/dist && zip -r ../kura-extension-firefox.zip .
	echo ""
	echo "✅ Firefox extension build completed!"
	echo "  - Output: {{EXTENSION_DIR}}/dist/"
	echo "  - Package: {{EXTENSION_DIR}}/kura-extension-firefox.zip"

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
	{{ADB}} -d shell am start -n com.kura.app/.MainActivity
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
	{{ADB}} shell am start -n com.kura.app/.MainActivity
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
	just release-desktop
	just release-extension-chrome
	just release-extension-firefox
	echo ""
	echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗"
	echo "║                  🎉 All releases completed!                ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"

# vault-core のテスト
@test-vault-core:
	echo "🧪 Testing vault-core..."
	cargo test --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml
	echo "✅ vault-core tests passed!"

# extension のテスト（wasm-bridge）
@test-extension:
	echo "🧪 Testing extension (wasm-bridge)..."
	cargo test --manifest-path {{EXTENSION_DIR}}/wasm-bridge/Cargo.toml
	echo "✅ extension tests passed!"

# Android のテスト
@test-android:
	echo "🧪 Testing Android..."
	cd {{ANDROID_DIR}} && ./gradlew test
	echo "✅ Android tests passed!"

# Desktop のテスト（フロントエンド + Rust結合テスト）
@test-desktop:
	echo "🧪 Testing desktop (frontend)..."
	cd {{DESKTOP_DIR}} && pnpm install && pnpm test
	echo "🧪 Testing desktop (integration with MinIO)..."
	docker compose -f docker-compose.test.yml up -d --wait minio
	docker compose -f docker-compose.test.yml run --rm createbuckets
	cargo test -p kura-desktop --test integration_test -- --test-threads=1 || { docker compose -f docker-compose.test.yml down -v; exit 1; }
	docker compose -f docker-compose.test.yml down -v
	echo "✅ desktop tests passed!"

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
	echo "🦀 Cargo check (vault-core)..."
	cargo check --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml
	echo ""
	echo "🦀 Cargo fmt check (vault-core)..."
	cargo fmt --manifest-path {{VAULT_CORE_DIR}}/Cargo.toml -- --check
	echo ""
	echo "✅ vault-core checks passed!"

# Desktop app - Lint & format check (TypeScript + Biome + Rust)
@check-desktop:
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
	echo "📥 Installing dependencies..."
	cd {{EXTENSION_DIR}} && pnpm install --silent
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
	echo "║              ✅ All checks passed!                         ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"

# クリーンアップ
@clean:
	echo "🧹 Cleaning build artifacts..."
	echo "  - Cargo workspace (target/)..."
	cargo clean
	echo "  - Desktop..."
	cd {{DESKTOP_DIR}} && rm -rf dist/ build/ node_modules/
	echo "  - Extension..."
	cd {{EXTENSION_DIR}} && rm -rf dist/ build/ node_modules/ wasm/ kura-extension-chrome.zip kura-extension-firefox.zip
	echo "  - Vault-core..."
	rm -rf {{VAULT_CORE_DIR}}/pkg/
	echo "  - Android..."
	cd {{ANDROID_DIR}} && rm -rf app/build/ app/src/main/jniLibs/ .gradle/ build/
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
	echo "    just dev-desktop          - Start desktop app in dev mode (hot reload)"
	echo "    just release-desktop      - Build desktop app (Tauri release)"
	echo ""
	echo "  🔌 Extension:"
	echo "    just dev-extension            - Start extension in dev mode (HMR)"
	echo "    just release-extension-chrome - Build Chrome extension"
	echo "    just release-extension-firefox - Build Firefox extension"
	echo ""
	echo "  🧪 Test:"
	echo "    just test-vault-core      - Run vault-core tests"
	echo "    just test-extension       - Run extension tests"
	echo "    just test-android         - Run Android tests"
	echo "    just test-desktop         - Run desktop tests (frontend + integration)"
	echo "    just test-all             - Run all tests"
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
