# kura - Release Build Guide

サーバ不要のパスワードマネージャー

## ビルド方法

このプロジェクトは[just](https://github.com/casey/just)を使用してビルドを管理しています。

### 事前準備

必要なツールが揃っているか確認します：

```bash
just check-dependencies
```

以下が必要です：
- Node.js
- pnpm
- Rust / Cargo
- wasm-pack

### クイックスタート

```bash
# 全プラットフォームをビルド（リリース用）
just release-all

# または個別にビルド
just release-android             # Android APK
just release-desktop             # macOS/Windows/Linux (Tauri) - リリース版
just release-extension-chrome    # Chrome ブラウザ拡張
just release-extension-firefox   # Firefox ブラウザ拡張
```

## ビルドコマンド一覧

### 🤖 Android アプリ

```bash
# Android APK ビルド（デバッグ版、全ABI対応）
just build-android-debug

# Android APK ビルド（デバッグ版、arm64 のみ、高速）
just build-android-debug-fast

# Android APK ビルド（リリース版）
just release-android

# Rust ネイティブライブラリのビルドのみ（全ABI）
just build-android-jni

# Rust ネイティブライブラリのビルドのみ（arm64 のみ、高速）
just build-android-jni-fast
```

### 🖥️ デスクトップアプリ

```bash
# 開発モード（ホットリロード機能付き）
just dev-desktop

# リリース版をビルド
just release-desktop
```

### 🔌 ブラウザ拡張

```bash
# Chrome 拡張をビルド（リリース版）
just release-extension-chrome

# Firefox 拡張をビルド（リリース版）
just release-extension-firefox

# 拡張を開発モード（HMR 付き）で実行
just dev-extension
```

### 🔧 ユーティリティ

```bash
# すべてのビルド成果物をクリーンアップ
just clean

# 依存関係をチェック
just check-dependencies

# 利用可能なすべてのコマンドを表示
just help

# Justfile のレシピを一覧表示
just --list
```

