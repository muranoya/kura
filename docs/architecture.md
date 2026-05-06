<!-- doc-status: implemented -->

# kura アーキテクチャ・データ設計

## アーキテクチャ概要

### 全体構成

```
クライアント（スマホ / ブラウザ拡張 / デスクトップ）
  ├ 暗号化・復号（全てクライアント側で処理）
  ├ ローカルキャッシュ（オフライン対応）
  └ クラウドストレージへ読み書き
            ↓
      vault.json（暗号化済みJSON）
            ↓
S3 / Cloudflare R2 / MinIO（ユーザーが選ぶ）
```

### vault-core

Rustで実装されたコアライブラリ。全クライアント（Android / デスクトップ / ブラウザ拡張）から使用される。

ネットワーク通信は環境依存であるため、クラウドストレージへのダウンロード・アップロード操作はvault-coreには含めない。理由：
- WASMではtokio等の非同期ランタイムが使えずfetch APIを使う必要がある
- AndroidではTLS証明書の扱いが通常のLinuxと異なる
- プラットフォームごとの実装要件が異なると複雑性が増加

vault-coreの責務：
- vault.jsonの読み書き管理
- 暗号化・復号
- 同期ロジック（コンフリクト自動解消、tombstone GC）

FFI構成：
```
vault-core（Rust）
    ├── JNI（Java Native Interface）   → Android
    ├── ネイティブFFI                  → デスクトップ (Tauri backend)
    └── WASM（wasm-pack）              → ブラウザ拡張
```

---

## Data Design

### vault.json の構造

S3上に単一ファイルとして保存。単一ファイルにすることでConditional Write（If-Match）によるデータレース対策が有効に機能する。

#### トップレベル（VaultFile）

```json
{
  "schema_version": 1,
  "meta": { /* VaultMeta（平文） */ },
  "encrypted_vault": "..." /* base64 */
}
```

#### VaultMeta（平文保存）

```json
{
  "vault_uuid": "unique-id",
  "encrypted_dek_master": "...",      /* base64: DEK wrapped with master KEK */
  "encrypted_dek_recovery": "...",    /* base64: DEK wrapped with recovery KEK */
  "argon2_params": {
    "salt": "...",      /* base64 */
    "iterations": 4,    /* >= 3 */
    "memory": 67108864, /* >= 64 MiB (64 * 1024 * 1024) */
    "parallelism": 1
  },
  "created_at": 1234567890
}
```

#### VaultContents（暗号化後）

```json
{
  "labels": {
    "label-uuid-1": {
      "name": "Work",
      "created_at": 1234567890,
      "deleted_at": null /* optional, tombstone marker */
    }
  },
  "entries": {
    "entry-uuid-1": {
      "type": "login",           /* String型：未知タイプ対応 */
      "name": "Gmail",
      "created_at": 1234567890,
      "updated_at": 1234567890,
      "deleted_at": null,        /* soft-delete marker */
      "purged_at": null,         /* optional, complete-delete tombstone */
      "is_favorite": false,
      "label_ids": ["label-uuid-1"],
      "typed_value": "{...}",    /* JSON string */
      "notes": null,
      "custom_fields": [
        {
          "id": "custom-field-id",
          "name": "Security Question",
          "field_type": "text",  /* String型：未知タイプ対応 */
          "value": "..."
        }
      ]
    }
  }
}
```

### アイテムの状態

`deleted_at` と `purged_at` の組み合わせで表現。

| 状態 | deleted_at | purged_at | 説明 |
|------|-----------|-----------|------|
| active | `null` | `null` | 通常アイテム |
| soft-deleted | `timestamp` | `null` | ゴミ箱、復元可能 |
| purged | `timestamp` | `timestamp` | 完全削除済みtombstone。センシティブデータは空 |

- `purged_at` はオプションフィールド（省略時は`null`扱い）。古いクライアントは無視する
- ラベルの`deleted_at`も同様にオプションフィールド
- ラベルは削除=即tombstoneとなる（ゴミ箱なし）
- UUIDをキーとするマップ構造により、IDがユニークなprimary keyであることが明示的になる

---

## 暗号化構造

### 基本フロー

```
マスターパスワード
    ↓ Argon2id で鍵導出
KEK（Key Encryption Key）
    ↓ AES-256-GCM でラップ
DEK（Data Encryption Key）を暗号化 → VaultMeta.encrypted_dek_master に保存
    ↓ DEK で暗号化
VaultContents（labels + entries）を AES-256-GCM で暗号化
    ↓ base64 エンコード
VaultFile.encrypted_vault に保存
```

### 暗号化パラメータ

- **鍵導出**: Argon2id (V0x13)
  - Minimum constraints: iterations >= 3, memory >= 64 MiB, salt >= 16 bytes
  - パラメータは平文の`VaultMeta.argon2_params`に保存
  - 攻撃者はパラメータを知っていても、マスターパスワード（ユーザーのみが知る）なしにはKEKを導出できない

- **データ暗号化**: AES-256-GCM
  - Format: `[12-byte IV | ciphertext | 16-byte GCM tag]`
  - IVは毎回ランダム生成（同じ鍵でも異なる平文ごとに異なるIV）
  - GCM tag により改ざん検知

### メモリ安全性

- `zeroize`クレートで使用済みの秘密鍵（KEK、DEK）をメモリから削除
- ロック時にDEKをゼロ埋め解放

---

## リカバリーキー

DEKを2種類のKEKで暗号化して保存することで、どちらか一方があれば復号できる設計。

```
マスターパスワード → KEK_master   → encrypted_dek_master   (VaultMeta に保存)
リカバリーキー    → KEK_recovery → encrypted_dek_recovery  (VaultMeta に保存)
```

### リカバリーフロー

1. リカバリーキーでDEKを取り出す（`encrypted_dek_recovery`をアンラップ）
2. DEKでvaultを復号
3. 新しいマスターパスワードで`encrypted_dek_master`を再暗号化して保存

**重要**: 全アイテムの再暗号化は不要（DEK自体は変わらないため）

### リカバリーキーの形式

- 16バイトランダム値
- base32で表示（4文字グループ・ダッシュ区切り）
  - 例: `ABCD-EFGH-IJKL-MNOP`
- ユーザーが安全に保管可能な形式

---

## S3設定の暗号化

S3のアクセスキー・シークレットキー等のS3設定は、マスターパスワードで暗号化してローカルストレージに保存。

### 暗号化フロー

```
マスターパスワード + VaultMeta.argon2_params
    ↓ Argon2 で鍵導出（vault のDEK暗号化と同じKEK）
KEK（再利用）
    ↓ AES-256-GCM で暗号化
S3 設定 JSON
    ↓ base64 エンコード
ローカルストレージに保存
```

### ライフサイクル

| タイミング | 動作 |
|-----------|------|
| 初回セットアップ | S3設定はメモリに一時保持 → マスターパスワード設定後に暗号化して永続保存 |
| アンロック時 | KEK導出 → S3設定を復号 → メモリに保持 |
| ロック時 | メモリ上のS3設定をクリア |
| マスターパスワード変更時 | 新しいKEKでS3設定を再暗号化 |

### 制約

- ロック中はS3認証情報にアクセスできないため、**同期はアンロック後のみ可能**
- リカバリーキーでの復旧時は旧マスターパスワードのKEKが不明なため、**S3設定の再入力が必要**
- vault-core の`api_encrypt_config` / `api_decrypt_config` API で暗号化・復号（Locked/Unlocked両状態で動作）

---

## ストレージ・同期設計

### 同期戦略

| タイミング | 動作 |
| ---------- | ---- |
| アンロック直後 | S3から最新を取得 |
| 書き込み時 | 即座にS3へアップロード |
| 手動同期 | UIから実行可能 |

**UX考慮**:
- 起動時はまずローカルキャッシュを即座に表示
- バックグラウンドでS3の更新を確認
- オフライン中に複数回編集しても特別なキュー管理は行わない
- 同期時にローカルの最新状態とリモートを比較

### データレース対策：Conditional Write

単純なETag比較ではcheck-then-actの競合状態によりデータロストが発生。これを防ぐため **Conditional Write（If-Match）** を使ってアップロードをアトミックに行う。

```
アップロード時に If-Match: <取得時の ETag> を付与
  → ETag が一致する場合のみ書き込み成功
  → 他デバイスが先に書き込んでいた場合は 412 を返す（アトミックに保証）
```

### 412エラー時の自動解消フロー

```
1. リモートの最新をダウンロード
2. encrypted_vault を復号
3. `auto_merge(local, remote)` でマージ済みコンテンツを取得
4. マージ済みコンテンツを暗号化
5. Conditional Write で再アップロード
6. 412 が再度返った場合は 1 からリトライ（上限回数あり）
```

**全コンフリクトは自動解消**（ユーザー選択不要）

詳細なマージアルゴリズムは `docs/sync-algorithm.md` を参照。

---

## スキーマバージョン管理

### 方針

- vault.jsonのトップレベルに`schema_version`を平文で持つ
- **破壊的変更は全面禁止**。フィールドの追加のみ許可
- schema_versionのインクリメントは「このバージョン未満のクライアントはvaultを正しく扱えない」場合のみ行う

### インクリメント基準

| ケース | インクリメント |
|--------|---------|
| フィールド追加（古いクライアントは無視するだけ） | 不要 |
| フィールドの意味・型が変わる | 必要 |
| 暗号化構造の変更 | 必要 |
| vault.json全体の構造変更 | 必要 |
| フィールド削除（原則禁止） | 必要 |

### 前方互換性ポリシー

新しいアイテム種類（`entry_type`）やカスタムフィールドタイプ（`custom_field.field_type`）が追加された場合に、古いバージョンのクライアントが正常に動作し続けるためのポリシー。

#### 永続化層の原則

- `entry_type` と `custom_field.field_type` は永続化層（`VaultEntry`, `CustomField`）では **`String` として保存**
- 厳密なenumはデシリアライズに使用しない
- `EntryType` / `CustomFieldType` enumはバリデーション専用（エントリの作成・編集時のみ使用）
- 古いクライアントでも未知のタイプを含むvaultを正常にデシリアライズできる

#### 古いクライアントでの未知タイプの挙動

| 操作 | 許可 | 理由 |
|------|------|------|
| 一覧表示 | ○ | 汎用アイコン＋生のタイプ文字列で表示 |
| 詳細閲覧 | ○ | `typed_value` はkey-valueリストとして汎用表示 |
| `typed_value` の編集 | × | フォーム定義がないため正しく編集できない |
| メタデータ編集（名前・ノート・ラベル・お気に入り） | ○ | タイプに依存しない |
| 既知タイプのカスタムフィールド編集 | ○ | タイプに依存しない |
| 未知タイプのカスタムフィールド表示 | ○ | プレーンテキストとして表示 |
| 未知タイプのカスタムフィールド編集 | × | 入力バリデーションが不明 |
| 削除・復元・完全削除 | ○ | タイプに依存しない |
| 未知タイプのエントリ新規作成 | × | フォーム定義がない |

#### 同期・マージでの扱い

- 未知タイプのエントリも既知タイプと同一のLWWロジックで処理
- 古いクライアントが`typed_value`を変更できないため、マージでデータ破壊のリスクなし
- 未知タイプのエントリは同期時に必ず保持（削除や無視なし）

#### schema_version との関係

- 新しいアイテム種類やカスタムフィールドタイプの追加は `schema_version` のインクリメント **不要**
- 古いクライアントはタイプ固有のセマンティクスを理解しないが、データを安全に保持できるため
