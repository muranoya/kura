# kura - Release Build Guide

サーバ不要のパスワードマネージャー

## ビルド方法

このプロジェクトは[just](https://github.com/casey/just)を使用してビルドを管理しています。

### クイックスタート

```bash
# 全プラットフォームをビルド（リリース用）
just release-all

# または個別にビルド
just release-mobile              # iOS + Android
just release-desktop             # macOS/Windows/Linux (Tauri) - リリース版
just release-extension-chrome    # Chrome ブラウザ拡張
just release-extension-firefox   # Firefox ブラウザ拡張
```

### デスクトップアプリの開発

デスクトップアプリ（Tauri）を開発モードで実行する場合：

```bash
just dev-desktop
```

### その他のコマンド

```bash
# ビルド成果物をクリーンアップ
just clean

# 依存関係をチェック
just check-dependencies

# 利用可能なすべてのコマンドを表示
just help

# Justfile のレシピを一覧表示
just --list
```
