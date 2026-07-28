<!-- doc-status: partial -->
# ブラウザ拡張 Passkey (WebAuthn) 対応

---

# Part 1: 概要

## 1-1. 目的

ブラウザ拡張機能を、ウェブサイトが要求するWebAuthn discoverable credential（Passkey）の作成・認証に応答できる認証器（authenticator）として振る舞わせる。Passkeyは独立したエントリ種類としてではなく、**既存の`login`エントリに付随するカスタムフィールドの一種**としてvault内に保管し、S3同期の対象にする（設計理由はPart 2参照）。

**対応する機能:**

- Passkeyの新規作成（`navigator.credentials.create()`への応答）
- 保存済みPasskeyでの認証（`navigator.credentials.get()`への応答）
- `login`エントリの詳細画面でのPasskey表示・管理

**対応しない機能（スコープ外として明記）:**

- Conditional Mediation（`mediation: "conditional"`、ブラウザ組み込みのオートフィルUIとの統合）— 常にオリジナルの`navigator.credentials`にパススルーする
- 他ブラウザ/OSのプラットフォーム認証器からのPasskeyインポート
- Android/デスクトップクライアントでのPasskey対応（将来検討。本ドキュメントはブラウザ拡張のみを対象とする）

## 1-2. 前提知識

Passkeyは公開鍵暗号ベースの認証情報で、RP（Relying Party、ログイン先サイト）ごとに鍵ペアを生成し、秘密鍵は認証器側から外に出さない。認証時はRPが提示するchallengeに対して秘密鍵で署名し、RPは事前に登録済みの公開鍵で検証する。パスワードと異なり、秘密鍵自体がネットワークを流れることはない。

kuraがこの認証器の役割を担う場合、`create()`時に鍵ペアを生成してvaultに保存し、`get()`時にその秘密鍵で署名を行う。

## 1-3. なぜvault-coreに実装するか

CLAUDE.mdの既存方針:

> ネットワーク通信は環境依存なため、vault-coreには含めない（WASM/Android/デスクトップで実装要件が異なるため）

WebAuthnの鍵生成・署名処理はネットワーク通信を一切含まない純粋な暗号処理であり、既存のAES-256-GCM/Argon2と同じ「共有クレートに実装すべき暗号処理」に分類される。この分類に基づき、鍵生成・CBOR構築・署名はvault-core（Rust）に実装し、ブラウザAPI（`navigator.credentials`）の横取りやDOM/オリジンに関わる部分のみを拡張機能（TypeScript）側に置く。

---

# Part 2: データ設計

## 2-1. 設計方針：独立EntryTypeではなくCustomFieldとして扱う

### 検討の経緯

当初案では`EntryType::Passkey`という独立したエントリ種類を追加する設計を検討したが、以下の理由から**既存の`login`エントリに付随する`CustomField`（`field_type: "passkey"`）として扱う**方式に変更した。

**独立EntryType案の問題点:**

- 同一サイト・同一アカウントに対して「passwordを持つloginエントリ」と「passkeyエントリ」が別々に存在することになり、1つのアカウントの情報が2つのエントリに分裂してしまう。
- kuraには既に前例がある：TOTP（二要素認証コード）は`LoginData`のフィールドとしてではなく、**既存の`CustomField`（`field_type: "totp"`）として実装されている**（`vault-core/src/models/entry.rs`の検索除外テスト参照）。「loginエントリに付随する追加の認証要素はCustomFieldとして扱う」という設計パターンが既に確立されており、Passkeyもこのパターンに従うのが一貫性がある。
- 1Password/Bitwarden等、既存のパスワードマネージャーもPasskeyを独立アイテムではなく既存のLoginアイテムの一部として統合する方式に収斂している。

### CustomFieldの型自体は変更しない

`CustomField`（`vault-core/src/models/entry_data.rs:47-53`）:

```rust
pub struct CustomField {
    pub id: String,
    pub name: String,
    pub field_type: String,
    pub value: SecretString,
}
```

Passkeyは複数フィールド（rp_id, user_handle, credential_id, private_key等）を持つ構造化データであり、`value: SecretString`という単一文字列にそのまま収まらない。しかし、**`CustomField`のRust型自体を変更する必要はない**。

`EntryData.typed_value`が既に採用しているパターン——永続化層は常に不透明な文字列（`EntrySecretJson`）として保持し、`entry_type`に応じてアプリケーション層でJSONとしてパースする——を`CustomField.value`にも同様に適用する。`field_type == "passkey"`の場合のみ、その`SecretString`の中身をJSON文字列として解釈する、という**アプリケーション層の規約**に留める。

```
CustomField {
  id: "cf-uuid",
  name: "Passkey (MacBook Pro)",
  field_type: "passkey",
  value: "{\"rp_id\":\"github.com\",\"user_handle\":\"...\",...}"  // JSON文字列としてのSecretString
}
```

永続化層のワイヤーフォーマット（`value: string`）は一切変わらないため、これは「型変更」に該当せず、CLAUDE.mdの前方互換性ポリシー上**schema_versionのインクリメントは不要**。`EntryType` enumへの変更も不要になる（当初案からの大きな簡略化）。

## 2-2. Passkeyフィールドのデータ構造

> **実装済み**: この節の構造体・JSON変換ロジックは`vault-core/src/models/passkey_data.rs`に実装済み。

`CustomField.value`にJSON文字列として格納する構造（`PasskeyFieldData`）:

```rust
// value: SecretString の中身をこの形にJSONシリアライズ/デシリアライズする
pub struct PasskeyFieldData {
    pub rp_id: String,               // Relying Party ID（例: "github.com"）
    pub rp_name: Option<String>,     // 表示名（RPが渡す場合のみ）
    pub user_handle: String,         // RP由来の user.id（base64url、最大64byteの不透明値）
    pub user_name: String,           // user.name（メールアドレス等が多い）
    pub user_display_name: String,   // user.displayName
    pub credential_id: String,       // base64url。discoverable credentialの主キー
    pub private_key: String,         // P-256秘密鍵（32byte rawスカラー値）をbase64標準エンコード
}
```

実装場所は当初案の`src/webauthn/mod.rs`（Part 7参照）ではなく、`vault-core/src/models/passkey_data.rs`とした。理由：`models/typed_value.rs`が`LoginData`/`BankData`等の「種別ごとの複合データ構造体＋JSON変換ロジック」を`EntryData`本体とは別ファイルに切り出しているのと同じパターンであり、`CustomField`の汎用コンテナ定義（`entry_data.rs`）や鍵生成・署名処理（`webauthn/mod.rs`、未実装）とは責務が異なるため。鍵生成・署名を実装するPart 3のコードは、この構造体を`crate::models::PasskeyFieldData`として参照する形になる想定。

**`CustomFieldType` enumへの追加は現時点では見送っている**（`vault-core/src/models/entry_data.rs`の`CustomFieldType`に`Passkey`バリアントは未追加）。このenumは`api_create_entry`/`api_update_entry`での作成・編集時バリデーション専用（前方互換性ポリシー）だが、passkeyフィールドを作成する専用API（Part 3、未実装）がまだ存在しないため、バリデーション対象に加える必要がない。また、汎用の自由テキスト入力経路でpasskeyの値を人間が手打ちできてしまう状態を避ける意味もある。専用の作成APIを実装する段階で、必要に応じて追加を検討する。

`CustomField.value`全体が`SecretString`（Zeroizing）でラップされているため、このJSON文字列全体が既存の秘密値と同じメモリ安全性（ロック時ゼロ化）の恩恵を受ける。個々のフィールドをさらに`SecretString`で二重ラップする必要はない。

**あえて持たせないフィールド:**

- `public_key` — 保存不要。`create()`実行時に秘密鍵から都度導出できるため、永続化する意味がない。
- `sign_count` — 詳細は2-3節。

## 2-3. sign_countを持たせない設計判断

FIDO2/WebAuthn仕様は`signCount`の単調増加を認証器のクローン検知に使うが、kuraのモデルには持たせない。

**理由:**

1. 仕様上、`signCount = 0`は「このオーセンティケータはカウンタをサポートしない」ことを示す正当な値であり、RP側はこの値をクローン検知の対象から除外する。iCloudキーチェーン・Googleパスワードマネージャー・1Password・Bitwarden等、同期型Passkeyを提供する実装は例外なく固定0を採用している。これはkura固有の妥協ではなく、「同期型Passkey」というカテゴリ全体が持つ本質的な制約である（各デバイスが非同期にカウンタを進める以上、単調増加を維持すること自体が原理的に不可能）。
2. kuraの同期モデルはLWW + tombstone（`docs/sync-algorithm.md`）であり、`updated_at`で衝突解消する。ログインの度に`sign_count`を書き換える設計にすると、「サインインするだけでエントリの`updated_at`が更新され、複数デバイスでの同時サインインがLWW上のコンフリクトとして扱われる」という副作用が生じる。
3. 守れない保護機構を無理に実装して誤検知を生むより、そもそも実装しない方が安全。

authenticatorData構築時、signCountフィールド（4byte）には常に`0u32`をハードコードする。

**留意点:** signCount固定はvault.json自体の漏洩（DEK漏洩）に対しては無力である。ただしこれはPasskey実装がソフトウェアベースである以上、signCountの値に関わらず秘密鍵自体が漏れる話であり、signCountというメカニズムがそもそも対処できる脅威モデルの範囲外。

## 2-4. 検索・一覧表示への対応

`EntryFilter::matches`の`custom_fields`検索ロジック（`entry.rs:205-221`）は、`field_type`が`"text"|"email"|"url"|"phone"`の場合のみ値を検索対象に含め、それ以外（`password`, `totp`等）は暗黙的に除外する設計に既になっている。`"passkey"`もこのデフォルトの除外パスに自然に該当するため、**検索除外ロジックへのコード変更は不要**。

一覧表示（`EntryCard`等）では、`login`エントリの`custom_fields`に`field_type == "passkey"`が1件以上含まれる場合、バッジやアイコンでPasskey対応であることを示す（詳細はPart 4）。

---

# Part 3: アーキテクチャ

> **実装済み**（Chrome/Firefox both）。以下、実装時に当初案から変わった点のみ注記する。詳細ファイル一覧はPart 7参照。

## 3-1. 全体構成

`navigator.credentials.create()`/`get()`はページのMAIN world realmでのみ有効であり、既存のContent Script（`src/content/main.ts`、ISOLATED world）からは呼び出しを横取りできない。そのため、新たにMAIN world注入スクリプトを追加し、3段ブリッジ構成にする。

```
Webページ (MAIN world)
  │ navigator.credentials.create() / get()
  ▼
webauthn-main.ts (MAIN world 注入スクリプト)
  │ window.postMessage
  ▼
webauthn-bridge.ts (ISOLATED world Content Script)
  │ chrome.runtime.sendMessage
  ▼
background/webauthn.ts (Service Worker)
  │ wasm-bindgen
  ▼
vault-core (Rust: 鍵生成・CBOR構築・ECDSA署名、loginエントリのcustom_fields操作)
```

既存のオートフィル用Content Script（`src/content/main.ts`）とは別ファイルとして追加し、既存のフォーム検出ロジックには一切手を入れない。

## 3-2. Manifest変更

```jsonc
{
  "content_scripts": [
    // 既存のオートフィル用エントリ（変更なし）
    { "matches": ["<all_urls>"], "js": ["src/content/main.ts"], "run_at": "document_idle", "all_frames": true },

    // 追加: ISOLATED world側ブリッジ（crx管理下のTS、通常のビルドパイプライン）
    { "matches": ["<all_urls>"], "js": ["src/content/webauthn-bridge.ts"], "run_at": "document_start", "all_frames": true },

    // 追加: MAIN world注入スクリプト。ソースのmanifest.jsonには書かず、
    // ビルド後処理（vite-inject-webauthn-main.ts）でdist/manifest.jsonに注入する（後述）
    { "matches": ["<all_urls>"], "js": ["webauthn-main-injected.js"], "run_at": "document_start", "all_frames": true, "world": "MAIN" }
  ]
}
```

`document_start`が必須（ページの他スクリプトが`navigator.credentials.create/get`の参照をキャッシュする前に上書きする必要があるため）。

**MAIN world注入スクリプトは`src/content/`のTypeScriptモジュールではなく、`extension/public/webauthn-main-injected.js`という依存なしの単一プレーンJSファイルとして実装し、ソースの`manifest.json`/`manifest.firefox.json`には一切書かず、Vite Pluginによるビルド後処理（`extension/vite-inject-webauthn-main.ts`、`closeBundle`フックで`dist/manifest.json`に直接エントリを追記）で登録する。**

**理由（実装時に判明した問題）**: `@crxjs/vite-plugin`は`content_scripts`に列挙された全エントリを、実体を動的`import()`で読み込む薄いローダースクリプトに置き換える（HMR対応のため）。ISOLATED world側スクリプト（`webauthn-bridge.ts`）はこの方式で問題なく動作するが、MAIN worldスクリプトはページ自身のスクリプト読み込みコンテキストで実行されるため、少なくともFirefox 153ではローダーの相対import解決がページ自身のオリジンに対して行われ、拡張機能側の実体を読み込めずに（コンソールエラーも出さず）静かに失敗した（Chromeでは問題なく動作した）。`public/`配下の単一ファイル（importなし、動的import不要）に切り出し、ビルド後処理でmanifestに直接注入することで、ローダー機構自体を経由しないようにし、Chrome/Firefox間の差異を解消した。このファイルは`src/shared/webauthn-codec.ts`/`webauthn-messages.ts`のロジックを意図的に複製している（importできないため）。

MAIN world scriptは`chrome.*` APIに一切アクセスできないため、ISOLATED world側とのpostMessage仲介が必須になる。

## 3-3. 秘密鍵はFFI境界を越えない

MAIN world・ISOLATED world・Service Workerのいずれのメモリにも秘密鍵の生バイトが乗ることはない。境界を越えるのはattestationObject/signatureという、署名結果として公開して構わないデータのみ。署名処理はvault-core内で完結する。

## 3-4. CBOR/attestationObject構築はRust側

attestationObject（`{fmt: "none", attStmt: {}, authData: <bytes>}`）とauthenticatorData（`rpIdHash(32B) | flags(1B) | signCount(4B) | [attestedCredentialData]`）はバイト単位の正確性が要求されるフォーマットであり、署名対象（`authenticatorData || clientDataHash`）の構築と署名は不可分。TS側でバイト列を組み立ててRust側に渡す設計は、バイトオーダー等のバグがJS/Rust境界を跨いで混入しやすくテスト容易性も落ちるため避け、Rust側に一本化する。

**責務分割:**

- **TypeScript（Service Worker）**: `clientDataJSON`の組み立てのみ（`{type, challenge, origin, crossOrigin}`）。Service Worker自体はDOMを持たないため、`origin`はISOLATED world（`webauthn-bridge.ts`）が自身の`window.location.origin`から読み取り、メッセージ経由でService Workerに渡した値を使う。
- **Rust（vault-core）**: `clientDataJSON`のSHA-256ハッシュ計算、authenticatorData/attestationObjectのCBOR構築、COSE_Key構築、ECDSA署名。対象`login`エントリの`custom_fields`への読み書きは`vault-core/src/vault/webauthn.rs`が担当し、暗号処理本体（`vault-core/src/webauthn/mod.rs`）とは責務を分離した（当初案からの変更、Part 7参照）。

## 3-5. ドメイン検証

既存のパターンDBの`strict_subdomain`（`docs/extension-pattern-db.md`）は再利用しない。`strict_subdomain`はオートフィル候補を絞り込むためのユーザー向けオプトインフラグであり、WebAuthnのrp_idスコープはサイト自身が作成時に指定する値によって仕様上厳密に決まるため、ユーザー設定可能なフラグの入る余地がない。

必要なのは「rp.idが現在のオリジンのregistrable domain suffixとして妥当か」というセキュリティ上必須の検証であり、既存の`extension/src/shared/etld.ts`（eTLD+1計算のためのPSLルックアップユーティリティ）のみを再利用する。パターンDB（`extension/patterns/sites/*.json`）自体は一切関与しない。

**検証の多段防御:**

1. ISOLATED world content script（`webauthn-bridge.ts`）が、自身の（ページに汚染されていない）`window.location`から独立してorigin/hostnameを読み取る。MAIN world側から転送された値は信用の起点にしない（既存のオートフィル設計 `docs/extension-autofill.md` 2-3-2「ISOLATED worldは常にネイティブ状態」の応用）。
2. Service Workerが、ISOLATED由来のoriginと、ページが要求した`rp.id`を突き合わせ、`etld.ts`のsuffix判定ロジックで検証してから初めてvault-core問い合わせ・UI表示に進む。不一致は即座にreject。

## 3-6. メッセージフロー

### `navigator.credentials.get()`（認証）

```
Webページ (page realm)
  │ navigator.credentials.get({ publicKey: {...} })
  ▼
[MAIN world] webauthn-main.ts
  │ mediation === 'conditional' ? → 元関数へパススルー（非対応スコープ）
  │ requestId発行、独自タイムアウトタイマー開始（90秒）
  │ postMessage({ source: 'kura-webauthn-main', requestId, kind: 'get', ... }, origin)
  ▼
[ISOLATED world] webauthn-bridge.ts
  │ 自前のwindow.locationからorigin/hostnameを独立取得
  │ chrome.runtime.sendMessage({ type: 'WEBAUTHN_GET_REQUEST', ..., origin, hostname })
  ▼
Service Worker background/webauthn.ts
  │ 設定トグルOFF・vaultロック中は候補探索自体を行わずpassthrough
  │ etld.ts (isValidRpId) でrp.id vs origin のsuffix検証 → 不一致ならreject
  │ vault.api_webauthn_find_credentials(rp_id, allowCredentials)
  │   → entry_type=="login"のエントリを走査し、custom_fields内のfield_type=="passkey"を
  │     collectする（非機密フィールドのみの候補、Part 2-4参照）
  │
  ├─ 候補0件 ────────────────────────────► status: 'passthrough' を返す
  │                                          MAIN worldが元のnavigator.credentials.getを呼ぶ
  │                                          （ネイティブ認証器/他拡張機能に処理を譲る。UIは開かない）
  │
  └─ 候補1件以上
        │ chrome.windows.create（儀式ウィンドウ、webauthn.html?kind=get&requestId=...）を開く
        │ 儀式ウィンドウはWEBAUTHN_RITUAL_GET_CONTEXTで候補一覧を取得し表示
        │ ユーザーがカードを選択（カードは「loginエントリ名 + user表示名」で表示）
        │ WEBAUTHN_RITUAL_DECISIONでcredentialIdを送信、儀式ウィンドウclose
        │ vault.api_webauthn_get_assertion(entry_id, custom_field_id, client_data_json)
        │   [秘密鍵はvault-core内のみで完結]
        ▼
      status: 'ok', { credentialId, authenticatorData, signature, userHandle, clientDataJSON }（base64url）
        ▼
      [ISOLATED world] → [MAIN world] へpostMessageで中継
        ▼
      [MAIN world] PublicKeyCredential形状のオブジェクトを構築しPromiseをresolve
        ▼
      Webページ側のget()呼び出しがresolveされる
```

儀式ウィンドウとService Workerの間は、「専用port維持」ではなく、儀式ウィンドウ自身が`chrome.runtime.sendMessage`でService Workerに問い合わせる方式にした（当初案からの簡略化）。Service Workerが儀式ウィンドウとの通信・ページからのリクエストへの応答を両方抱えている間は生きたままになるため、追加のport維持は行っていない。ウィンドウが閉じられた場合は`chrome.windows.onRemoved`で検知しcancelled扱いにする。

### `navigator.credentials.create()`（登録）

基本構造は同じだが、以下が異なる:

- Service Workerは`excludeCredentials`と既存`credential_id`の一致をUIを開く**前**にチェックし、一致すれば即座に（UIを一切開かず）`InvalidStateError`でreject。**ただし、これはリクエスト受信時点でvaultがアンロック済みの場合に限る**（後述）。
- 儀式ウィンドウ（`kind=create`）は、`api_list_login_candidates`（オートフィルと同じeTLD+1マッチング）で見つかった既存`login`エントリの一覧 + 「新しいアイテムを作成」を選択肢として表示し、ユーザーが紐付け先を選ぶ（3-7節参照）。

**vaultがロック中に`create()`が呼ばれた場合**（登録ボタンの明示的クリックが前提のため、GETの「候補0件ならUIを開かずpassthrough」とは異なり、ブラウザネイティブ処理へ丸投げしない）:

1. `excludeCredentials`チェック・`matchingEntries`計算は復号が必要なため実行できない。そこでService Workerは`{kind:'locked'}` contextで儀式ウィンドウを先に開く（同一ウィンドウを使い回す。タイムアウトは入力時間確保のため180秒に延長）。
2. 儀式ウィンドウは`UnlockRitual`画面を表示し、`UNLOCK`メッセージ（メインpopupの「アンロック」画面と共通のメッセージ型）を送ってvaultをアンロックさせる。
3. アンロック成功時、Service Worker側（`resumeLockedWebauthnRituals`）が`excludeCredentials`チェック・`matchingEntries`計算をこの時点で初めて実行し、儀式windowのcontextを`{kind:'create', ...}`（または一致検出時は`{kind:'error', message}`）に差し替える。タイムアウトも通常の85秒にリセットする。儀式ウィンドウは`WEBAUTHN_RITUAL_CONTEXT_UPDATED`通知（または自分自身のアンロック成功レスポンス）を契機にcontextを再取得し、確認画面へ自動遷移する。
4. 以降は通常のcreate確認フローと同じ。ユーザーがどの経路（この儀式ウィンドウ内、またはメインpopup）でアンロックしても、儀式は継続される。

## 3-7. 新規Passkey作成時の紐付け先エントリ決定

`create()`が呼ばれた際、Service Workerは`rp_id`（eTLD+1）に一致する既存の`login`エントリを検索し、以下のいずれかに分岐する。

| 状況 | 挙動 |
|---|---|
| 一致する`login`エントリが1件 | そのエントリに`passkey`カスタムフィールドを追加することをデフォルト提案（確認ダイアログで表示）。ユーザーは「新規エントリとして作成」も選択可能 |
| 一致する`login`エントリが複数件 | どのエントリに紐付けるか、または新規作成するかをユーザーに選択させる |
| 一致なし | 新規`login`エントリを作成（`name`は`rp_name`または`rp_id`、`url`は`rp_id`、`username`は`user_name`、`password`は空文字）した上で`passkey`カスタムフィールドを追加 |

この判定は既存のオートフィルのURL/ドメインマッチング（`docs/extension-autofill.md` 1-3）と同じeTLD+1ベースの照合を使う。

---

# Part 4: UI設計

> **実装済み（一部トリム）**: 4-1〜4-3は実装済み。4-4は「種別選択の制限」「表示の読み取り専用化」のみ実装し、「エントリ詳細から能動的にPasskeyを作成するボタン」は未実装（Passkeyの作成は`navigator.credentials.create()`の横取り経由のみ）。4-5はエントリ詳細画面の読み取り専用表示のみ実装し、エントリ一覧のバッジ表示は未実装。デスクトップ・Androidは今回のスコープ外のまま。

## 4-1. 儀式ウィンドウ

Passkeyの作成確認・複数候補選択は、既存popup（`action.default_popup`）とは別に`chrome.windows.create({ type: 'popup', ... })`で独立ウィンドウを開く方式を採る。

**理由:**

- Service Worker発のバックグラウンドイベント（ページの`create()/get()`呼び出し）から任意のタイミングでUIを開く必要があるが、`chrome.action.openPopup()`はユーザー操作のコールスタック直下でしか呼べない制約があり、Firefoxでの対応状況もまちまち。`chrome.windows.create`はジェスチャー起点を問わずChrome/Firefox双方で安定して使える。
- 既存の`offscreen.html`が「popup本体とは別のHTMLエントリをVite側で持つ」前例になっており、儀式用の新規HTMLエントリ追加は低リスクなビルド変更として扱える。

## 4-2. コンポーネント方針

CLAUDE.mdの制約（拡張ポップアップのisolated DOMではRadix UIのPortal系コンポーネント`Select`/`DropdownMenu`が動作しない）はそのまま踏襲するが、今回の機能ではこの制約はほぼ問題にならない。

- 儀式UIは「候補一覧」「紐付け先エントリ一覧」を含めて**フルウィンドウ内のカード列挙**として表示するため、アンカー付きドロップダウン（`Select`/`DropdownMenu`）は不要。
- 確認モーダルにはRadix `Dialog`を使用する（既存の`EntryTypeSelectDialog.tsx`で使用実績があり、拡張ポップアップ内で正常動作することを確認済み）。

## 4-3. ユーザー操作の必須化

作成確認・候補選択・紐付け先選択のいずれも、明示的なユーザークリックによる確定操作を必須とする。これは既存のオートフィル方針（`docs/extension-autofill.md` 1-1「自動サブミット・自動保存の提案はしない」）と一貫した、「ユーザーの意思による確定操作のみ許可する」という思想を踏襲するもの。

## 4-4. カスタムフィールド追加UIの特殊化

通常のカスタムフィールドはユーザーが種別を選び、自由にテキスト値を入力する（`docs/architecture.md`「既知タイプのカスタムフィールド編集: ○ タイプに依存しない」）。`passkey`はこの一般フローに次の特殊対応を加える。

- **種別選択の制限（実装済み）**: `EntryForm.tsx`の「カスタムフィールド追加」種別一覧（`CUSTOM_FIELD_TYPE_ICONS`）に`passkey`を含めていないため、どのエントリタイプであっても手動でpasskeyフィールドを新規作成する経路自体が存在しない。当初案の「`entry_type == "login"`のみ選択肢に出す」という条件分岐は、選択肢自体を出さないことでより単純に実現している。
- **入力フローの分岐（未実装）**: 「このサイトの新しいPasskeyを作成」ボタンをエントリ詳細/編集画面に置く案は見送った。Passkeyの作成は`navigator.credentials.create()`の横取り（Part 3）経由のみで、拡張のUIから能動的に開始する手段はない。
- **表示の読み取り専用化（実装済み）**: 既存の`passkey`カスタムフィールドは、`EntryForm.tsx`の「値」欄をテキスト入力の代わりに読み取り専用サマリ（rp_id等をJSONから抽出して表示）にし、`EntryList.tsx`の詳細表示では専用コンポーネント`PasskeyCustomFieldDisplay.tsx`（rp_name/rp_id、user_nameのみ表示、削除は既存のカスタムフィールド削除ボタンをそのまま使用）を使う。「既知タイプは全フィールド編集可能」という前提を初めて破る例外。

## 4-5. エントリ一覧・詳細画面への表示対応

新規`EntryType`を追加しないため、`EntryTypeIcon.tsx`等の既存のエントリ種別表示コンポーネントへの変更は不要。

- `login`エントリの詳細画面（実装済み）: `custom_fields`内の`passkey`エントリを`PasskeyCustomFieldDisplay.tsx`で表示する（4-4節）。
- `EntryCard.tsx`/`EntryListPanel.tsx`でのバッジ表示（未実装）: 一覧表示用の`EntryRow`/`EntrySummary`（Rust側DTO）が`custom_fields`を含まない設計のため、バッジを付けるには一覧取得APIの拡張が必要になり、今回のスコープでは見送った。

---

# Part 5: セキュリティ上の注意点

1. **秘密鍵はFFI境界を一切越えない**（3-3節参照）。越境するのはattestationObject/signatureという公開して構わない署名結果のみ。
2. **rp_id/origin検証の多段防御**（3-5節参照）。ページやMAIN world側が主張する値を最終判断には使わない。
3. **既存クレデンシャルの存在有無を推測させるサイドチャネルの防止**: `get()`で候補0件の場合、または`create()`で`excludeCredentials`が一致した場合は、儀式ウィンドウを一切開かない（開いて即閉じることも含む）。ウィンドウの生成・フォーカス移動はページ側から`visibilitychange`/`blur`イベント等で観測されうるため、それ自体が「このユーザーはこのサイトのPasskeyを持っているか」を推測させるサイドチャネルになりうる。UIを見せるかどうかの分岐は、儀式ウィンドウを開く**前**に完全に確定させる。
4. **エラーメッセージの無害化**: vault-core由来の内部エラー文字列をページJSに直接渡さない。ページに返す拒否理由は必ずWebAuthn仕様が定める汎用的な`DOMException`（`NotAllowedError`等）に正規化する。
5. **タイムアウト/ウィンドウクローズの必達処理**: 横取りによりブラウザネイティブの`options.publicKey.timeout`強制が働かなくなるため、MAIN world側で独自タイムアウトを実装する。儀式ウィンドウが閉じられた場合・Service Worker再起動でport切断された場合を含め、必ずページのPromiseを解決（`NotAllowedError`相当でreject）させ、ハングしたままにしない。
6. **常時ユーザー操作を必須にする**（4-3節参照）。
7. **`isUserVerifyingPlatformAuthenticatorAvailable()`を`true`に上書きする判断とトレードオフ**: 上書きしないと、プラットフォーム認証器を持たない環境（Linuxデスクトップ等）で多くのサイトが「Passkeyでサインイン」ボタン自体を出さず、kuraのPasskey機能が実質使えなくなる。したがって`true`固定を推奨するが、これは「kuraが常にPasskey対応を主張する」ことを意味し、実際にはvaultがロック中・該当Passkeyを持っていない場合は上記3項のパススルー/静音拒否と組み合わせて初めて安全に成立する。

---

# Part 6: 既存設計方針との整合性

| 既存方針 | 整合性 |
|---|---|
| `docs/architecture.md`前方互換性ポリシー（フィールド追加のみ許可、型変更は不可） | 準拠。`EntryType`は無変更、`CustomField.value`のワイヤーフォーマット（`string`）も無変更。schema_versionのインクリメント不要 |
| TOTPの既存実装パターン | 準拠・踏襲。「loginエントリに付随する追加の認証要素はCustomFieldとして扱う」という既存パターンをそのまま適用 |
| field-classifier保守的設計・パターンDB（`docs/extension-pattern-db.md`） | 無関係・不変更。PasskeyはDOMフォーム検出を一切経由しない |
| パターンDBの`strict_subdomain` | 再利用しない（3-5節）。WebAuthnのrp_idスコープはサイト自身の仕様準拠事項であり、ユーザー設定可能なフラグの入る余地がない |
| `docs/sync-algorithm.md`（LWW + tombstone） | Passkeyを含む`login`エントリも他エントリと同一のLWWフローに乗る。`sign_count`を持たせない設計により、ログインの度に`updated_at`が変化して同期コンフリクトが増える懸念は構造的に発生しない |
| メモリ安全性（`SecretString`/zeroize） | `CustomField.value`全体が既存の`SecretString`でラップされ、既存慣習の範囲内でPasskey秘密鍵も保護される |
| CLAUDE.md UIコンポーネント制約（Radix Portal不可） | Dialogは使用可。フルウィンドウのリスト表示を採用するためSelect/DropdownMenuの必要自体がない |
| CLAUDE.md「vault-coreはネットワーク通信を含まない」 | 鍵生成・署名は純粋暗号処理でありネットワーク非依存。vault-core本体に置く判断と矛盾しない |
| オートフィルの「自動サブミット・自動保存をしない」思想 | Passkey儀式も常に明示的なユーザークリックを必須とし、思想を継承 |
| 「既知タイプのカスタムフィールドは全フィールド編集可能」という既存前提 | `passkey`カスタムフィールドはこの前提を初めて破る例外として明記（4-4節） |

---

# Part 7: 新規依存・新規ファイル

## 7-1. 新規Rust依存クレート

| クレート | 用途 | 選定理由 |
|---|---|---|
| `p256` | P-256鍵生成、ECDSA署名（ES256）、DER署名エンコード | RustCryptoファミリーで既存の`aes-gcm`/`argon2`と系統が同じ。WASM対応実績あり。ES256はWebAuthn仕様上のmandatory-1アルゴリズムでありこれ1つで十分 |
| `ciborium` | attestationObject/COSE_KeyのCBORエンコード | 純Rust実装でwasm32ターゲットでの実績あり。正準エンコーディングを手書きするより既存実装を使う方がブラウザ側との相互運用性リスクを下げられる |

既存の`sha2`（ハッシュ）、`rand`+`getrandom`（jsフィーチャ、鍵・credential ID用の乱数）、`base64`はそのまま流用する。

## 7-2. 新規ファイル一覧（実装済み）

### vault-core

| ファイル | 内容 |
|---|---|
| `src/models/passkey_data.rs` | `PasskeyFieldData`構造体とJSON変換（前回タスクで実装済み） |
| `src/webauthn/mod.rs` | 鍵生成、authenticatorData/attestationObject構築、COSE_Key構築、ECDSA署名、固定AAGUID定数（`crypto/`と並列のトップレベルモジュール） |
| `src/vault/webauthn.rs` | `UnlockedVault`への`find_passkey_credentials`/`create_passkey_credential`/`get_passkey_assertion`。`custom_fields`の読み書きはここに集約し、`src/webauthn/mod.rs`（暗号処理本体）とは責務を分離（当初案からの変更） |
| `src/api/webauthn.rs` | `VaultManager`への`api_webauthn_find_credentials`/`api_webauthn_create_credential`/`api_webauthn_get_assertion`（`Result<T, String>`を返すAPI層の既存慣習に従う） |

`src/error.rs`に`VaultError::WebAuthnError(String)`を追加。`src/models/entry.rs`（`EntryType`追加）・`src/models/typed_value.rs`（`TypedValue::Passkey`追加）・既存の`CustomField`検索除外ロジックへの変更は不要だった（Part 2-4参照）。バイト単位のゴールデンベクタ・署名検証テストは独立した`tests/webauthn_test.rs`ではなく、`src/webauthn/mod.rs`/`src/vault/webauthn.rs`内の`#[cfg(test)] mod tests`に実装した（このリポジトリの既存モジュールと同じテスト配置パターン）。

### extension/wasm-bridge

`src/lib.rs`に`api_webauthn_find_credentials`/`api_webauthn_create_credential`/`api_webauthn_get_assertion`の3つの`#[wasm_bindgen]`ラッパーを追加。

### extension（TypeScript）

| ファイル | 内容 |
|---|---|
| `public/webauthn-main-injected.js` | MAIN world、`navigator.credentials.create/get`のオーバーライド、90秒タイムアウト管理。crxのビルドパイプラインを経由しない単一プレーンJSファイル（3-2節参照） |
| `vite-inject-webauthn-main.ts` | 上記ファイルのcontent_scripts宣言をビルド後に`dist/manifest.json`へ注入するVite Plugin（`vite.config.ts`/`vite.config.firefox.ts`両方から使用） |
| `src/content/webauthn-bridge.ts` | ISOLATED world、postMessage⇄`chrome.runtime.sendMessage`中継、独立したorigin/hostname取得 |
| `src/background/webauthn.ts` | `WEBAUTHN_*`メッセージハンドラ、rp_id検証、紐付け先エントリ決定、儀式ウィンドウ管理（`chrome.windows.create`/`onRemoved`） |
| `src/shared/webauthn-messages.ts` | MAIN↔ISOLATED↔Service Worker↔儀式ウィンドウ間のメッセージ型定義一式 |
| `src/shared/webauthn-codec.ts` | BufferSource⇄base64url変換ヘルパー |
| `src/popup/webauthn.html` + `webauthn-main.tsx` | 儀式ウィンドウのエントリポイント（`offscreen.html`と同じVite別エントリのパターン） |
| `src/popup/screens/webauthn/WebauthnRitualApp.tsx` | requestId/kindをURLクエリから読み、コンテキスト取得→`CreateConfirm`/`SelectCredential`への振り分けを行うルート |
| `src/popup/screens/webauthn/CreateConfirm.tsx` | 新規作成確認画面（紐付け先エントリ選択、またはRadioボタンでの「新しいアイテムを作成」選択） |
| `src/popup/screens/webauthn/SelectCredential.tsx` | 複数候補選択画面 |
| `src/popup/components/entries/PasskeyCustomFieldDisplay.tsx` | エントリ詳細でのPasskey読み取り専用表示（`TotpCustomFieldDisplay.tsx`と並列） |

既存ファイルへの変更: `manifest.json`/`manifest.firefox.json`（content_scripts追加、Firefox `strict_min_version`を128に引き上げ）、`vite.config.ts`/`vite.config.firefox.ts`（`webauthn.html`エントリ追加）、`src/background/index.ts`（`WEBAUTHN_`プレフィックス委譲、`WasmApi`インターフェース拡張、`initWebauthn`呼び出し）、`src/shared/etld.ts`（`isValidRpId`追加）、`src/shared/types.ts`（`CustomFieldType`に`'passkey'`追加、`AppSettings`に`passkeyEnabled`追加）、`src/popup/components/entries/EntryForm.tsx`（`passkey`の種別選択除外・読み取り専用表示、4-4節）、`src/popup/screens/entries/EntryList.tsx`（`PasskeyCustomFieldDisplay`の組み込み）、`src/popup/screens/settings/Settings.tsx`（「パスキー対応（ベータ）」トグル）、i18nロケールファイル（`en.json`/`ja.json`）、`test-pages/pages/webauthn.html`（手動テストページ）。

`EntryCard.tsx`/`EntryListPanel.tsx`（一覧でのバッジ表示）、`src/shared/messages.ts`への`WEBAUTHN_*`型追加は見送った（4-5節、7-2節参照）。

---

# Part 8: 段階的リリース

| フェーズ | 範囲 | 状態 |
|---|---|---|
| **Phase 0（スパイク・検証）** | (a) manifest宣言`world:MAIN`のビルド反映確認、(b) 実サイトでの動作確認 | (a) 確認済み（ビルド成果物の`dist/manifest.json`に`world: "MAIN"`が正しく出力される）。(b) 未実施 — 未パッケージ拡張機能を実ブラウザに読み込む自動化手段がこの開発環境になく、**ユーザーによる手動確認待ち**（`extension/test-pages/pages/webauthn.html`を使用） |
| **Phase 1** | vault-coreの暗号処理+`login`エントリへの`passkey`カスタムフィールド読み書きAPI | **実装済み**。`src/webauthn/mod.rs`、`src/vault/webauthn.rs`、`src/api/webauthn.rs`。Rustユニットテスト（バイト単位ゴールデンベクタ・署名検証・vault層の一連の動作）全て通過 |
| **Phase 2** | wasm-bridgeラッパー、MAIN/ISOLATED注入、Service Workerのメッセージハンドリングと儀式ウィンドウ管理、儀式UI（作成確認・紐付け先選択・候補選択）。設定画面に「Passkey対応（ベータ）」トグルを追加しデフォルトOFF | **実装済み**（Chrome/Firefox両方のビルド確認・型チェック・lint・vitest通過）。実サイトでのE2E動作確認はPhase 0と同様ユーザー確認待ち |
| **Phase 3** | `login`エントリ詳細画面でのPasskey表示対応、カスタムフィールド追加UIの種別制限対応 | **部分的に実装**。エントリ詳細の読み取り専用表示・種別選択からの除外は実装済み。エントリ一覧でのバッジ表示、エントリ詳細から能動的にPasskeyを作成するボタンは未実装（4-4, 4-5節参照） |
| **Phase 4（将来・任意・スコープ外）** | Conditional Mediation対応、Bitwarden JSON export/importでのfido2Credentials互換、デスクトップ/Android側のUI対応、エントリ一覧のバッジ表示 | 本ドキュメントでは設計しない |

`mediation: "conditional"`が指定されたリクエストは常にオリジナル関数へパススルーする（Conditional UIはPhase 4の明示的な非対応スコープ、実装済み）。
