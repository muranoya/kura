VAULT_CORE_DIR := ../vault-core
WASM_OUT_DIR := ./wasm

.PHONY: all build dev clean wasm install package

all: build

# WASMビルド（vault-coreを拡張機能向けにコンパイル）
wasm:
	cd $(VAULT_CORE_DIR) && \
	  wasm-pack build \
	    --target web \
	    --out-dir $(CURDIR)/$(WASM_OUT_DIR) \
	    --features wasm \
	    --no-default-features
	@echo "WASM build complete: $(WASM_OUT_DIR)/"

# 拡張機能のTypeScriptビルド
build: wasm
	pnpm run build

# 開発モード（HMR付き）
dev: wasm
	pnpm run dev

# クリーン
clean:
	rm -rf dist/
	rm -rf $(WASM_OUT_DIR)/

# npm依存のインストール
install:
	pnpm install

# ChromeにロードするためのZIPパッケージ
package: build
	cd dist && zip -r ../kura-extension.zip .
