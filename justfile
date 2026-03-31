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

# 依存関係の確認
@check-dependencies:
	echo "🔍 Checking dependencies..."
	if ! command -v node &> /dev/null; then \
		echo "❌ node not found. Please install Node.js."; \
		exit 1; \
	fi
	if ! command -v pnpm &> /dev/null; then \
		echo "❌ pnpm not found. Please install pnpm."; \
		exit 1; \
	fi
	if ! command -v cargo &> /dev/null; then \
		echo "❌ cargo not found. Please install Rust/Cargo."; \
		exit 1; \
	fi
	if ! command -v wasm-pack &> /dev/null; then \
		echo "❌ wasm-pack not found. Please install wasm-pack."; \
		exit 1; \
	fi
	echo "✅ All dependencies found"
	echo "  - Node.js: $(node --version)"
	echo "  - pnpm: $(pnpm --version)"
	echo "  - Cargo: $(cargo --version | head -1)"
	echo "  - wasm-pack: $(wasm-pack --version)"

# Desktop app - Development (Tauri with hot reload)
@dev-desktop: check-dependencies
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
@release-desktop: check-dependencies
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

# Browser extension - Chrome
@release-extension-chrome: check-dependencies
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
@release-extension-firefox: check-dependencies
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
@dev-extension: check-dependencies
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

# Android app - Build native libraries (Rust → .so)
@build-android-jni:
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

# Android app - Build native libraries for single ABI (fast development)
@build-android-jni-fast:
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🦀 Building vault_jni for arm64-v8a only (fast dev build)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	if ! command -v cargo-ndk &> /dev/null; then \
		echo "📥 Installing cargo-ndk..."; \
		cargo install cargo-ndk; \
	fi
	cargo ndk -t arm64-v8a -o {{ANDROID_DIR}}/app/src/main/jniLibs build --manifest-path {{ANDROID_JNI_DIR}}/Cargo.toml --release
	echo ""
	echo "✅ Native library built (arm64-v8a only)"

# Android app - Debug build (fast, arm64 only)
@build-android-debug-fast: build-android-jni-fast
	echo ""
	echo "🤖 Building Android app (debug, arm64 only)..."
	cd {{ANDROID_DIR}} && ./gradlew assembleDebug
	echo ""
	echo "✅ Android debug build completed!"
	echo "  - APK: {{ANDROID_DIR}}/app/build/outputs/apk/debug/app-debug.apk"

# Android app - Build, launch emulator, install and start (all ABIs)
@run-android: build-android-debug
	just _run-android-emulator

# Android app - Build, launch emulator, install and start (arm64 only, fast)
@run-android-fast: build-android-debug-fast
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
@release-all: check-dependencies
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

# クリーンアップ
@clean:
	echo "🧹 Cleaning build artifacts..."
	echo "  - Desktop..."
	cd {{DESKTOP_DIR}} && rm -rf dist/ build/ node_modules/
	cd {{DESKTOP_DIR}}/src-tauri && cargo clean
	echo "  - Extension..."
	cd {{EXTENSION_DIR}} && rm -rf dist/ build/ node_modules/ wasm/
	echo "  - Android..."
	cd {{ANDROID_DIR}} && rm -rf app/build/ app/src/main/jniLibs/ .gradle/ build/
	echo "✅ Cleanup completed!"

# ヘルプ表示
@help:
	echo ""
	echo "kura - Release Build Helper"
	echo ""
	echo "Usage:"
	echo "  🤖 Android:"
	echo "    just build-android-debug       - Build Android debug APK (all ABIs)"
	echo "    just build-android-debug-fast  - Build Android debug APK (arm64 only, fast)"
	echo "    just release-android           - Build Android release APK"
	echo "    just build-android-jni         - Build Rust native libraries only"
	echo "    just build-android-jni-fast    - Build Rust native library (arm64 only)"
	echo "    just run-android               - Build & run on emulator (all ABIs)"
	echo "    just run-android-fast          - Build & run on emulator (arm64 only, fast)"
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
	echo "  🔧 Utilities:"
	echo "    just release-all          - Build all apps for release"
	echo "    just check-dependencies   - Check if all tools are installed"
	echo "    just clean                - Clean build artifacts"
	echo ""
	echo "Examples:"
	echo "  just dev-desktop           # Development with hot reload"
	echo "  just release-desktop       # Production build"
	echo "  just release-all           # Build all for release"
	echo ""
