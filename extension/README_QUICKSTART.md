# kura ブラウザ拡張機能 - クイックスタート

## 1. セットアップ

### 必要な環境
- Node.js 16+
- npm / yarn / pnpm
- Rust + wasm-pack（vault-core ビルド用）

### インストール

```bash
cd extension

# npm 依存をインストール
npm install

# vault-core WASM をビルド
make wasm

# または全て一度に
make build
```

## 2. 開発モード

```bash
# ホットリロード付きで開発
make dev
```

出力: `dist/` フォルダ

## 3. ブラウザで読み込む

### Chrome / Edge

1. `chrome://extensions/` を開く
2. 右上「デベロッパーモード」を有効化
3. 左上「パッケージ化されていない拡張機能を読み込む」
4. `extension/dist/` を選択

### Firefox

1. `about:debugging` を開く
2. 左「このFirefox」をクリック
3. 右上「一時的なアドオンを読み込む...」
4. `extension/manifest.json` を選択

## 4. テスト

### オンボーディングフロー
1. 拡張機能アイコンをクリック
2. ウェルカム画面 → ストレージ設定 → パスワード設定 → リカバリーキー確認

### ロック・アンロック
1. 設定画面 → 「ロック」ボタン
2. ロック画面が表示される
3. パスワードを入力してアンロック

### エントリ管理
1. 「+ 追加」でエントリ作成
2. 一覧から選択して詳細表示
3. 「編集」でエントリ修正
4. 「削除」でゴミ箱へ移動

## 5. 本番用パッケージ化

```bash
make package
```

出力: `kura-extension.zip`

## トラブルシューティング

### WASM ビルドエラー
```bash
# Rust/wasm-pack の確認
rustc --version
wasm-pack --version

# Clean rebuild
make clean
make wasm
```

### npm 依存エラー
```bash
rm -rf node_modules package-lock.json
npm install
```

### ホットリロードが動作しない
Chrome DevTools を一度閉じて、拡張機能パネルをリロード

## ファイル構造

```
src/
├── popup/              # UI コンポーネント
├── background/         # Service Worker
├── shared/            # 共有ユーティリティ
└── vault/             # WASM wrapper

dist/                  # ビルド出力
wasm/                  # WASM 出力
```

## メッセージタイプ（40個）

### 認証系
- IS_UNLOCKED
- UNLOCK
- RECOVER
- LOCK
- CREATE_VAULT

### エントリ操作
- LIST_ENTRIES
- GET_ENTRY
- CREATE_ENTRY
- UPDATE_ENTRY
- DELETE_ENTRY
- RESTORE_ENTRY
- PURGE_ENTRY
- SET_FAVORITE
- LIST_TRASH

### ラベル管理
- LIST_LABELS
- CREATE_LABEL
- DELETE_LABEL
- SET_ENTRY_LABELS

### 同期
- SYNC
- GET_SYNC_STATUS
- GET_SYNC_CONFLICTS
- RESOLVE_SYNC_CONFLICTS

### 設定
- GET_SETTINGS
- SAVE_SETTINGS
- CLIPBOARD_COPIED

## 次ステップ

1. **vault-core 統合**: Service Worker で WASM API を呼び出し
2. **S3 同期**: 条件付き書き込みでコンフリクト対応
3. **クリップボード自動クリア**: offscreen API で実装
4. **オートロック**: alarms API で定期チェック
5. **Firefox テスト**: webextension-polyfill で互換性確認

## References

- [MV3 マニフェスト仕様](https://developer.chrome.com/docs/extensions/mv3/)
- [Vite 設定](https://vitejs.dev/config/)
- [React Router ドキュメント](https://reactrouter.com/docs)
- [wasm-pack ガイド](https://rustwasm.org/docs/wasm-pack/)
