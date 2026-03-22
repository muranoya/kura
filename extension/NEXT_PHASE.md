# Phase 3: WASM統合・機能実装 - チェックリスト

すべてのUI/ルーターが完成しました。次フェーズでは以下を実装します。

## 1. Service Worker メッセージハンドラーの実装

### 認証系 (3個)

- [ ] `UNLOCK` - マスターパスワード検証
  - `vault/index.ts::unlockVault(password)` を呼び出し
  - 成功時: `chrome.storage.local` に vaultState を保存
  - 失敗時: エラーメッセージを返す

- [ ] `RECOVER` - リカバリーキーでのリセット
  - `vault/index.ts::unlockWithRecoveryKey(recoveryKey, newPassword)` を呼び出し
  - 新しいマスターパスワードでvaultを再暗号化
  - S3 にアップロード

- [ ] `CREATE_VAULT` - 初期vault作成
  - `vault/index.ts::createNewVault(masterPassword, s3Config)` を呼び出し
  - vaultBytes と recoveryKey を返す

### エントリ操作 (8個)

- [ ] `LIST_ENTRIES` - エントリ一覧取得
  - `vault/index.ts::listEntries(filter)` を呼び出し
  - JSON配列を返す

- [ ] `GET_ENTRY` - エントリ取得
  - `vault/index.ts::getEntry(id)` を呼び出し

- [ ] `CREATE_ENTRY` - エントリ作成
  - `vault/index.ts::createEntry(type, name, typedValue, notes)` を呼び出し
  - S3 にアップロード

- [ ] `UPDATE_ENTRY` - エントリ更新
  - `vault/index.ts::updateEntry(id, name, typedValue, notes)` を呼び出し
  - S3 にアップロード（If-Match ヘッダー付き）

- [ ] `DELETE_ENTRY` - エントリ削除（ゴミ箱へ移動）
  - `vault/index.ts::deleteEntry(id)` を呼び出し
  - S3 にアップロード

- [ ] `RESTORE_ENTRY` - エントリ復元
  - `vault/index.ts::restoreEntry(id)` を呼び出し

- [ ] `PURGE_ENTRY` - エントリ完全削除
  - `vault/index.ts::purgeEntry(id)` を呼び出し

- [ ] `SET_FAVORITE` - お気に入り設定
  - `vault/index.ts::setFavorite(id, isFavorite)` を呼び出し

### ラベル操作 (4個)

- [ ] `LIST_LABELS` - ラベル一覧取得
  - `vault/index.ts::listLabels()` を呼び出し

- [ ] `CREATE_LABEL` - ラベル作成
  - `vault/index.ts::createLabel(name)` を呼び出し

- [ ] `DELETE_LABEL` - ラベル削除
  - `vault/index.ts::deleteLabel(id)` を呼び出し

- [ ] `SET_ENTRY_LABELS` - エントリにラベルを設定
  - `vault/index.ts::setEntryLabels(entryId, labelIds)` を呼び出し

### 同期 (4個)

- [ ] `SYNC` - S3 同期
  - ローカルとS3の最新版を比較
  - 条件付き書き込み（If-Match）でアップロード
  - 409 コンフリクト時は `GET_SYNC_CONFLICTS` メッセージを生成

- [ ] `GET_SYNC_STATUS` - 同期状態取得
  - 最後の同期時刻、現在のステータスを返す

- [ ] `GET_SYNC_CONFLICTS` - コンフリクト取得
  - ローカル vs S3 の差分を検出
  - 各エントリの競合情報を返す

- [ ] `RESOLVE_SYNC_CONFLICTS` - コンフリクト解決
  - ユーザー選択に基づいてマージ
  - 再度 S3 にアップロード

### 設定 (2個)

- [ ] `GET_SETTINGS` - 設定取得
  - `chrome.storage.local` から設定を読み込み

- [ ] `SAVE_SETTINGS` - 設定保存
  - `chrome.storage.local` に保存
  - オートロック時間を反映

## 2. アラーム・タイマーの実装

### オートロック

- [ ] `handleAutolockAlarm()` の実装
  - `vault/index.ts::lockVault()` を呼び出し
  - vaultBytes を `chrome.storage.local` に保存
  - alarms を再設定

### クリップボード自動クリア

- [ ] `CLIPBOARD_COPIED` メッセージハンドル
  - `settings.clipboardClearSeconds` に基づいて alarm 設定
  - offscreen document へメッセージ送信

- [ ] offscreen.ts の実装
  - `CLEAR_CLIPBOARD` メッセージ受信
  - `navigator.clipboard.writeText('')` 実行

## 3. Access Key 管理

- [ ] S3Config の暗号化保存
  - マスターパスワードでAES-256-GCMで暗号化
  - `chrome.storage.local` に保存

- [ ] Access Key の復号・取得
  - アンロック時にマスターパスワードから復号
  - Service Worker メモリで保持

- [ ] S3 API の実装
  - AWS Signature V4 で署名
  - PUT / GET / HEAD リクエスト実装

## 4. エラーハンドリング

- [ ] WASM エラー時のメッセージ変換
  - Rust エラーを human-friendly なメッセージに
  - フロントエンドでユーザーに表示

- [ ] S3 エラーハンドリング
  - 403 Forbidden → 認証情報エラー
  - 404 Not Found → vault がない
  - 409 Conflict → コンフリクト検出

## 5. テスト・検証

- [ ] 単体テスト
  - Service Worker メッセージハンドラー
  - WASM wrapper 関数

- [ ] 統合テスト
  - オンボーディングフロー全体
  - ロック・アンロック
  - エントリ作成・編集・削除

- [ ] シナリオテスト
  - 複数デバイスでの同期
  - オフライン状態でのキャッシュ

## 6. Firefox 互換性

- [ ] webextension-polyfill 動作確認
  - chrome API の翻訳
  - browser API との互換性

- [ ] manifest.json の Firefox 対応
  - icons / permissions の調整

## 実装優先度

1. **高優先度**: CREATE_VAULT、UNLOCK、LIST_ENTRIES、CREATE_ENTRY
2. **中優先度**: UPDATE_ENTRY、DELETE_ENTRY、SYNC、RESOLVE_SYNC_CONFLICTS
3. **低優先度**: ラベル操作、GET_SYNC_CONFLICTS、設定

## 見積もり

- Service Worker 実装: 2-3時間
- WASM 統合テスト: 1-2時間
- S3 同期実装: 3-4時間
- エラーハンドリング: 1-2時間
- Firefox テスト: 1時間
- **合計**: 8-12時間

## Notes

- すべてのメッセージハンドラーはスタブ実装済み
- WASM API は `src/vault/index.ts` に用意されている
- 型安全性は `src/shared/messages.ts` で保証
- テストは Chrome DevTools / Firefox DevTools で手動実施
