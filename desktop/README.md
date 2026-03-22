# kinko Desktop App

Tauri v2 + TypeScript/React で実装されたkinkoのデスクトップアプリケーション。

## ディレクトリ構成

```
desktop/
├── src/                      # フロントエンド（TypeScript/React）
│   ├── commands/             # Tauriコマンド呼び出しラッパー
│   ├── components/           # UIコンポーネント
│   ├── screens/              # 画面コンポーネント
│   ├── shared/               # 共有型・定数・ストレージ操作
│   ├── App.tsx               # ルーターとステート管理
│   └── main.tsx              # エントリーポイント
├── src-tauri/                # バックエンド（Rust）
│   ├── src/
│   │   ├── commands/         # Tauriコマンド実装
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## セットアップ

### 前提条件

- Rust 1.70+
- Node.js 16+ / npm
- Tauri CLI

### インストール

```bash
# ルートディレクトリで
npm install
cd desktop
npm install
```

### 開発

```bash
cd desktop
npm run tauri dev
```

Tauriが自動的に：
- フロントエンド開発サーバー（Vite）を起動
- Rustバックエンドをコンパイル
- デスクトップアプリを起動

### ビルド

```bash
cd desktop
npm run tauri build
```

## 実装状況

### バックエンド（src-tauri）
- ✅ セッション管理（create, load, unlock, lock）
- ✅ エントリ操作（list, get, create, update, delete, restore, purge, favorite）
- ✅ ラベル操作（list, create, delete, set）
- ✅ セキュリティ（password change, argon2 upgrade, dek rotate, recovery key）
- ✅ ユーティリティ（password generate, totp）
- ✅ ローカルファイル操作（vault.bin 読み書き）
- ⏳ 同期（stub）

### フロントエンド（src）
- ✅ 基本ルーティング（onboarding/auth/main）
- ✅ オンボーディング画面（welcome, storage setup, password, recovery key）
- ✅ ロック画面とリカバリー
- ✅ サイドバーナビゲーション
- ⏳ エントリ一覧（骨組みのみ）
- ⏳ エントリ詳細/編集/作成（プレースホルダー）
- ⏳ ラベル管理（プレースホルダー）
- ⏳ 同期状態（プレースホルダー）
- ⏳ 設定画面（プレースホルダー）

### デスクトップ固有機能
- ⏳ オートロック
- ⏳ クリップボード自動クリア
- ⏳ システムトレイ

## API ドキュメント

### 利用可能なコマンド

すべてのコマンドは `src/commands/index.ts` で定義されており、以下のカテゴリに分かれています：

**セッション**: `createVault`, `loadVault`, `unlock`, `unlockWithRecoveryKey`, `lock`, `isUnlocked`
**エントリ**: `listEntries`, `getEntry`, `createEntry`, `updateEntry`, `deleteEntry`, `restoreEntry`, `purgeEntry`, `setFavorite`
**ラベル**: `listLabels`, `createLabel`, `deleteLabel`, `setEntryLabels`
**セキュリティ**: `changeMasterPassword`, `upgradeArgon2Params`, `rotateDek`, `regenerateRecoveryKey`
**ユーティリティ**: `generatePassword`, `generateTotp`, `generateTotpDefault`
**同期**: `syncVault`, `pushVault`, `resolveConflict`（未実装）
**ストレージ**: `readVaultFile`, `writeVaultFile`, `vaultFileExists`

## 技術スタック

- **バックエンド**: Tauri 2 + Rust
- **フロントエンド**: React 18 + TypeScript + Vite
- **ルーティング**: React Router v6
- **ストレージ**: tauri-plugin-store
- **クリップボード**: tauri-plugin-clipboard-manager
- **UI**: CSS-in-JS（inline styles）

## トラブルシューティング

### コンパイルエラー

```bash
# キャッシュをクリア
cd desktop/src-tauri
cargo clean
cd ../..
npm run tauri dev
```

### ポート競合

デフォルトではViteが `http://localhost:1420` を使用します。別のポートを指定するには：

```bash
cd desktop
npm run dev -- --port 3000
```

## 今後の実装予定

1. エントリ管理UI の完全実装
2. ラベル管理機能
3. 検索・フィルター
4. S3同期
5. オートロック・クリップボード自動クリア
6. システムトレイ統合
7. 設定画面の詳細実装
