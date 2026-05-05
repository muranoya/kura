<!-- doc-status: partial -->

# セキュリティ設計・要件リスト

kura はパスワードマネージャーとして求められるセキュリティ要件に対し、段階的に対応を進めている。本ドキュメントは、各要件の対応状況を体系的に整理し、以下を明示する：

- **✅ 対応済み** — 実装・検証完了
- **🔶 部分対応** — 実装されているが制限あり、またはスコープが限定的
- **❌ 未対応** — 今後対応予定
- **🚫 スコープ外** — 意図的に非対応（設計上のトレードオフ）

---

## 1. 基本方針

### ゼロ知識設計

全ての暗号化・復号をクライアント側で実行する。ストレージ（S3等）にはアクセス権があっても、マスターパスワードなしに復号不可能な状態でデータを保存する。

### サーバ不要のアーキテクチャ

単一ファイル（vault.json）として S3 互換ストレージに保存し、Conditional Write（If-Match）によりデータレースを防ぐ。この設計の代償として、ブルートフォース対策等のサーバ側ロジックは実装しない。

---

## 2. セキュリティ要件

### 2-1. 静止データの保護（Data at Rest）

vault.json ファイル自体の保護、および S3 接続情報等のローカルストレージ上の保護。

| 要件 | 状況 | 対応内容 |
|------|------|---------|
| vault.json の暗号化 | ✅ | AES-256-GCM。`schema_version` と `meta` のみ平文、`encrypted_vault` は全データをまとめて暗号化 |
| 鍵導出関数（KDF） | ✅ | Argon2id。salt・iterations・memory・parallelism を `meta.argon2_params` に保存。マスターパスワードから KEK を導出 |
| 鍵の階層化 | ✅ | マスターパスワード → Argon2id → KEK → (DEKアンラップ) → DEK の2層構造。DEK でvault全体を暗号化 |
| リカバリーキー | ✅ | DEK を2種類のKEK（マスターパスワード由来と リカバリーキー由来）で暗号化。どちらか一方があれば復号可能 |
| S3接続情報の暗号化 | ✅ | マスターパスワードの KEK を再利用し、S3 Access Key等を AES-256-GCM で暗号化してローカル保存（デスクトップ・拡張機能） |
| AEAD 認証 | ✅ | AES-256-GCM の GCMタグにより改ざん検知。IV は先頭12バイト、タグは末尾16バイト |

---

### 2-2. メモリ上の保護（Data in Memory）

暗号化鍵・平文パスワード・復号済みデータがメモリに存在する期間の保護。

| 要件 | 状況 | 対応内容・課題 |
|------|------|--|
| DEK のゼロ化 | ✅ | `vault-core/src/crypto/dek.rs`: `impl Drop` で `bytes.zeroize()` を呼び出し。`Clone` 未実装でコピーを防止 |
| KEK のゼロ化 | ✅ | `vault-core/src/crypto/kdf.rs`: アンロック処理完了後、DEK アンラップ時のみ一時的に保持。その後即ドロップ + `zeroize()` |
| RecoveryKey のゼロ化 | ✅ | `vault-core/src/crypto/recovery.rs`: `impl Drop` で zeroize |
| 暗号処理の中間バッファ | ✅ | `vault-core/src/crypto/encryption.rs`: `Zeroizing<Vec<u8>>` で復号時の平文バッファを保護 |
| typed_value のゼロ化 | 🔶 | store層：`VaultEntry.typed_value: Zeroizing<String>` で保護。API層（`EntryDetail`）で JSON 文字列として返された後は平文のまま |
| マスターパスワードのゼロ化 | 🔶 | `api_unlock()` スコープ内のみ保持（短期間）。`Zeroizing<String>` でラップされておらず、関数終了時のヒープ解放後も物理メモリに残存しうる |
| ノート（notes）のゼロ化 | ❌ | `VaultEntry` に `Drop` 実装なし。通常の `Option<String>` として保持され、ドロップ時にゼロ化されない |
| EntryData.typed_value のゼロ化 | ❌ | serde_json::Value として保持。Value に Zeroize 実装なし。デシリアライズ後は平文で存在 |
| lock() 時の VaultContents ゼロ化 | ❌ | `vault/state.rs` の `lock()` で self を consume してドロップするが、zeroize 処理なし。物理メモリ上に一時的に残存する可能性 |
| FFI戻り値のゼロ化 | ❌ | Android JNI / WASM への戻り値（JSON 文字列）は通常の String で返される。呼び出し元でゼロ化されない限り平文のまま |
| スワップアウトの防止（mlock） | 🚫 | WASM（ブラウザ拡張）では原理的に実現不可（ブラウザが メモリ管理）。デスクトップ（Tauri）での実装は将来検討 |
| コアダンプへの非出力（MADV_DONTDUMP） | ❌ | Linux `MADV_DONTDUMP` 未対応。将来デスクトップアプリで検討 |

---

### 2-3. 認証・アクセス制御

| 要件 | 状況 | 対応内容 |
|------|------|---------|
| マスターパスワード認証 | ✅ | マスターパスワード入力 → Argon2id でKEK導出 → DEK をアンラップ。失敗時（GCM認証失敗）は復号エラー |
| リカバリーキーによる復旧 | ✅ | リカバリーキーから KEK_recovery を導出 → DEK をアンラップ → 新マスターパスワードで encrypted_dek_master を更新。全アイテム再暗号化不要 |
| Argon2パラメータのアップグレード | ✅ | 設定画面から手動実行可能。新パラメータで KEK 再導出 → DEK を新KEK でラップ。旧DEKで暗号化されたvault本体は再暗号化不要 |
| DEKローテーション | ✅ | 設定画面から手動実行可能。新DEK生成 → 既存vault全体を旧DEKで復号・新DEKで再暗号化 → metaを更新 |
| 生体認証（Android） | 🔶 | `docs/android-autofill.md` に設計あり。Android Keystore で暗号化したマスターパスワード保存＋生体認証でのアンロックが可能。実装は進行中 |
| 自動ロック（タイムアウト） | ✅ | `CLAUDE.md` に記載。各プラットフォーム（Android・デスクトップ・拡張機能）で一定時間操作がない場合にロック。オフラインキャッシュは表示可能だが、ロック中は暗号化されたデータのアクセス不可 |
| バックグラウンド移行時のロック | ✅ | Android・iOS（非対応）で同様。ホームボタン押下やアプリ切り替え時に即座にロック |
| ブルートフォース対策 | 🚫 | サーバ不要設計のため試行回数制限を実装しない。これは既知のトレードオフ。DEK にはGCM認証失敗でブロック、マスターパスワードについては Argon2id コストで計算時間を増加させることのみが対策 |

---

### 2-4. データ完全性・同期の安全性

複数デバイス間での vault.json 同期時に、データロストやコンフリクトが発生しないための仕組み。

| 要件 | 状況 | 対応内容 |
|------|------|---------|
| 改ざん検知（AEAD） | ✅ | AES-256-GCM の GCM認証タグ。復号時に認証失敗すれば即座にエラー。`vault-core/src/crypto/encryption.rs` |
| データレース防止 | ✅ | Conditional Write（If-Match ヘッダ）。アップロード時に保存時点の ETag を指定。他デバイスが先に書き込んでいれば 412 Precondition Failed を返す。アトミックに書き込み成功するか失敗するかが決定される |
| コンフリクト自動解消 | ✅ | If-Match 412 時は自動マージ。`auto_merge(local, remote)` を実行。ユーザー選択なしに自動統合（詳細は CLAUDE.md 参照）。マージアルゴリズムは Tombstone（purged_at フィールド）+ Last-Writer-Wins（updated_at 比較） |
| tombstone のGC | ✅ | `purge_old_tombstones()` で 180日以上前の purged アイテム・ラベルを自動削除。`vault-core/src/engine/garbage_collection.rs` 参照。肥大化防止 |
| スキーマ後方互換性 | ✅ | `schema_version` を `vault.json` トップレベルに保持。破壊的変更は禁止。フィールド追加のみ許可。古いクライアントは未知のフィールドを無視する |
| 前方互換性（アイテム種類・カスタムフィールド） | ✅ | `EntryType` と `CustomFieldType` は永続化層で `String` として保存。新しいアイテム種類が追加されても古いクライアントは汎用表示で対応可能。詳細は CLAUDE.md 参照 |

---

### 2-5. クリップボードセキュリティ

| 要件 | 状況 | 対応内容 |
|------|------|---------|
| クリップボード自動クリア | ✅ | デフォルト 30秒。設定画面から時間変更・無効化可能。各プラットフォーム（Android・デスクトップ・拡張機能）で実装 |

---

### 2-6. ブラウザ拡張固有のセキュリティ

ブラウザ拡張機能特有の脅威（ページスクリプト、Content Security Policy、HTTPページ等）への対策。詳細は `docs/extension-autofill.md` Section 2-4 を参照。

| 要件 | 状況 | 対応内容 |
|------|------|---------|
| クレデンシャル最小露出 | ✅ | 2段階取得。ステップ1で URL にマッチするエントリを検索し `[{entryId, name, username}]` のみを返す。ステップ2でユーザー選択後に Service Worker が Vault を復号し `{username, password}` を返す。Content Script 側はフィールド入力直後にデータを破棄 |
| ISOLATED world の隔離 | ✅ | Content Script は manifest v3 の ISOLATED world で動作。ページスクリプトが `HTMLInputElement.prototype` を上書きしてもネイティブメソッドが保護される |
| 不可視フォーム攻撃の防止 | ✅ | フィールド入力前に `element.offsetParent !== null` 等で視認性をチェック。不可視フォーム（invisible form attack）による自動入力を防止 |
| HTTP ページの警告 | ✅ | HTTP ページ上でのオートフィルは可能だが、常時警告バナーを表示。ユーザー判断に委ねる（ブロックはしない） |
| Service Worker メモリ状態 | ✅ | 分割ログインフロー（最初のステップのパスワード、次ステップのOTP等）の状態は Service Worker のインメモリ Map で一時保持。`sessionStorage` は使用しない（ページスクリプトから読み取り可能なため） |

---

### 2-7. Android Autofill 固有のセキュリティ

Android Autofill Framework（API 26+）の仕様に基づくセキュリティ。詳細は `docs/android-autofill.md` Section 10 を参照。

| 要件 | 状況 | 対応内容 |
|------|------|---------|
| フィッシング対策（WebView） | ✅ | OS が提供する `webDomain` を使用。eTLD+1 ベースのマッチング（`example.com` と `example.com.evil.com` を区別） |
| フィッシング対策（ネイティブアプリ） | 🔶 | OS が提供する `packageName` と署名を検証。パッケージ名と URL の対応は `webDomain` フィールドで補完するが、無関係なアプリに候補が誤表示される可能性は残る。ただしユーザーの明示的な選択が必要なためリスク軽微 |
| FillResponse キャッシュ無効化 | ✅ | 毎回 `VaultBridge`（JNI）経由で vault-core から値を取得。キャッシュ保持なし。ロック状態でのキャッシュ残存を防止 |
| ロック状態の厳格な管理 | ✅ | `onFillRequest()` の冒頭で `VaultBridge.isUnlocked()` を確認。アンロック状態でなければ認証用 Dataset のみを返す（マスターパスワード入力または生体認証にリダイレクト） |

---

### 2-8. 通信セキュリティ

S3 等のストレージサービスとの通信。vault-core は通信実装を持たず、各プラットフォームの実装に委ねる。

| 要件 | 状況 | 対応内容 |
|------|------|---------|
| TLS 暗号化 | ✅ | S3 クライアント（AWS SDK 等）が HTTPS を強制。vault-core のレイヤーでは TLS チェーン検証は行わない（クライアント実装が担当） |
| エンドポイント認証 | ✅ | S3 Access Key + Secret Key 方式。認証情報自体はマスターパスワードで暗号化してローカル保存 |

---

## 3. 既知のトレードオフと設計上の限界

### ブルートフォース対策

サーバ不要のアーキテクチャにおいて、試行回数の制限をサーバ側で実装できない。マスターパスワード自体への試行回数制限はない。代わり、Argon2id の計算コスト（iterations, memory, parallelism）により単位時間当たりの試行数を制約する（デフォルト iterations=3 でも秒単位の計算時間）。

**結論:** 弱いマスターパスワードに対する辞書攻撃への耐性は低い。ユーザー教育（十分に複雑なマスターパスワード選択）が重要。

### mlock によるメモリ保護

WASM（ブラウザ拡張機能）では JavaScript エンジンがメモリ管理するため、mlock 相当の機能は原理的に実現不可。デスクトップアプリ（Tauri）での実装は技術的には可能だが、以下のコストがある：

- OS レベルの権限が必要（`CAP_IPC_LOCK` on Linux、特殊な entitlement on macOS）
- ロック可能メモリ量に上限あり（ulimit 制約）
- プラットフォーム別の API 差異（mlock on Unix、VirtualLock on Windows）
- カスタムアロケータが必要になる複雑性

**結論:** スワップアウトによりメモリ上のキーがディスク上に書き出される可能性は残る。

### 180日超の未同期デバイス

GC 時に purged tombstone を削除する。180日以上同期していないデバイスがこの期間に GC をスキップした場合、後で同期した際に GC 済み tombstone に対応するアイテムが「新規追加」として誤再出現する（false resurrection）。

**結論:** サーバなし設計における既知の限界として受け入れる。同期頻度を高めることで回避可能。

### リカバリーキー紛失時の復旧

マスターパスワードを忘れた場合、リカバリーキーで新パスワードを設定できる。しかしリカバリーキー自体を紛失した場合、復旧方法はない。

**結論:** オンボーディング画面でリカバリーキーの保管（紙印刷等）を強く推奨。

---

## 4. 将来の改善候補

メモリセキュリティを強化するため、以下の項目を検討中。

### 高優先度

1. **マスターパスワードの `Zeroizing<String>` 化**
   - ファイル: `vault-core/src/api/session.rs`
   - 変更: `api_unlock(&self, master_password: String)` → `api_unlock(&self, master_password: Zeroizing<String>)`
   - 効果: API境界でのマスターパスワード保持期間を短縮

2. **`VaultEntry.notes` のゼロ化**
   - ファイル: `vault-core/src/store.rs`
   - 変更: `impl Drop for VaultEntry` を追加、notes フィールドをゼロ化
   - 効果: notes がドロップ時に確実にゼロ化される

3. **`lock()` 時の `VaultContents` ゼロ化**
   - ファイル: `vault-core/src/vault/state.rs`
   - 変更: `lock()` メソッド内で `contents` をゼロ化してからドロップ
   - 効果: ロック時の平文データ残存を防止

### 中優先度

4. **生成済みパスワード `String` の `Zeroizing` 化**
   - ファイル: `vault-core/src/password_gen.rs`
   - 効果: パスワード生成時の平文残存を削減

5. **FFI戻り値のゼロ化手段の検討**
   - ファイル: `vault-core/src/api/mod.rs`
   - 課題: FFI境界で String を Zeroizing に変換するメカニズムの設計
   - 制約: 各プラットフォーム（Android JNI、WASM）での呼び出し側対応が必要

### 低優先度（デスクトップアプリのみ）

6. **デスクトップアプリでの `mlock` 対応**
   - ファイル: `desktop/` 実装層
   - 手段: `memsec` クレート利用、または libsodium 経由
   - 制約: 権限要件、メモリ上限、プラットフォーム差異

7. **`MADV_DONTDUMP` によるコアダンプ除外**
   - ファイル: `desktop/` 実装層
   - 効果: `kill -SEGV` 時に敏感なメモリ領域が core file に含まれない

---

## 5. 参照

### ドキュメント

- `CLAUDE.md` — 暗号化構造、同期設計、メモリセキュリティの基本方針
- `docs/extension-autofill.md` Section 2-4 — ブラウザ拡張のセキュリティ設計
- `docs/android-autofill.md` Section 10 — Android Autofill のセキュリティ設計

### コード

- `vault-core/src/crypto/dek.rs` — DEK のゼロ化実装
- `vault-core/src/crypto/kdf.rs` — KEK のゼロ化実装
- `vault-core/src/crypto/encryption.rs` — AES-256-GCM による暗号化
- `vault-core/src/vault/state.rs` — ロック・アンロック処理
- `vault-core/src/store.rs` — VaultEntry の定義
- `vault-core/src/api/session.rs` — APIレイヤーのマスターパスワード処理
- `vault-core/src/engine/garbage_collection.rs` — tombstone GC ロジック
