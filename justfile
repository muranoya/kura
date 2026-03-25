set shell := ["zsh", "-c"]
set positional-arguments := true

# ディレクトリの定義
MOBILE_DIR := "mobile"
DESKTOP_DIR := "desktop"
EXTENSION_DIR := "extension"
VAULT_CORE_DIR := "vault-core"

# デフォルトレシピ
default: help

# 依存関係の確認
@check-dependencies:
	echo "🔍 Checking dependencies..."
	if ! command -v flutter &> /dev/null; then \
		echo "❌ flutter not found. Please install Flutter."; \
		exit 1; \
	fi
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
	echo "  - Flutter: $(flutter --version | head -1)"
	echo "  - Node.js: $(node --version)"
	echo "  - pnpm: $(pnpm --version)"
	echo "  - Cargo: $(cargo --version | head -1)"
	echo "  - wasm-pack: $(wasm-pack --version)"

# Mobile app (iOS + Android)
@release-mobile: check-dependencies
	echo ""
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo "🔨 Building mobile app (iOS + Android)..."
	echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	echo ""
	cd {{MOBILE_DIR}} && flutter pub get
	echo ""
	echo "📱 Building iOS release..."
	cd {{MOBILE_DIR}} && flutter build ios --release
	echo ""
	echo "🤖 Building Android release (AAB - Google Play)..."
	cd {{MOBILE_DIR}} && flutter build appbundle --release
	echo ""
	echo "✅ Mobile builds completed!"
	echo "  - iOS: {{MOBILE_DIR}}/build/ios/Release-iphoneos/"
	echo "  - Android AAB: {{MOBILE_DIR}}/build/app/outputs/bundle/release/"

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
	wasm-pack build {{VAULT_CORE_DIR}} --target bundler --out-dir ../{{EXTENSION_DIR}}/wasm --features wasm --no-default-features
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
	wasm-pack build {{VAULT_CORE_DIR}} --target bundler --out-dir ../{{EXTENSION_DIR}}/wasm --features wasm --no-default-features
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
	wasm-pack build {{VAULT_CORE_DIR}} --target web --out-dir ../{{EXTENSION_DIR}}/wasm --features wasm --no-default-features
	echo ""
	echo "📥 Installing dependencies..."
	cd {{EXTENSION_DIR}} && pnpm install
	echo ""
	echo "🔌 Starting extension dev server..."
	cd {{EXTENSION_DIR}} && pnpm run dev

# Build all releases
@release-all: check-dependencies
	echo ""
	echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗"
	echo "║                    kura Release Build                  ║"
	echo "║             Building all apps: iOS, Android,           ║"
	echo "║         Desktop (macOS/Windows/Linux), Extension       ║"
	echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝"
	just release-mobile
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
	echo "  - Mobile..."
	cd {{MOBILE_DIR}} && flutter clean
	echo "  - Desktop..."
	cd {{DESKTOP_DIR}} && rm -rf dist/ build/ node_modules/
	cd {{DESKTOP_DIR}}/src-tauri && cargo clean
	echo "  - Extension..."
	cd {{EXTENSION_DIR}} && rm -rf dist/ build/ node_modules/ wasm/
	echo "✅ Cleanup completed!"

# ヘルプ表示
@help:
	echo ""
	echo "kura - Release Build Helper"
	echo ""
	echo "Usage:"
	echo "  📱 Mobile:"
	echo "    just release-mobile       - Build mobile app (iOS + Android)"
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
