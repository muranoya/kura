<!-- doc-status: design -->

# vault.json フォーマット v2（エントリ単位暗号化）

## 1. 背景と目的

### 1-1. 現状（schema_version 1）の問題

v1 では `VaultContents`（全ラベル・全エントリ）を単一の AES-256-GCM ブロックとして暗号化している。アンロックすると全エントリの秘匿値（パスワード、カード番号、秘密鍵等）が一括で復号され、ロックするまでメモリに常駐する。

`SecretString`（`Zeroizing<String>`）によりロック時のゼロ化は行っているが、以下のリスクは残る。

- アンロック中は、ユーザーが一度も開いていないエントリの秘匿値まで平文でメモリに存在する
- クラッシュダンプ・スワップ・zeroize の漏れたコピー（serde の中間バッファ、FFI 境界でのコピー、WASM リニアメモリ、JS ヒープ）に、全エントリの平文が残る可能性がある
- 同期のたびにリモート側の vault も全件復号している

v1 で一括暗号化を採用したのはエントリの検索機能のためだったが、検索対象のフィールドを非秘匿値に限定し、それをメモリ上に平文で常駐させることで同様の機能を維持した上でセキュリティを向上させる。

### 1-2. 目的

- 秘匿値は **必要になったときに、必要なエントリの分だけ** 復号する
- 同期（マージ）処理では秘匿値を一切復号しない
- 秘匿値かどうかの区分をデータとして持たせ、UI 上でも区別できるようにする

### 1-3. 脅威モデル上の位置付け

| 防げるもの | 防げないもの |
|---|---|
| アンロック中に、未使用エントリの秘匿値がメモリ上の残留物（ダンプ・スワップ・コピー漏れ）として流出すること | アンロック中にプロセスのメモリを自由に読める攻撃者（DEK・サブ鍵がメモリにあるため、全件を復号できる） |
| ストレージに書き込める攻撃者による、エントリ間の秘匿値の入れ替え・エントリ単位のロールバック（AAD で検出） | vault.json 全体を過去の版に差し戻すロールバック（サーバレス設計の限界。v1 と同じ） |
| | 非秘匿値（エントリ名・URL・username 等）がアンロック中にメモリへ常駐すること（意図的なトレードオフ） |

## 2. 設計方針

- **単一ファイルを維持する**: S3 の Conditional Write（If-Match）は 1 オブジェクト = 1 ETag が前提で、複数ファイルにまたがる更新はアトミックにできない。このため vault.json 単一ファイルの中で、index ブロックとエントリごとの secret ブロックに分ける
- **index / secret の二層構造**
  - **index**: 全ラベルと全エントリの非秘匿値をまとめた 1 つの暗号化ブロック。アンロック時に復号してメモリに常駐させ、検索・一覧表示・オートフィル候補の判定に使う
  - **secret**: エントリごとの暗号化ブロック。必要なときだけ復号し、使い終わったらゼロ化する
- **index にあるものはすべて検索対象とし、検索対象外のものはすべて秘匿値として secret に置く**。検索対象かどうかと秘匿値かどうかを一致させ、区分を 1 つにする
- **秘匿値は保存先の区分であり、マスク表示とは別に扱う**: 本書の「秘匿値」は「secret に置き、必要なときだけ復号する値」を指す。UI でマスク表示するかどうかとは別に決める（10章）。例えば `notes` は秘匿値として secret に置くが、マスク表示はしない
- **区分はコードではなくデータに持たせる**: どのフィールドが秘匿値かは、書き込むクライアントが決めてデータに記録する。読むクライアントはデータの配置に従うだけにする。これにより、知らないエントリタイプも正しく表示・検索・マージできる
- **変更があった secret だけを再暗号化する**: 変更のない secret ブロックは、暗号文のまま使い回す

## 3. データ構造

### 3-1. トップレベル（VaultFile v2）

```jsonc
{
  "schema_version": 2,
  "meta": { /* VaultMeta（平文）。v1 と同一 */ },
  "index": "base64(nonce[24] | ciphertext | tag[16])",
  "secrets": {
    "<entry_id>": "base64(nonce[24] | ciphertext | tag[16])"
  }
}
```

- `meta` は v1 と同一（`encrypted_dek_master` / `encrypted_dek_recovery` / `argon2_params` 等）。DEK のラップ方式（AES-256-GCM）も変更しない
- `secrets` のキーは entry_id。purged（完全削除）エントリは secret を持たない

### 3-2. index の平文（VaultIndex）

```jsonc
{
  "labels": {
    "<label_id>": { "name": "Work", "created_at": 0, "deleted_at": null }
  },
  "entries": {
    "<entry_id>": {
      "type": "login",                 // String（未知タイプ対応）
      "name": "GitHub",
      "created_at": 0,
      "updated_at": 0,
      "deleted_at": null,
      "purged_at": null,
      "is_favorite": false,
      "label_ids": ["<label_id>"],
      "public_fields": {               // typed_value の非秘匿フィールド
        "url": "https://github.com",
        "username": "user@example.com"
      },
      "custom_fields": [               // 全カスタムフィールドのメタデータ（順序を保持）
        {
          "id": "<field_id>",
          "name": "Recovery email",
          "field_type": "email",       // String（未知タイプ対応）
          "secret": false,
          "value": "alt@example.com",  // 非秘匿の値。secret == true の場合は公開部のみ（後述）
          "autofill_selector": { /* optional。v1 と同一 */ }
        },
        {
          "id": "<field_id>",
          "name": "PIN",
          "field_type": "text",
          "secret": true               // 値は secret 側の custom_fields[<field_id>] に置く
        }
      ],
      "secret_rev": "<UUID v4>"        // purged の場合は null
    }
  }
}
```

- `labels` の構造は v1 と同一
- `secret_rev` は secret ブロックの版を表すランダム値（5章で詳述）

### 3-3. secret の平文（EntrySecret）

```jsonc
{
  "fields": {                          // typed_value の秘匿フィールド
    "password": "..."
  },
  "notes": "...",                      // optional
  "custom_fields": {                   // field_id → 秘匿値
    "<field_id>": "..."
  }
}
```

- 秘匿値を持たないエントリでも secret ブロックは必ず作る（空オブジェクトを暗号化する）。データ構造の分岐をなくすためと、どのエントリが秘匿値を持つかを外部から区別できないようにするため
- 表示用の `typed_value` は `public_fields` と `fields` を合成して復元する

### 3-4. 前方互換性

- `entry_type` / `field_type` は v1 と同様に String で保存する
- 知らないエントリタイプ・フィールドタイプでも、`public_fields` と `custom_fields` が index にあるので、表示・検索ができる。secret ブロックはマージ時に暗号文のまま引き継ぐ
- 新しいクライアントが追加したフィールドを古いクライアントが書き込み時に失わないよう、`VaultFile` / `VaultIndex` の各エントリ / `EntrySecret` では、未知のフィールドを `#[serde(flatten)]` で保持してそのまま書き戻す

## 4. フィールドの振り分け

### 4-1. エントリタイプ別

| type | public_fields（index・検索対象） | fields（secret） |
|---|---|---|
| login | `url`, `username` | `password` |
| password | `username` | `password` |
| bank | `bank_name`, `branch_code`, `account_type`, `account_holder` | `account_number`, `pin` |
| credit_card | `cardholder`, `expiry` | `number`, `cvv`, `pin` |
| ssh_key | — | `private_key` |
| secure_note | — | `content` |
| software_license | — | `license_key` |
| 未知タイプ | 書き込んだクライアントの配置に従う | 同左 |

- **全タイプ共通**: `name` / `label_ids` / タイムスタンプ / `is_favorite` は index に置く。`notes` は secret に置く
- **notes を secret に置く理由**: リカバリーコードや秘密の質問の答えなどが書かれやすく、index に置くとアンロック中に平文で常駐するため。また長文になりやすく、push のたびに再暗号化する index を肥大化させるため。1Password も notes（`notesPlain`）を一覧用の overview ではなく details 側に置いている。UI ではマスク表示しない（10章）
- **username を非秘匿とする理由**: 一覧表示とオートフィル候補の表示に必要なため。アンロック中に「どのサイトにどのアカウントがあるか」がメモリに常駐することは、許容するトレードオフとする
- v1 からの挙動変更として、`notes`、`secure_note.content`、`bank.account_number`、`software_license.license_key` は**検索対象から外れる**

### 4-2. カスタムフィールド

秘匿かどうか（`secret`）は `field_type` から独立した属性として扱う。`field_type` は入力形式を表し、`secret` は保存先を表す。

| field_type | `secret` の既定値 | index の `value` | secret の `custom_fields[id]` |
|---|---|---|---|
| text / email / url / phone | false（ユーザーが true に変更可能） | 値 | — |
| password | true（変更不可） | — | 値 |
| totp | true（変更不可） | 非秘匿パラメータ（`{"period": 30}`） | otpauth URI 等の値 |
| passkey | true（変更不可） | 非秘匿部分の JSON（`rp_id`, `rp_name`, `user_handle`, `user_name`, `user_display_name`, `credential_id`） | `private_key` |
| 未知タイプ | — | 書き込んだクライアントの配置に従う | 同左 |

- フィールド名（`name`）は `secret` の値によらず index に置き、検索対象とする
- `secret == true` のフィールドでも index に `value` を持つことがある（totp / passkey）。これは「公開部」であり、秘匿値は常に secret 側にある
- **url 型**の値はオートフィル候補の `additional_urls` として使うため、`secret == false` のときだけ候補判定に使う
- **totp** の周期を公開部に持つのは、`api_list_totp_periods`（一覧画面のカウントダウン表示）で全 TOTP エントリの secret を復号しないようにするため
- **passkey** の公開部は、`find_passkey_credentials`（RP ごとの候補列挙）で秘密鍵を復号しないようにするため

### 4-3. 検索対象

index にある以下の値を検索対象とする。

- `name`
- `public_fields` の全値
- `custom_fields[].name`（全フィールド）
- `custom_fields[].value`（`secret == false` かつ field_type が tさｚext / email / url / phone のもの）

## 5. 暗号化

### 5-1. 鍵

DEK（32 バイト。v1 と同一で、リカバリーキー・マスターパスワード変更の仕組みも不変）から、HKDF-SHA256 で用途別のサブ鍵を導出する（ドメイン分離）。

```
index_key  = HKDF-SHA256(ikm = DEK, salt = なし, info = "kura/v2/index",  L = 32)
secret_key = HKDF-SHA256(ikm = DEK, salt = なし, info = "kura/v2/secret", L = 32)
```

- DEK は一様ランダムなので salt は不要
- 分離の単位は index と secret の 2 つとする。エントリごとの鍵は導出しない（エントリ間の取り違えは AAD で防げており、メモリを読める攻撃者に対しては DEK から全サブ鍵を導出できるため、効果がない）
- サブ鍵は DEK と同様にゼロ化対象とし、ロック時に破棄する
- 将来別の用途の鍵が必要になった場合は、`kura/v2/<用途>` の info 文字列を追加する

### 5-2. AEAD

- **XChaCha20-Poly1305**（RustCrypto `chacha20poly1305` crate の `XChaCha20Poly1305`）
- nonce は 24 バイトのランダム値を毎回生成する。192 bit なので、ランダム生成で衝突するおそれは事実上ない
- 形式: `base64(nonce[24] | ciphertext | tag[16])`
- AES-GCM から切り替える理由
  - 96 bit nonce のランダム生成では、1 つの鍵あたり約 2^32 回の暗号化までに抑える必要がある。nonce が衝突すると、機密性（平文の XOR が漏れる）と完全性（認証鍵が復元され、暗号文を偽造できる）の両方が壊れる
  - WASM では AES のハードウェア命令が使えない。ChaCha20 はソフトウェア実装でも高速で、定数時間で実装しやすい

### 5-3. AAD（Additional Authenticated Data）

暗号文を「どの文脈に属するか」に束縛する。AAD が暗号化時と一致しなければ復号に失敗する。

```
index  の AAD = enc("kura/v2/index")  || enc(vault_uuid)
secret の AAD = enc("kura/v2/secret") || enc(vault_uuid) || enc(entry_id) || enc(secret_rev)

enc(x) = u32_be(len(x)) || utf8(x)   // 長さプレフィックスで連結の曖昧さをなくす
```

| 攻撃（ストレージへの書き込み権限を持つ攻撃者） | 防ぎ方 |
|---|---|
| 別の vault の暗号文を持ち込む | 主に DEK の違い（vault ごとにランダム）。 |
| `secrets["A"]` と `secrets["B"]` を入れ替える | 復号時に読み出し先のキーを `entry_id` として AAD に使うので一致しない（`secret_rev`の違いでも検出されるが、`secret_rev` の一意性に依存しないために `entry_id` を含める） |
| あるエントリの secret を、同じエントリの古い版に戻す | `secret_rev`（index にある現行の値と一致しないと復号できない） |
| 2 台で同時に編集されたエントリについて、index は端末 Y の版、secret は端末 X の版と組み合わせる | `secret_rev` がランダム値なので、2 つの版で一致しない |

### 5-4. secret_rev

- UUID v4（122 bit のランダム値）
- **secret の平文が変わったときだけ**新しい値を生成し、再暗号化する
  - お気に入りの切り替え、ラベル・名前・`public_fields` の変更など、index だけの更新では `secret_rev` を変えず、secret も再暗号化しない
  - 編集画面から保存された場合は、既存の secret を復号して新しい平文と比較し、同一なら暗号文と `secret_rev` を維持する（比較用のバッファは `Zeroizing` で扱う）
- 連番カウンタを使わない理由: 同じエントリを 2 台で同時に更新すると同じ値になり、5-3 の最後の攻撃を防げないため
- `updated_at` を流用しない理由: index だけの更新でも変わるため、不要な再暗号化が起きる

### 5-5. 再暗号化の単位

| 操作 | index | secret |
|---|---|---|
| push（書き込み）のたび | 再暗号化する（ブロックは 1 つなので回数は少ない） | 変更されたエントリのみ |
| DEK のローテーション（`rotate_dek`） | 再暗号化する | 全件を再暗号化する（`secret_rev` も再生成する） |
| マスターパスワード変更 / リカバリー | 変更なし（DEK が不変のため） | 変更なし |

---

## 6. メモリ上の表現

```
UnlockedVault (v2)
├ meta: VaultMeta
├ dek: Dek                                   ゼロ化対象
├ keys: { index_key, secret_key }            ゼロ化対象
├ index: VaultIndex                          平文で常駐。ロック時にゼロ化
├ secrets: HashMap<entry_id, Vec<u8>>        暗号文のまま保持
└ etag
```

- index 由来の文字列（username・URL 等）も個人情報なので、ロック時にゼロ化する。ただし型名は秘匿値（`SecretString`）と区別できるものにする
- secret の復号は `Zeroizing` バッファに対して行い、パース結果も `SecretString` で保持する。呼び出し元が使い終わった時点でドロップされ、ゼロ化される
- `LockedVault` は `VaultFile`（v2）をそのまま保持する

---

## 7. 同期（マージ）

マージアルゴリズムの判定ロジック（`docs/sync-algorithm.md` の B / C / D ケース、tombstone、LWW、GC）は**変更しない**。変わるのは、判定の対象と secret ブロックの扱いである。

1. リモートの vault.json をダウンロードし、**index だけを復号する**（secret は復号しない）
2. ローカルの index とリモートの index で、エントリ単位・ラベル単位に既存アルゴリズムでマージする
   - C-3 / C-4（`updated_at` が同じ）の内容比較は index 行の比較で行う。`secret_rev` が異なれば内容が異なるとみなす
3. マージ結果の各エントリについて、**勝った側の secret ブロックを暗号文のまま採用する**
   - 採用した index 行の `secret_rev` が、その secret の AAD と一致することは復号時に必ず検証される。このため、マージ処理のバグで取り違えが起きても、復号失敗として検出できる
4. GC で削除されるエントリ（purge から 180 日経過）は、index 行と secret の両方を削除する
5. index を再暗号化して push する（If-Match。412 の場合は既存のリトライ処理で再ダウンロードからやり直す）

### 7-1. 異常系

- index 行に `secret_rev` があるのに `secrets` に該当ブロックがない、または復号に失敗した場合: vault 全体のエラーにはせず、**そのエントリだけを「破損」として扱う**。暗号文はそのまま保持して書き戻し、勝手に消さない
- `secrets` にあって index に行がない孤立ブロックは、書き込み時に削除する

---

## 8. エントリ操作

| 操作 | index | secret |
|---|---|---|
| 作成 | 行を追加 | 新規作成（`secret_rev` を生成） |
| 編集 | 行を更新し、`updated_at` を更新 | 平文が変わった場合のみ再暗号化（5-4） |
| お気に入り・ラベル変更 | 行を更新 | 変更なし |
| ソフト削除 / 復元 | `deleted_at` を更新 | 変更なし |
| purge | `name`・`public_fields`・`custom_fields` を空にし、`secret_rev = null` | 削除 |

---

## 9. API の変更

### 9-1. フェーズ 1（フォーマット移行と同時に行う）

既存の API の形は可能な限り維持し、各クライアントの変更を最小限にする。

| API | 変更点 |
|---|---|
| `api_list_entries` / `api_list_login_candidates` | index だけで処理する。戻り値は変更なし |
| `api_list_totp_periods` | totp フィールドの公開部（`period`）から返す。secret は復号しない |
| `find_passkey_credentials` 系 | passkey フィールドの公開部から候補を列挙する。署名時だけ secret を復号する |
| `api_get_entry` | 対象エントリの secret だけを復号して返す |
| `EntryDetail` | typed_value のうち秘匿値のキーを示す `secret_field_keys: Vec<String>` を追加する。`custom_fields` の各要素に `secret: bool` を追加する |
| `api_create_entry` / `api_update_entry` | カスタムフィールドの `secret` 属性を受け取る |
| `api_get_totp_code` / オートフィルの値取得 | 対象エントリの secret だけを復号する |

### 9-2. フェーズ 2（デスクトップ版 Slint 化 / 拡張機能のサイドバー化に合わせて行う）

- `api_get_entry` が秘匿値を返さないようにし（秘匿値の有無だけを返す）、秘匿値は `api_get_secret_field(entry_id, field_key)` で 1 フィールドずつ取得するようにする
- これにより、FFI 境界の向こう側（JS ヒープ等）に秘匿値が渡るのを、ユーザーが表示・コピーしたフィールドに限定できる

---

## 10. UI の変更

- **notes**: マスク表示せず、エントリ詳細を開いたら secret から読み込んでそのまま表示する。保存先は secret だが、表示上は通常のテキストとして扱う。フェーズ 2（9-2）以降も、詳細を開いた時点で `notes` を取得する
- **カスタムフィールド**: 「フィールド」と「秘匿フィールド」の 2 セクションに分けて表示する。作成・編集画面では、text / email / url / phone 型に「秘匿」の切り替えを設ける
- **typed_value**: `secret_field_keys` に含まれるフィールドを秘匿値として表示する（マスク表示）

対象クライアント: Android / デスクトップ（Tauri）/ ブラウザ拡張

---

## 11. v1 → v2 の移行

### 11-1. 方針

- v2 対応クライアントは、v1 のデータを受け取ったら自動的に v2 へ変換し、v2 として保存する
- v1 を読み込むコード（AES-256-GCM による一括復号と変換処理）は当面残し、すべての端末の移行が済んだ後に削除する
- 移行前のバックアップは取らない

### 11-2. 手順

1. `LockedVault::open` が `schema_version` 1 と 2 の両方を受け付けるようにする（それ以外は従来どおり拒否する）。ローカルキャッシュ（拡張機能の storage、Android・デスクトップのキャッシュ）も同じ経路で読み込む
2. アンロック時、v1 であれば一括復号し、4 章の振り分け表に従ってメモリ上で v2 の構造に変換する
   - 既知のエントリタイプ: 4-1 の表に従って振り分ける
   - 未知のエントリタイプ: typed_value 全体を secret に置く（どれが非秘匿値か判断できないため、安全側に倒す）
   - カスタムフィールド: 4-2 の既定値に従う。passkey は公開部と `private_key` に分割し、totp は値から `period` を取り出して公開部に置く。未知のフィールドタイプは secret に置く
   - notes は secret に置く
   - 各エントリの `secret_rev` を生成して暗号化する
3. 変換後、「未 push の変更あり」として扱う。アンロック直後の同期で v2 として push する
4. 同期時にリモートが v1 のままなら、リモートも同じ DEK で一括復号して v2 に変換してからマージする

### 11-3. 複数端末で同時に移行した場合

同じ v1 エントリを 2 台が別々に変換すると、`updated_at` と内容は同じで `secret_rev` だけが異なる 2 つの版ができる。マージでは C-4（`updated_at` が同じで内容が違う → リモート採用）に該当し、どちらか一方に決まる。中身は同じなので問題はない。push の競合は If-Match で検出され、既存のリトライで解消される。

### 11-4. 未対応クライアント

v2 が書き込まれた時点で、v1 しか読めないクライアントは vault を開けなくなる（`schema_version` の不一致で拒否されるため、上書き事故は起きない）。すべてのクライアント（Android / デスクトップ / ブラウザ拡張）の v2 対応版を同時にリリースする。

### 11-5. v1 読み込みコードの削除後

v1 のデータを開いた場合は「古い形式のため、v2 対応の旧バージョンで一度開いて移行してください」という明示的なエラーを出す。

---

## 12. 実装時に更新するドキュメント

- `docs/architecture.md`: 「vault.json の構造」「暗号化構造」「メモリ安全性」の各節。2026-07-09 の「エントリ単位暗号化は不採用」の記述は、本設計で見直したことを残した上で書き換える
- `docs/sync-algorithm.md`: マージの対象が index であることと、secret ブロックの扱い（7 章）
- 本ドキュメント: 実装に応じて `doc-status` を更新する

---

## 13. 実装の進め方（案）

1. vault-core: 暗号処理（HKDF・XChaCha20-Poly1305・AAD）と v2 のデータ構造、その単体テスト
2. vault-core: `UnlockedVault` を index + secrets 構造に置き換え、エントリ操作・検索・オートフィル・passkey・TOTP を対応させる
3. vault-core: 同期（7 章）。既存の B / C / D ケースのテストを v2 構造で通す
4. vault-core: v1 → v2 の移行（11 章）。v1 のフィクスチャから変換するテスト、v1 リモートと v2 ローカルのマージのテスト
5. API（フェーズ 1）と各 FFI（wasm-bridge / rust-jni / Tauri commands）の対応
6. 各クライアントの UI 対応（10 章）。Android は rust-jni の `.so` を `cargo ndk` で再ビルドする
7. ドキュメント更新（12 章）
