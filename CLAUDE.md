# kura - パスワードマネージャー

## 1. コンセプト

**「サーバ不要、自分一人のためのパスワードマネージャー」**

- サーバ不要
- S3などのクラウドストレージにデータを置くだけ
- ベンダーロックインなし
- 技術リテラシーが高めのユーザー向け

## 2. 機能要件

### パスワード管理

- パスワードアイテムの作成・編集・削除
- 削除したアイテムはゴミ箱に移動し、後から復元できる
- ゴミ箱から完全削除する操作も提供する
- アイテムにはお気に入り登録ができる
- アイテムには複数のラベルを付けられる
- マスターパスワードによるvaultのロック・アンロック
- パスワード生成機能
- クリップボードへのコピー後、一定時間で自動クリアする（デフォルト30秒、設定で変更可能・無効化も可能）
- オートロック：一定時間操作がない場合、またはバックグラウンド移行後に自動ロックする（設定で変更可能）

アイテムはtypeによって保持できる項目が異なる。

### マルチデバイス同期

- 複数デバイス間でvaultを同期できる
- オフライン時はローカルキャッシュで動作する

### 共有機能

- アイテム単位の細かい権限管理は対応しない
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
    - Android
- ウェブブラウザ拡張機能
    - Chrome
    - Firefox

開発者がiOSの端末を持っていないため、iOSアプリの開発は行わない。

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

ネットワーク通信は環境依存であるため、クラウドストレージへのダウンロード・アップロード操作はvault_coreには含めない。プラットフォームごとに通信の実装要件が異なり、vault_coreに含めると不要な複雑性が生じるため（例: WASMではtokio等の非同期ランタイムが使えずfetch APIを使う必要がある、AndroidではTLS証明書の扱いが通常のLinuxと異なる）。

- vault.jsonの読み書き管理
- 暗号化・復号
- 同期ロジック

```
vault_core（Rust）
    ├── JNI（Java Native Interface）   → Android
    ├── ネイティブFFI                  → デスクトップ (Tauri backend)
    └── WASM（wasm-pack）              → ブラウザ拡張
```

### クライアント構成

**モバイルアプリ**

- ネイティブアプリ（Android個別実装）
- Rust JNIでvault_coreをネイティブ呼び出し
- Access KeyはOSのKeystore（Android）に保存

**デスクトップアプリ**

- **対応プラットフォーム**: Windows / macOS / Linux
- S3設定（Access Key等）はマスターパスワードで暗号化してTauri storeに保存する（詳細は「S3設定の暗号化」セクション参照）

**ブラウザ拡張**

- TypeScript実装、Chrome/Firefox共通コードベース（webextension-polyfillで差異を吸収）
- 拡張機能単体で完結して動作する（ネイティブアプリへの依存なし）
- vault_coreをWASM経由で呼び出し
- S3設定（Access Key等）はマスターパスワードで暗号化してChrome storage localに保存する（詳細は「S3設定の暗号化」セクション参照）

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

アイテムの状態は `deleted_at` と `purged_at` の組み合わせで表現される：

| 状態 | deleted_at | purged_at | 意味 |
|------|-----------|-----------|------|
| active | `null` | （フィールドなし or `null`） | 通常アイテム |
| soft-deleted | `timestamp` | （フィールドなし or `null`） | ゴミ箱、復元可能 |
| purged | `timestamp` | `timestamp` | 完全削除済みtombstone。センシティブデータは空 |

`purged_at` はオプションフィールド（省略時は `null` 扱い）。古いクライアントはこのフィールドを無視する。

ラベルの `deleted_at` も同様にオプションフィールド。ラベルは削除 = 即tombstoneとなる（ゴミ箱なし）。

UUIDをキーとするマップ構造にすることで、IDがユニークなprimary keyであることが明示的になる。

### カスタムフィールド

アイテムに任意のカスタムフィールドを追加できる。各フィールドは以下の構造を持つ：

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

### 前方互換性ポリシー（アイテム種類・カスタムフィールドタイプ）

新しいアイテム種類（`entry_type`）やカスタムフィールドタイプ（`custom_field.field_type`）が追加された場合に、古いバージョンのクライアントが正常に動作し続けるためのポリシー。

#### 永続化層の原則

- `entry_type` と `custom_field.field_type` は永続化層（`VaultEntry`, `CustomField`）では **`String` として保存**する。厳密なenumはデシリアライズに使用しない
- `EntryType` / `CustomFieldType` enumはバリデーション専用として存在し、**エントリの作成・編集時のみ**使用する
- これにより、古いクライアントでも未知のタイプを含むvaultを正常にデシリアライズできる

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

#### 同期・マージ

- 未知タイプのエントリも既知タイプと**同一のLWWロジック**で処理する
- 古いクライアントが `typed_value` を変更できないため、マージでデータが破壊されるリスクはない
- 未知タイプのエントリは同期時に**必ず保持**され、削除や無視はしない

#### schema_version との関係

- 新しいアイテム種類やカスタムフィールドタイプの追加は `schema_version` のインクリメント**不要**
- 古いクライアントはタイプ固有のセマンティクスを理解しないが、データを安全に保持できるため

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

リカバリー時はリカバリーキーでDEKを取り出し、新しいマスターパスワードで `encrypted_dek_master` を更新する。全アイテムの再暗号化は不要。

### Argon2パラメータのアップグレード

セキュリティ強度を高めたい場合、設定画面から手動で実行できる。

```
マスターパスワードを再入力
    ↓
新しいArgon2パラメータでKEKを再導出
    ↓
DEKを新KEKで再ラップしてmetaを更新
```

全アイテムの再暗号化は不要で、metaの `argon2_params` と `encrypted_dek_master` の更新だけで済む。

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

### S3設定の暗号化

S3のアクセスキー・シークレットキー等のS3設定は、マスターパスワードで暗号化してローカルストレージに保存する。

```
マスターパスワード + vaultのArgon2Params
    ↓ Argon2で鍵導出
KEK（vaultのDEK暗号化と同じKEKを再利用）
    ↓
S3設定JSONをAES-256-GCMで暗号化
    ↓
base64エンコードしてローカルストレージに保存
```

**ライフサイクル:**

| タイミング | 動作 |
|-----------|------|
| 初回セットアップ | S3設定はメモリに一時保持 → マスターパスワード設定後に暗号化して永続保存 |
| アンロック時 | KEK導出 → S3設定を復号 → メモリに保持 |
| ロック時 | メモリ上のS3設定をクリア |
| マスターパスワード変更時 | 新しいKEKでS3設定を再暗号化 |

**制約:**
- ロック中はS3認証情報にアクセスできないため、同期はアンロック後のみ可能
- リカバリーキーでの復旧時は旧マスターパスワードのKEKが不明なため、S3設定の再入力が必要
- vault_coreの `api_encrypt_config` / `api_decrypt_config` APIで暗号化・復号を行う（Locked/Unlocked両状態で動作）

## 6. ストレージ・同期設計

### 同期戦略

| タイミング       | 動作                   |
| ---------------- | ---------------------- |
| アンロック直後   | S3から最新を取得       |
| 書き込み時       | 即座にS3へアップロード |
| 手動同期         | UIから実行可能         |

起動時はまずローカルキャッシュを即座に表示し、バックグラウンドでS3の更新を確認する。オフライン中に複数回編集した場合でも特別なキュー管理は行わない。同期時にローカルの最新状態とリモートを比較する。

### データレース対策

単純なETag比較ではcheck-then-actの競合状態によりデータロストが発生する。これを防ぐため **Conditional Write（If-Match）** を使ってアップロードをアトミックに行う。

```
アップロード時にIf-Match: <取得時のETag> を付与
  → ETagが一致する場合のみ書き込み成功
  → 他デバイスが先に書き込んでいた場合は412を返す（アトミックに保証）
```

412が返った場合のコンフリクト自動解消フロー：

1. リモートの最新をダウンロードしてencrypted_vaultを復号する
2. `auto_merge(local, remote)` を実行してマージ済みコンテンツを得る
3. マージ済みコンテンツを暗号化してConditional Writeで再アップロード
4. また412が返った場合は1からリトライする（上限回数を設ける）

コンフリクトは全ケース自動解消される（ユーザー選択不要）。

### コンフリクト自動解消アルゴリズム（Tombstone + LWW）

**基本原則:**
- アイテムのpurge（完全削除）はHashMapからの物理削除ではなく**tombstone化**する（`purged_at` を設定し、センシティブデータを空にする）
- 同一IDのアイテムが両方に存在する場合は `updated_at` が新しい方を採用する（LWW）
- 同一IDのアイテムが片方にしかない場合は「新規追加」として扱い、自動取込する

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
- **対象**: `purged_at` が180日より前のtombstoneアイテム
- **ラベル**: `deleted_at` が180日より前のtombstoneラベルも同様に削除

**許容済みトレードオフ**: 180日以上未同期のデバイスでは、GC済みtombstoneに対応するアイテムが「新規追加」として誤って再出現する可能性がある（false resurrection）。サーバなし設計における既知の制限として受け入れる。

## 7. ブラウザ拡張固有の設計

詳細は [`docs/extension-autofill.md`](docs/extension-autofill.md) を参照。

## 8. 開発上の注意事項

### ブラウザ拡張機能でのUIコンポーネント制約

ブラウザ拡張機能のポップアップ（`extension/`）では、Radix UIのPortalを使用するコンポーネント（`Select`, `DropdownMenu`等）が動作しない。ポップアップのisolatedなDOMコンテキストでPortalが正しくレンダリングされないため。

- **拡張機能**: `extension/src/popup/components/ui/type-filter-dropdown.tsx` などの自前ドロップダウンを使用すること
- **デスクトップ**: `desktop/` ではRadix UIをそのまま使用して問題ない

### ドキュメントと実装の関係

`docs/` 配下のドキュメントには先頭行に `<!-- doc-status: {status} -->` を付与している。

| ステータス | 意味 | 信頼の優先順位 |
|-----------|------|--------------|
| `design` | 未実装の設計書 | ドキュメントが正 |
| `partial` | 一部実装済み | 実装済み部分はコードが正、未実装部分はドキュメントが正 |
| `implemented` | 実装済み | コードが正 |

**AIエージェント向けルール:**

1. 実装を変更したら、関連するドキュメントも同時に更新すること
2. ドキュメントの記述に基づいて作業する前に、対応するコードの実態を確認すること
3. `partial` のドキュメントでは、セクション単位の `未実装` マーカー（例: `> **未実装（将来対応予定）**`）を確認し、実装済み部分と未実装部分を区別すること
4. 新機能を実装して `design` → `partial` や `partial` → `implemented` に変わった場合、ステータスを更新すること
