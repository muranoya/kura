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
- オートフィル候補のドメインマッチング（Public Suffix List (PSL) ベースのeTLD+1正規化。詳細は[`docs/android-autofillservice.md`](android-autofillservice.md)と[`docs/extension-autofill.md`](extension-autofill.md)を参照）

FFI構成：
```
vault-core（Rust）
    ├── JNI（Java Native Interface）   → Android
    ├── Rust クレートとして直接リンク   → デスクトップ (Slint)
    └── WASM（wasm-pack）              → ブラウザ拡張
```

Android向けJNIの活用先の一つであるAutofillService（システム標準のオートフィル機能への対応）については[`docs/android-autofillservice.md`](android-autofillservice.md)を参照。

---

### ブラウザ拡張のUI（サイドバー）

拡張機能のメインUIはツールバーアイコンから開閉するサイドバーとして提供する。Chrome は `side_panel`（`chrome.sidePanel`）、Firefox は `sidebar_action`（`browser.sidebarAction`）を使い、差異は `extension/src/background/sidebar.ts` で吸収する。Passkey の儀式ウィンドウ（`webauthn.html`）だけは、ページからの要求に応じて開く独立したウィンドウのままとする。

サイドバーはページを操作しても閉じず、開いたままになる。そのため次のように設計している。

- **オートロック**: 「拡張機能UIでの最後の操作」から設定時間が経つとロックする。サイドバーはクリック・キー入力・スクロールがあると `USER_ACTIVITY` を Service Worker に送り（15秒間隔に間引く）、Service Worker はそのたびに `autolock` アラームを張り直す。サイドバーを開いていても、操作しなければロックされる
- **状態変化の反映**: Service Worker 側で起きた変化は `chrome.runtime.sendMessage` で拡張機能ページにブロードキャストする（`ExtensionPageBroadcast`）。オートロックや儀式ウィンドウでのアンロックは `VAULT_LOCK_STATE_CHANGED` として送り、サイドバーはロック画面と一覧を切り替える。ピッカー・TOTP QR スキャン・既存エントリへの Passkey 登録の結果は `ENTRY_UPDATED_IN_BACKGROUND` として送り、開いている編集画面に反映する（SW が書き換えた属性だけを差し替え、編集中の他の内容は保持する）
- **Service Worker 再起動時のセッション復元**: Service Worker はアイドルで停止し、メモリ上のアンロック状態を失う。アンロック中は DEK（base64）を `chrome.storage.session`（メモリのみ・content script からは読めない）に置き、再起動後はそれで Argon2 を通さずにアンロックし直す（`api_unlock_with_dek`）。マスターパスワード自体は他サービスとの使い回しまで漏れうるため保存しない。DEK ローテーション時は差し替え、ロック時に削除する
- **現在のタブへの追従**: 「このサイト」のエントリは、タブの切り替えや遷移（`tabs.onActivated` / `tabs.onUpdated`）に応じて再計算する
- **幅への対応**: サイドバーの幅は可変なので、35rem 以上では一覧と詳細を左右に並べ、それより狭ければ一覧と詳細を切り替える1カラム表示にする

Content Script のロック中ドロップダウンからは `AUTOFILL_OPEN_SIDEBAR` でサイドバーを開く。Firefox の `sidebarAction.open()` はメッセージ経由ではユーザー操作として扱われず失敗するため、その場合は同じ画面を小さなウィンドウで開く（既に開いていればそのウィンドウを前面に出す）。このウィンドウからも操作対象のタブを正しく選べるよう、「現在のタブ」は `currentWindow` ではなく最後にフォーカスされた通常ウィンドウのアクティブタブとして解決する（`shared/tabs.ts`）。Firefox の `windows.getLastFocused` は `windowTypes` を無視してこのウィンドウ自身を返すため、その場合は通常ウィンドウのアクティブタブのうち最後に表示された（`lastAccessed` が最大の）ものを使う。

## Data Design

### vault.json の構造

S3上に単一ファイルとして保存。単一ファイルにすることでConditional Write（If-Match）によるデータレース対策が有効に機能する。

ファイルの中は、全ラベル・全エントリの非秘匿値をまとめた **index** ブロックと、エントリごとの秘匿値を持つ **secret** ブロックに分かれている（schema_version 2）。詳細な設計（フィールドの振り分け・AAD・移行）は `docs/vault-format-v2.md` を参照。

#### トップレベル（VaultFile）

```json
{
  "schema_version": 2,
  "meta": { /* VaultMeta（平文） */ },
  "index": "...",               /* base64(nonce[24] | ciphertext | tag[16]) */
  "secrets": {
    "entry-uuid-1": "..."       /* base64(nonce[24] | ciphertext | tag[16]) */
  }
}
```

- `secrets` のキーは entry_id。purged（完全削除）エントリは secret を持たない
- 秘匿値を持たないエントリでも secret ブロックは必ず作る（空オブジェクトを暗号化する）
- schema_version 1（`encrypted_vault` に全体を AES-256-GCM で暗号化した旧形式）は読み込み時のみ受け付け、アンロック時に v2 へ変換する

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
  "created_at": 1234567890,
  "recovery_argon2_params": { /* ... */ }, /* optional。recovery スロットの Argon2 パラメータ（省略時は argon2_params） */
  "master_updated_at": 1234567890,         /* master スロットを最後に変更した時刻。同期時の LWW に使う（ない場合は 0） */
  "recovery_updated_at": 1234567890        /* recovery スロットを最後に変更した時刻（同上） */
}
```

#### VaultIndex（index ブロックの平文）

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
      "public_fields": {         /* typed_value の非秘匿フィールド */
        "url": "https://mail.google.com",
        "username": "user@example.com"
      },
      "custom_fields": [         /* 全カスタムフィールドのメタデータ（順序を保持） */
        {
          "id": "custom-field-id",
          "name": "Security Question",
          "field_type": "text",  /* String型：未知タイプ対応 */
          "secret": false,       /* true なら値は secret 側にある */
          "value": "..."         /* 非秘匿の値（secret == true なら公開部のみ） */
        }
      ],
      "secret_rev": "uuid-v4"    /* secret ブロックの版。purged なら null */
    }
  },
  "meta_digest": {               /* 書き込み時点の meta の各スロットのダイジェスト。同期時に meta を検証する */
    "master": "...",
    "recovery": "..."
  }
}
```

#### EntrySecret（secret ブロックの平文、エントリごと）

```json
{
  "fields": { "password": "..." },          /* typed_value の秘匿フィールド */
  "notes": "...",                           /* optional */
  "custom_fields": { "custom-field-id": "..." } /* field_id → 秘匿値 */
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
- エントリ数は 2,000 件（active と soft-deleted の合計。purged は数えない）を上限とし、超える場合は新規作成をエラーにする。UI やローカル保存（拡張機能の `chrome.storage.local` の容量制限など）がこれより多い件数を想定していないため。同期で取り込んだエントリは上限を超えても受け入れる

---

## 暗号化構造

### 基本フロー

```
マスターパスワード
    ↓ Argon2id で鍵導出
KEK（Key Encryption Key）
    ↓ AES-256-GCM でラップ
DEK（Data Encryption Key）を暗号化 → VaultMeta.encrypted_dek_master に保存
    ↓ HKDF-SHA256 でサブ鍵を導出（info = "kura/v2/index" / "kura/v2/secret"）
index_key / secret_key
    ↓ XChaCha20-Poly1305 で暗号化（AAD で文脈に束縛）
VaultFile.index（全ラベル・全エントリの非秘匿値）
VaultFile.secrets[entry_id]（エントリごとの秘匿値）
```

### 暗号化パラメータ

- **鍵導出**: Argon2id (V0x13)
  - Minimum constraints: iterations >= 3, memory >= 64 MiB, salt >= 16 bytes
  - パラメータは平文の`VaultMeta.argon2_params`に保存
  - 攻撃者はパラメータを知っていても、マスターパスワード（ユーザーのみが知る）なしにはKEKを導出できない

- **DEK のラップ**: AES-256-GCM
  - Format: `[12-byte IV | ciphertext | 16-byte GCM tag]`

- **データ暗号化**: XChaCha20-Poly1305
  - Format: `base64(nonce[24] | ciphertext | tag[16])`
  - nonce は毎回 24 バイトのランダム値（192 bit のため衝突は事実上起きない）
  - AAD: index は `vault_uuid`、secret は `vault_uuid` / `entry_id` / `secret_rev` に束縛する。
    secret の入れ替え・エントリ単位のロールバック・2 台同時編集時の取り違えを復号失敗として検出する
  - 実装: `vault-core/src/crypto/aead.rs`

### メモリ安全性

- `zeroize`クレートで使用済みの秘密鍵（KEK、DEK、サブ鍵）をメモリから削除
- ロック時にDEKとサブ鍵をゼロ埋め解放
- アンロック中に平文で常駐するのは index（非秘匿値）だけ。秘匿値（password・notes 等）は secret ブロックの暗号文のまま保持し、`get_entry` / TOTP コード生成 / Passkey 署名など**必要になったときに、対象エントリの分だけ**復号する。復号結果は `SecretString`（`Zeroizing<String>`ラッパー）で保持し、使い終わった時点でドロップ連鎖でゼロ化される
- index 由来の文字列（エントリ名・username・URL 等）も個人情報なので `PublicString` / `PublicJson`（`SecretString` とは別の型）で保持し、ロック時にゼロ化する
- 一覧表示・検索・オートフィル候補判定・TOTP 周期の取得・Passkey 候補の列挙は index だけで処理し、同期（マージ）でも secret は復号しない
- 2026-07-09 時点では「Vault 全体を単一の AES-256-GCM ブロックとして暗号化し、エントリ単位暗号化はスキーマ変更・sync アルゴリズムへの影響が大きいため不採用」と判断していたが、未使用エントリの秘匿値までメモリに常駐するリスクを減らすため見直し、schema_version 2 でエントリ単位暗号化（index / secret の二層構造）に移行した（`docs/vault-format-v2.md`）

---

## リカバリーキー

DEKを2種類のKEKで暗号化して保存することで、どちらか一方があれば復号できる設計。

```
マスターパスワード → KEK_master   → encrypted_dek_master   (VaultMeta に保存)
リカバリーキー    → KEK_recovery → encrypted_dek_recovery  (VaultMeta に保存)
```

### リカバリーフロー

マスターパスワードを忘れた場合の復旧。Desktop・ブラウザ拡張・Android で同じ流れにそろえている。
復旧画面ではリカバリーキーと新しいマスターパスワード（確認入力つき）を入力させ、
「リカバリーキーでアンロックするだけ」の操作は用意しない。

1. リカバリーキーでアンロックする（`api_unlock_with_recovery_key`。`encrypted_dek_recovery` を `recovery_argon2_params()` で導出した KEK でアンラップ）
2. 新しいマスターパスワードを再設定する（`api_reset_master_password_with_recovery_key`）
   - DEK を新しいパスワードの KEK でラップし直し、master スロットを置き換える
   - スロットの更新時刻（`master_updated_at`）を進めるので、同期でリモートの古いスロット（忘れたパスワードのもの）に負けない
3. ローカルに保存する
4. S3 設定を新しいパスワードで復元する（S3 設定は DEK 由来の鍵で暗号化しているので、そのまま復号できる。Android は S3 設定を Keystore で保護したストレージに置いており、この手順はない）
5. 同期する（通常のアンロックと同じ）

- 2・3 に失敗した場合はロックし直し、復旧の失敗として表示する（再設定できていないのにアンロックしたままにしない）
- Android は生体認証・パスコードに古いパスワードを保存しているため、復旧時に無効にする
- リカバリーキーは変わらない。必要なら設定画面から再発行する

**重要**: 全アイテムの再暗号化は不要（DEK自体は変わらないため）

### リカバリーキーの形式

- 16バイトランダム値
- base32で表示（4文字グループ・ダッシュ区切り）
  - 例: `ABCD-EFGH-IJKL-MNOP`
- ユーザーが安全に保管可能な形式

---

## S3設定の暗号化

S3のアクセスキー・シークレットキー等のS3設定は、DEK から導出した鍵で暗号化してローカルストレージに保存。

### 暗号化フロー

```
マスターパスワード + VaultMeta.argon2_params
    ↓ Argon2 で鍵導出
KEK_master
    ↓ encrypted_dek_master をアンラップ
DEK
    ↓ HKDF-SHA256（info = "kura/v2/config"）
config_key
    ↓ XChaCha20-Poly1305（AAD = enc("kura/v2/config") || enc(vault_uuid)）
"v2." + base64(nonce | ciphertext | tag)
    ↓
ローカルストレージに保存
```

- DEK はマスターパスワード変更で変わらない。別の端末でパスワードが変更され、同期で新しい meta を取り込んでも、新しいパスワードでアンロックすれば S3 設定もそのまま復号できる
- 旧形式（`v2.` の接頭辞なし。KEK_master で直接 AES-256-GCM 暗号化したもの）も復号できる。アンロック時に旧形式なら現行形式で暗号化し直して保存する（`api_config_needs_upgrade`）

### ライフサイクル

| タイミング | 動作 |
|-----------|------|
| 初回セットアップ | S3設定はメモリに一時保持 → マスターパスワード設定後に暗号化して永続保存 |
| アンロック時 | DEK をアンラップ → S3設定を復号 → メモリに保持（旧形式なら暗号化し直す） |
| ロック時 | メモリ上のS3設定をクリア |
| マスターパスワード変更時 | 何もしない（DEK が変わらないため） |
| 拡張機能の Service Worker 再起動時 | セッションストレージの DEK で S3 設定を復号 → メモリに保持（`api_decrypt_config_with_dek`。旧形式はアンロック時に暗号化し直し済み） |
| リカバリーキーでの復旧時 | マスターパスワードを再設定した後、新しいパスワードで S3 設定を復号 → メモリに保持 |
| DEK ローテーション時 | 新しい DEK でS3設定を暗号化し直す |

### 制約

- ロック中はS3認証情報にアクセスできないため、**同期はアンロック後のみ可能**
- 旧形式の S3 設定は KEK_master で暗号化しているため、リカバリーキーでの復旧後（新しいパスワード）には**復号できない**。その場合は同期できないので、S3 設定をし直す必要がある
- vault-core の`api_encrypt_config` / `api_decrypt_config` API で暗号化・復号（Locked/Unlocked両状態で動作。どちらもマスターパスワードで DEK をアンラップする）

---

## ストレージ・同期設計

### 同期戦略

| タイミング | 動作 |
| ---------- | ---- |
| アンロック直後 | S3から最新を取得 |
| 書き込み時 | 即座にS3へアップロード |
| 手動同期 | UIから実行可能 |

同期処理の実行中にオートロックが発火した場合、進行中の同期は静かに中断され、エラーとしては扱われない（次回のアラーム、または次回アンロック時の同期で解消する）。

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

デスクトップ版は、取得時の ETag がない場合（起動後にリモートをまだ取得していない、またはリモートに存在しない）に If-None-Match: * を付与し、新規作成としてだけ書き込む。ETag なしの無条件の上書きで、他デバイスの変更を消さないためである。

### 412エラー時の自動解消フロー

```
1. リモートの最新をダウンロード
2. index だけを復号（secret は復号しない。リモートが schema_version 1 なら一括復号して v2 に変換）
3. `auto_merge(local, remote)` で index をマージし、各エントリの secret は勝った側の暗号文を採用
4. マージ済みの index を暗号化（secret は暗号文のまま使い回す）
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

- `entry_type` と `custom_field.field_type` は永続化層（`VaultEntry`, `IndexCustomField`）では **`String` として保存**
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
- 未知タイプでも、どの値が秘匿値かは書き込んだクライアントがデータ（`public_fields` / `secret` 属性）に記録しているため、表示・検索・マージは配置に従うだけでよい。secret ブロックはマージ時に暗号文のまま引き継ぐ
- 新しいクライアントが追加した未知のフィールドは、`VaultFile` / index の各エントリ・カスタムフィールド / `EntrySecret` で保持してそのまま書き戻す

#### schema_version との関係

- 新しいアイテム種類やカスタムフィールドタイプの追加は `schema_version` のインクリメント **不要**
- 古いクライアントはタイプ固有のセマンティクスを理解しないが、データを安全に保持できるため

---

## TOTP QR インポート

TOTP は `CustomField`（`field_type: "totp"`）として保持する。値は Base32 シークレット、または `otpauth://totp/...` URI（digits/period を含む場合はそのまま保持）。

### 読取手段（クライアント側）

| プラットフォーム | 手段 |
|------------------|------|
| Android | カメラ + ギャラリー画像（ソース選択ダイアログ） |
| Desktop | 画像ファイルのみ |
| ブラウザ拡張 | ページのスクリーンショットから QR 検出（編集画面のみ） |

画像デコードは各クライアントで行い、vault-core には画像を渡さない。読取後の文字列は既存の `generate_totp_from_value` で検証し、成功した値だけをフィールドへ格納する。

#### ブラウザ拡張のフロー

1. エントリ編集フォームの TOTP 値入力横の QR アイコンから起動する
2. 現在のフォーム内容を先に保存する（サイドバーは開いたまま）
3. アクティブタブにオーバーレイ（キャプチャモードと同様の右上ツールバー）を表示
4. ユーザーが [スキャン] を押すと `captureVisibleTab` でビューポートを取得し、content script 上で `@zxing/library` によりデコードする（複数 QR は検出位置をマスクして繰り返し検出）
   - `captureVisibleTab` には `<all_urls>` ホスト権限が必要なため manifest で宣言している。Chrome はサイドパネルを開くツールバークリックでは `activeTab` を付与せず、サイドバーを開いたままタブを移動した場合も `activeTab` は効かないため
5. 検出結果を一覧表示し、ユーザーが意図した候補を確認して保存する
6. Service Worker で TOTP 検証後、対象カスタムフィールドを直接更新し、`ENTRY_UPDATED_IN_BACKGROUND` で開いている編集画面に反映する

手入力（Base32 / otpauth URI の貼り付け）は従来どおり利用できる。画像ファイルからの読み取りは提供していない（ポップアップ UI だった頃はファイルダイアログの表示でポップアップが閉じたため。サイドバーでは閉じないので、今後追加できる）。新規作成中はエントリ ID が無いため QR スキャンは使えず、先に保存してから編集画面で行う。

Android ではアイコンタップ後に「カメラでスキャン」「画像を選択」の選択ダイアログを表示し、選んだ手段で読み取る。
