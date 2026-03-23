# kura - パスワードマネージャー

## 1. コンセプト

**「サーバ不要、自分一人のための、運用コストゼロのパスワードマネージャー」**

- サーバ不要
- S3などのクラウドストレージにデータを置くだけ
- ベンダーロックインなし
- 技術リテラシーが高めのユーザー向け

## 2. 機能要件

### パスワード管理

- パスワードエントリの作成・編集・削除
- 削除したエントリはゴミ箱に移動し、後から復元できる
- ゴミ箱から完全削除する操作も提供する
- エントリにはお気に入り登録ができる
- エントリには複数のラベルを付けられる
- マスターパスワードによるvaultのロック・アンロック
- パスワード生成機能
- クリップボードへのコピー後、一定時間で自動クリアする（デフォルト30秒、設定で変更可能・無効化も可能）
- オートロック：一定時間操作がない場合、またはバックグラウンド移行後に自動ロックする（設定で変更可能）

エントリはtypeによって保持できる項目が異なる。初期リリースでサポートするtypeは以下の通り。

| type          | 説明             | 主な項目                          |
| ------------- | ---------------- | --------------------------------- |
| `login`       | 一般的なログイン | URL・ユーザー名・パスワード・TOTP |
| `bank`        | 銀行口座         | 銀行名・口座番号・PIN             |
| `ssh_key`     | SSHキー          | 秘密鍵・パスフレーズ              |
| `secure_note` | セキュアノート   | テキスト                          |
| `credit_card` | クレジットカード | カード名義・番号・有効期限・CVV   |
| `passkey`     | PassKey          | 将来対応、初期リリースでは未実装  |

### マルチデバイス同期

- 複数デバイス間でvaultを同期できる
- オフライン時はローカルキャッシュで動作する

### 共有機能

- エントリ単位の細かい権限管理は対応しない
- マルチアカウント切り替えで代替する
- 個人vault / 家族vault等、vault単位で別ファイルを持つ
- 家族共有はS3の共有バケットにvault.jsonを置き、マスターパスワードを家族間で共有する運用

### リカバリー

- セットアップ時にリカバリーキーを生成する
- マスターパスワードを忘れた場合、リカバリーキーで新しいマスターパスワードを設定できる
- リカバリーキーはマスターパスワードで認証すれば再表示・再発行できる
- リカバリーキーを失った場合は復旧不可能（仕様として割り切る）
- オンボーディングでリカバリーキーの保管（「紙に印刷して保管」等）を強調する

## 3. 非機能要件

### セキュリティ

- 暗号化・復号は全てクライアント側で行う（ゼロ知識設計）
- ストレージにはアクセスできても、マスターパスワードなしに復号できない
- ロック時にメモリ上のDEKは`zeroize`クレートでゼロ埋めして解放する
- ブルートフォース対策のための失敗試行回数制限はアーキテクチャ上実装しない（サーバがないため）

### 対応プラットフォーム

- デスクトップ
    - Linux
    - Windows
    - MacOS
- スマートフォン
    - iOS
    - Android
- ウェブブラウザ拡張機能
    - Chrome
    - Firefox

### 対応ストレージサービス

S3互換のクラウドストレージのみ対応する。Google Drive / Dropbox等には対応しない。

- **対応サービス例**: AWS S3 / Cloudflare R2 / MinIO
- **必須要件**: Conditional Write（If-Match）に対応していること
- **認証**: Access Key + Secret Key方式

## 4. アーキテクチャ

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

### vault_core

`vault_core` はRustで実装されたコアライブラリで、全クライアントから使用される。

- vault.jsonの読み書き管理
- 暗号化・復号
- クラウドストレージ操作
- 同期ロジック

```
vault_core（Rust）
    ├── FFI（flutter_rust_bridge）     → モバイル
    ├── ネイティブFFI                  → デスクトップ (Tauri backend)
    └── WASM（wasm-pack）              → ブラウザ拡張
```

### クライアント構成

**モバイルアプリ**

- Flutter（iOS/Android共通コードベース）
- flutter_rust_bridgeでvault_coreをFFI呼び出し
- Access KeyはOSのKeychain（iOS） / Keystore（Android）に保存

**デスクトップアプリ**

- **対応プラットフォーム**: Windows / macOS / Linux

**ブラウザ拡張**

- TypeScript実装、Chrome/Firefox共通コードベース（webextension-polyfillで差異を吸収）
- 拡張機能単体で完結して動作する（ネイティブアプリへの依存なし）
- vault_coreをWASM経由で呼び出し
- Access KeyはマスターパスワードでラップしてChrome storage localに保存する。ロック中はAccess Keyが暗号化されたまま残るが、マスターパスワードなしに復号できないため実害はない（他のパスワードマネージャーも同様の設計を採用している）

## 5. データ設計

### vault.jsonの構造

S3上に単一ファイルとして保存する。`schema_version` と `meta` は平文で保持し、それ以外のデータは `encrypted_vault` としてまとめて暗号化する。単一ファイルにすることでConditional Write（If-Match）によるデータレース対策が有効に機能する。

```json
{
  "schema_version": 1,
  "meta": {
    "encrypted_dek_master": "...",
    "encrypted_dek_recovery": "...",
    "argon2_params": {
      "salt": "...",
      "iterations": 3,
      "memory": 65536,
      "parallelism": 4
    },
    "created_at": 1700000000
  },
  "encrypted_vault": "base64エンコードされた暗号化済みデータ"
}
```

`encrypted_vault` はDEKでAES-256-GCMで暗号化したJSONをBase64エンコードしたもの。一度復号すれば全データにアクセスできる。暗号化バイナリの先頭12バイトがIV、末尾16バイトがGCMタグ。

`encrypted_vault` を復号したJSONの構造：

```json
{
  "labels": {
    "uuid": { "name": "仕事", "deleted_at": null },
    "uuid": { "name": "プライベート" }
  },
  "entries": {
    "uuid": {
      "type": "login",
      "name": "Example",
      "created_at": 1700000000,
      "updated_at": 1700000000,
      "deleted_at": null,
      "purged_at": null,
      "is_favorite": false,
      "label_ids": ["uuid"],
      "typed_value": {
        "url": "https://example.com",
        "username": "user@example.com",
        "password": "...",
        "totp": null
      },
      "notes": null,
      "custom_fields": [
        {
          "id": "uuid",
          "name": "セキュリティ質問",
          "field_type": "text",
          "value": "ペットの名前"
        }
      ]
    }
  }
}
```

エントリの状態は `deleted_at` と `purged_at` の組み合わせで表現される：

| 状態 | deleted_at | purged_at | 意味 |
|------|-----------|-----------|------|
| active | `null` | （フィールドなし or `null`） | 通常エントリ |
| soft-deleted | `timestamp` | （フィールドなし or `null`） | ゴミ箱、復元可能 |
| purged | `timestamp` | `timestamp` | 完全削除済みtombstone。センシティブデータは空 |

`purged_at` はオプションフィールド（省略時は `null` 扱い）。古いクライアントはこのフィールドを無視する。

ラベルの `deleted_at` も同様にオプションフィールド。ラベルは削除 = 即tombstoneとなる（ゴミ箱なし）。

UUIDをキーとするマップ構造にすることで、IDがユニークなprimary keyであることが明示的になる。

### カスタムフィールド

エントリに任意のカスタムフィールドを追加できる。各フィールドは以下の構造を持つ：

- `id`（string）: フィールドを一意に識別するUUID
- `name`（string）: フィールドの表示名
- `field_type`（string）: フィールドの型（以下の値いずれか）
  - `text`: 通常のテキスト
  - `password`: パスワード（マスク表示対象）
  - `email`: メールアドレス
  - `url`: URL
  - `phone`: 電話番号
- `value`（string）: フィールドの値

`custom_fields` は `Option<Vec<CustomField>>` で、追加されていない場合は `null` となる。

### エントリのtype別データ構造

typeごとの `typed_value` のスキーマはvault_core側で定義・管理する。

```json
// type: login
{ "url": "https://example.com", "username": "...", "password": "...", "totp": null }

// type: bank
{ "bank_name": "...", "account_number": "...", "pin": "..." }

// type: ssh_key
{ "private_key": "...", "passphrase": null }

// type: secure_note
{ "content": "..." }

// type: credit_card
{ "cardholder": "...", "number": "...", "expiry": "...", "cvv": "..." }

// type: passkey（将来対応、初期リリースでは未実装）
{}
```

### スキーマバージョン管理方針

- vault.jsonのトップレベルに `schema_version` を平文で持つ
- **破壊的変更は全面禁止**。フィールドの追加のみ許可する
- schema_versionのインクリメントは「このバージョン未満のクライアントはvaultを正しく扱えない」場合のみ行う

具体的なインクリメントの基準：

| ケース                                           | インクリメント |
| ------------------------------------------------ | -------------- |
| フィールド追加（古いクライアントは無視するだけ） | 不要           |
| フィールドの意味・型が変わる                     | 必要           |
| 暗号化構造の変更                                 | 必要           |
| vault.json全体の構造変更                         | 必要           |
| フィールド削除（原則禁止）                       | 必要           |

### 暗号化構造

```
マスターパスワード
    ↓ Argon2で鍵導出
KEK（Key Encryption Key）
    ↓
DEK（Data Encryption Key）を暗号化してmetaに保存
    ↓
DEKでencrypted_vaultを暗号化（AES-256-GCM）
  → 一度の復号でlabels・entries全データにアクセスできる
```

### リカバリーキーの仕組み

DEKを2種類のKEKで暗号化して保存することで、どちらか一方があれば復号できる。

```
マスターパスワード → KEK_master   → encrypted_dek_master   (metaに保存)
リカバリーキー    → KEK_recovery → encrypted_dek_recovery  (metaに保存)
```

リカバリー時はリカバリーキーでDEKを取り出し、新しいマスターパスワードで `encrypted_dek_master` を更新する。全エントリの再暗号化は不要。

### Argon2パラメータのアップグレード

セキュリティ強度を高めたい場合、設定画面から手動で実行できる。

```
マスターパスワードを再入力
    ↓
新しいArgon2パラメータでKEKを再導出
    ↓
DEKを新KEKで再ラップしてmetaを更新
```

全エントリの再暗号化は不要で、metaの `argon2_params` と `encrypted_dek_master` の更新だけで済む。

### DEKローテーション

DEK漏洩が疑われる場合など、設定画面から手動で実行できる。

```
新しいDEKをランダム生成
    ↓
encrypted_vaultを旧DEKで復号 → 新DEKで再暗号化
    ↓
metaのencrypted_dek_master / encrypted_dek_recoveryを新DEKで更新
    ↓
S3にアップロード
```

## 6. ストレージ・同期設計

### 同期戦略

| タイミング   | 動作                   |
| ------------ | ---------------------- |
| アプリ起動時 | S3から最新を取得       |
| 書き込み時   | 即座にS3へアップロード |
| 手動同期     | UIから実行可能         |

起動時はまずローカルキャッシュを即座に表示し、バックグラウンドでS3の更新を確認する。オフライン中に複数回編集した場合でも特別なキュー管理は行わない。同期時にローカルの最新状態とリモートを比較する。

### データレース対策

単純なETag比較ではcheck-then-actの競合状態によりデータロストが発生する。これを防ぐため **Conditional Write（If-Match）** を使ってアップロードをアトミックに行う。

```
アップロード時にIf-Match: <取得時のETag> を付与
  → ETagが一致する場合のみ書き込み成功
  → 他デバイスが先に書き込んでいた場合は409を返す（アトミックに保証）
```

409が返った場合のコンフリクト自動解消フロー：

1. リモートの最新をダウンロードしてencrypted_vaultを復号する
2. `auto_merge(local, remote)` を実行してマージ済みコンテンツを得る
3. マージ済みコンテンツを暗号化してConditional Writeで再アップロード
4. また409が返った場合は1からリトライする（上限回数を設ける）

コンフリクトは全ケース自動解消される（ユーザー選択不要）。

### コンフリクト自動解消アルゴリズム（Tombstone + LWW）

**基本原則:**
- エントリのpurge（完全削除）はHashMapからの物理削除ではなく**tombstone化**する（`purged_at` を設定し、センシティブデータを空にする）
- 同一IDのエントリが両方に存在する場合は `updated_at` が新しい方を採用する（LWW）
- 同一IDのエントリが片方にしかない場合は「新規追加」として扱い、自動取込する

**コンフリクトケース網羅表:**

「存在する」= HashMapにkeyがある（状態問わず）
「存在しない」= HashMapにkeyが一切ない（GC済みtombstoneも含む）

| ケース | ローカル | リモート | updated_at | 解消方法 |
|--------|---------|---------|-----------|---------|
| B-1 | active | 存在しない | — | **ローカル採用**（ローカル新規追加） |
| B-2 | soft-deleted | 存在しない | — | **ローカル採用** |
| B-3 | purged | 存在しない | — | **ローカル採用**（tombstone伝播） |
| B-4 | 存在しない | active | — | **リモート採用**（リモート新規追加） |
| B-5 | 存在しない | soft-deleted | — | **リモート採用** |
| B-6 | 存在しない | purged | — | **リモート採用**（tombstone伝播） |
| C-1 | active | active | ローカルが新しい | **LWW → ローカル採用** |
| C-2 | active | active | リモートが新しい | **LWW → リモート採用** |
| C-3 | active | active | 同じ・内容同じ | 変更なし |
| C-4 | active | active | 同じ・内容違う | **リモート採用**（クロックずれは稀） |
| D-1 | active | soft-deleted | ローカルが新しい | **LWW → ローカル（active）採用** |
| D-2 | active | soft-deleted | リモートが新しい | **LWW → リモート（soft-deleted）採用** |
| D-3 | active | soft-deleted | 同じ | **soft-deleted優先** |
| D-4 | soft-deleted | active | ローカルが新しい | **LWW → ローカル（soft-deleted）採用** |
| D-5 | soft-deleted | active | リモートが新しい | **LWW → リモート（active）採用** |
| D-6 | soft-deleted | active | 同じ | **soft-deleted優先** |
| D-7 | active | purged | ローカルが新しい | **ローカル（active）採用**（purge後に復元・再編集） |
| D-8 | active | purged | リモートが新しい | **LWW → リモート（purged）採用** |
| D-9 | active | purged | 同じ | **purged優先** |
| D-10 | purged | active | ローカルが新しい | **LWW → ローカル（purged）採用** |
| D-11 | purged | active | リモートが新しい | **リモート（active）採用**（purge後に復元・再編集） |
| D-12 | purged | active | 同じ | **purged優先** |
| D-13 | soft-deleted（新） | purged（古） | ローカルが新しい | **ローカル（soft-deleted）採用**（後からpurge可能・不可逆操作を優先しない） |
| D-14 | soft-deleted | purged（新） | リモートが新しい | **LWW → purged採用** |
| D-15 | soft-deleted | purged | 同じ | **purged優先** |
| D-16 | purged（新） | soft-deleted | ローカルが新しい | **LWW → purged採用** |
| D-17 | purged（古） | soft-deleted（新） | リモートが新しい | **リモート（soft-deleted）採用**（D-13と同様） |
| D-18 | purged | soft-deleted | 同じ | **purged優先** |

**tie-breakingルール（updated_atが同じで状態が違う場合）:**
`purged > soft-deleted > active` の優先順位（削除側を安全側とする）。
ただしD-13/D-17のパターン（soft-deletedの方がpurgedより新しい）は例外としてsoft-deletedを優先する。

### tombstoneのGC（Garbage Collection）

purge済みtombstoneは永続保持するとvault.jsonが肥大化するため、一定期間後に自動削除する。

- **保持期間**: 180日（プログラム定数、vault.jsonには含めない）
- **実行タイミング**: 同期成功後（`auto_merge` 内で毎回実行）
- **対象**: `purged_at` が180日より前のtombstoneエントリ
- **ラベル**: `deleted_at` が180日より前のtombstoneラベルも同様に削除

**許容済みトレードオフ**: 180日以上未同期のデバイスでは、GC済みtombstoneに対応するエントリが「新規追加」として誤って再出現する可能性がある（false resurrection）。サーバなし設計における既知の制限として受け入れる。

## 7. ブラウザ拡張固有の設計

### フォーム検出

- 汎用ヒューリスティックで基本的なフォームを検出する
- サイト固有の例外はパターンDBで対応する
- 対応できないサイトは手動入力でカバーする（v1の割り切り）

### パターンDB

サイト固有のフォーム検出ルールをSQLiteで管理し、GitHubで公開する。

- コミュニティによるコントリビュートを受け付ける
- 拡張機能にはビルド時の最新を同梱する
- バックグラウンドで週次自動更新する
- 更新失敗時は最後に取得済みのパターンDBにフォールバックする
- GitHub Pages経由で配信する（拡張機能ストアの審査対策）
