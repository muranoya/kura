# kura - Release Build Guide

サーバ不要、自分一人のための、運用コストゼロのパスワードマネージャー

## ビルド方法

このプロジェクトは[just](https://github.com/casey/just)を使用してビルドを管理しています。

### 前提条件

以下のツールがインストールされていることを確認してください：

- **Flutter** - モバイルアプリ用
- **Node.js & npm** - デスクトップ・拡張機能用
- **Rust & Cargo** - コアライブラリ用

```bash
# インストール状況の確認
just check-dependencies
```

### クイックスタート

```bash
# 全プラットフォームをビルド（リリース用）
just release-all

# または個別にビルド
just release-mobile       # iOS + Android
just release-desktop      # macOS/Windows/Linux (Tauri) - リリース版
just release-extension    # Chrome/Firefox ブラウザ拡張
```

### デスクトップアプリの開発

デスクトップアプリ（Tauri）を開発モードで実行する場合：

```bash
# 開発用ビルド（ホットリロード有効）
just dev-desktop
```

**開発モードの特徴：**
- フロントエンド（TypeScript/React）の変更が自動的にリロード
- Rust コードの変更は自動的に再コンパイル
- DevTools が有効（右クリック → 検査で開く）
- コンソール出力で デバッグ情報を確認可能

**DevTools の開き方：**
1. アプリ内で右クリック
2. 「検査」を選択
3. コンソールタブでログを確認

### ビルド出力

ビルド完了後、以下の場所に成果物が生成されます：

- **iOS**: `mobile/build/ios/Release-iphoneos/`
- **Android AAB**: `mobile/build/app/outputs/bundle/release/`
- **Desktop**: `desktop/src-tauri/target/release/`
- **Extension**: `extension/dist/`

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
