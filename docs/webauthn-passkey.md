<!-- doc-status: implemented -->
# ブラウザ拡張 Passkey (WebAuthn) 対応

# Part 1: 概要

## 1-1. 目的

ブラウザ拡張機能を、ウェブサイトが要求するWebAuthn discoverable credential（Passkey）の作成・認証に応答できる認証器（authenticator）として振る舞わせる。Passkeyは独立したエントリ種類としてではなく、**既存の`login`エントリに付随するカスタムフィールドの一種**としてvault内に保管し、S3同期の対象にする。

**対応する機能:**

- Passkeyの新規作成（`navigator.credentials.create()`への応答、ブラウザ拡張のみ）
- 保存済みPasskeyでの認証（`navigator.credentials.get()`への応答、ブラウザ拡張のみ）
- `login`エントリの詳細画面でのPasskey表示（読み取り専用）— **ブラウザ拡張・Android・デスクトップの全クライアント対応**（S3同期経由で他クライアントに伝播したPasskeyカスタムフィールドも、生JSONではなく`rp_name`/`rp_id` + `user_name`のサマリとして表示する）

**対応しない機能（スコープ外として明記）:**

- Conditional Mediation（`mediation: "conditional"`、ブラウザ組み込みのオートフィルUIとの統合）— 常にオリジナルの`navigator.credentials`にパススルーする
- 他ブラウザ/OSのプラットフォーム認証器からのPasskeyインポート
- **デスクトップクライアントでの`create()`/`get()`対応（認証器としての振る舞い）— 予定なし**。デスクトップは上記の読み取り専用表示のみ対応する
- **Androidクライアントでの`create()`/`get()`対応 — 将来追加予定だが本ドキュメントのスコープ外**。追加する際は本ドキュメントとは別にAndroid向けの設計ドキュメントを起こす想定

## 1-2. 前提知識

Passkeyは公開鍵暗号ベースの認証情報で、RP（Relying Party、ログイン先サイト）ごとに鍵ペアを生成し、秘密鍵は認証器側から外に出さない。認証時はRPが提示するchallengeに対して秘密鍵で署名し、RPは事前に登録済みの公開鍵で検証する。パスワードと異なり、秘密鍵自体がネットワークを流れることはない。

kuraがこの認証器の役割を担う場合、`create()`時に鍵ペアを生成してvaultに保存し、`get()`時にその秘密鍵で署名を行う。

# Part 2: データ設計

## 2-1. 設計方針：独立EntryTypeではなくCustomFieldとして扱う

### 検討の経緯

当初案では`EntryType::Passkey`という独立したエントリ種類を追加する設計を検討したが、以下の理由から**既存の`login`エントリに付随する`CustomField`（`field_type: "passkey"`）として扱う**方式に変更した。

**独立EntryType案の問題点:**

- 同一サイト・同一アカウントに対して「passwordを持つloginエントリ」と「passkeyエントリ」が別々に存在することになり、1つのアカウントの情報が2つのエントリに分裂してしまう。
- kuraには既に前例がある：TOTP（二要素認証コード）は`LoginData`のフィールドとしてではなく、**既存の`CustomField`（`field_type: "totp"`）として実装されている**。「loginエントリに付随する追加の認証要素はCustomFieldとして扱う」という設計パターンが既に確立されており、Passkeyもこのパターンに従うのが一貫性がある。

## 2-2. Passkeyフィールドのデータ構造

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

**`CustomFieldType` enumへの追加は現時点では見送っている**。このenumは`api_create_entry`/`api_update_entry`での作成・編集時バリデーション専用（前方互換性ポリシー）だが、passkeyフィールドを作成する専用APIがまだ存在しないため、バリデーション対象に加える必要がない。また、汎用の自由テキスト入力経路でpasskeyの値を人間が手打ちできてしまう状態を避ける意味もある。専用の作成APIを実装する段階で、必要に応じて追加を検討する。

`CustomField.value`全体が`SecretString`（Zeroizing）でラップされているため、このJSON文字列全体が既存の秘密値と同じメモリ安全性（ロック時ゼロ化）の恩恵を受ける。個々のフィールドをさらに`SecretString`で二重ラップする必要はない。

**あえて持たせないフィールド:**

- `public_key` — 保存不要。`create()`実行時に秘密鍵から都度導出できるため、永続化する意味がない。
- `sign_count` — 後述。

## 2-3. sign_countを持たせない設計判断

FIDO2/WebAuthn仕様は`signCount`の単調増加を認証器のクローン検知に使うが、kuraのモデルには持たせない。

**理由:**

1. 仕様上、`signCount = 0`は「このオーセンティケータはカウンタをサポートしない」ことを示す正当な値であり、RP側はこの値をクローン検知の対象から除外する。iCloudキーチェーン・Googleパスワードマネージャー・1Password・Bitwarden等、同期型Passkeyを提供する実装は例外なく固定0を採用している。これはkura固有の妥協ではなく、「同期型Passkey」というカテゴリ全体が持つ本質的な制約である（各デバイスが非同期にカウンタを進める以上、単調増加を維持すること自体が原理的に不可能）。
2. kuraの同期モデルはLWW + tombstone（`docs/sync-algorithm.md`）であり、`updated_at`で衝突解消する。ログインの度に`sign_count`を書き換える設計にすると、「サインインするだけでエントリの`updated_at`が更新され、複数デバイスでの同時サインインがLWW上のコンフリクトとして扱われる」という副作用が生じる。
3. 守れない保護機構を無理に実装して誤検知を生むより、そもそも実装しない方が安全。

authenticatorData構築時、signCountフィールド（4byte）には常に`0u32`をハードコードする。

## 2-4. 検索・一覧表示への対応

`EntryFilter::matches`の`custom_fields`検索ロジック（`entry.rs:205-221`）は、`field_type`が`"text"|"email"|"url"|"phone"`の場合のみ値を検索対象に含め、それ以外（`password`, `totp`等）は暗黙的に除外する設計に既になっている。`"passkey"`もこのデフォルトの除外パスに自然に該当するため、**検索除外ロジックへのコード変更は不要**。

# Part 3: アーキテクチャ

## 3-1. 全体構成

`navigator.credentials.create()`/`get()`はページのMAIN world realmでのみ有効であり、既存のContent Script（ISOLATED world）からは呼び出しを横取りできない。そのため、新たにMAIN world注入スクリプトを追加し、3段ブリッジ構成にする。

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

既存のオートフィル用Content Scriptとは別ファイルとして追加し、既存のフォーム検出ロジックには一切手を入れない。

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

**MAIN world注入スクリプトは`src/content/`のTypeScriptモジュールではなく、`extension/src/main-world/webauthn-main-injected.js`という依存なしの単一プレーンJSファイルとして実装し、ソースの`manifest.json`/`manifest.firefox.json`には一切書かず、Vite Pluginによるビルド後処理（`extension/vite-inject-webauthn-main.ts`、`closeBundle`フックで`dist/`へファイルをコピーした上で`dist/manifest.json`に直接エントリを追記）で登録する。**

MAIN world scriptは`chrome.*` APIに一切アクセスできないため、ISOLATED world側とのpostMessage仲介が必須になる。

## 3-3. 秘密鍵はFFI境界を越えない

MAIN world・ISOLATED world・Service Workerのいずれのメモリにも秘密鍵の生バイトが乗ることはない。境界を越えるのはattestationObject/signatureという、署名結果として公開して構わないデータのみ。署名処理はvault-core内で完結する。

## 3-4. CBOR/attestationObject構築はRust側

attestationObject（`{fmt: "none", attStmt: {}, authData: <bytes>}`）とauthenticatorData（`rpIdHash(32B) | flags(1B) | signCount(4B) | [attestedCredentialData]`）はバイト単位の正確性が要求されるフォーマットであり、署名対象（`authenticatorData || clientDataHash`）の構築と署名は不可分。TS側でバイト列を組み立ててRust側に渡す設計は、バイトオーダー等のバグがJS/Rust境界を跨いで混入しやすくテスト容易性も落ちるため避け、Rust側に一本化する。

**責務分割:**

- **TypeScript（Service Worker）**: `clientDataJSON`の組み立てのみ（`{type, challenge, origin, crossOrigin}`）。Service Worker自体はDOMを持たないため、`origin`はISOLATED world（`webauthn-bridge.ts`）が自身の`window.location.origin`から読み取り、メッセージ経由でService Workerに渡した値を使う。
- **Rust（vault-core）**: `clientDataJSON`のSHA-256ハッシュ計算、authenticatorData/attestationObjectのCBOR構築、COSE_Key構築、ECDSA署名。対象`login`エントリの`custom_fields`への読み書きはが担当し、暗号処理本体とは責務を分離した。

## 3-5. ドメイン検証

必要なのは「rp.idが現在のオリジンのregistrable domain suffixとして妥当か」というセキュリティ上必須の検証であり、既存のeTLD+1計算のためのPSLルックアップユーティリティのみを再利用する。パターンDB自体は一切関与しない。

**検証の多段防御:**

1. ISOLATED world content script（`webauthn-bridge.ts`）が、自身の（ページに汚染されていない）`window.location`から独立してorigin/hostnameを読み取る。MAIN world側から転送された値は信用の起点にしない。
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
  │ 設定トグルOFF・vaultApi未初期化ならpassthrough
  │ etld.ts (isValidRpId) でrp.id vs origin のsuffix検証 → 不一致ならreject
  │
  ├─ vaultアンロック済み
  │     │ vault.api_webauthn_find_credentials(rp_id, allowCredentials)
  │     │   → entry_type=="login"のエントリを走査し、custom_fields内のfield_type=="passkey"を
  │     │     collectする（非機密フィールドのみの候補、Part 2-4参照）
  │     │
  │     ├─ 候補0件 ──────────────────► status: 'passthrough' を返す（UIは開かない）
  │     │                                MAIN worldが元のnavigator.credentials.getを呼ぶ
  │     │                                （ネイティブ認証器/他拡張機能に処理を譲る）
  │     │
  │     └─ 候補1件以上 ─────────────► 儀式ウィンドウ（kind=get）を開く（後述）
  │
  └─ vaultロック中（後述「ロック中にget()が呼ばれた場合」）
        │ {kind:'locked'} contextで儀式ウィンドウを先に開く
        │ アンロック成功後、候補0件ならウィンドウ内に理由を表示した上でpassthrough、
        │ 候補1件以上ならそのまま儀式ウィンドウ（kind=get）へ進む
        ▼
ポップアップウィンドウ（chrome.windows.create、webauthn.html?kind=get&requestId=...）
  │ WEBAUTHN_RITUAL_GET_CONTEXTで候補一覧を取得し表示
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

ポップアップウィンドウとService Workerの間は、「専用port維持」ではなく、ポップアップウィンドウ自身が`chrome.runtime.sendMessage`でService Workerに問い合わせる方式にした。Service Workerがポップアップウィンドウとの通信・ページからのリクエストへの応答を両方抱えている間は生きたままになるため、追加のport維持は行っていない。ウィンドウが閉じられた場合は`chrome.windows.onRemoved`で検知しcancelled扱いにする。

### `navigator.credentials.create()`（登録）

基本構造は同じだが、以下が異なる:

- Service Workerは`excludeCredentials`と既存`credential_id`の一致をUIを開く**前**にチェックし、一致すれば即座に（UIを一切開かず）`InvalidStateError`でreject。**ただし、これはリクエスト受信時点でvaultがアンロック済みの場合に限る**（後述）。
- ポップアップウィンドウ（`kind=create`）は、`api_list_login_candidates`（オートフィルと同じeTLD+1マッチング）で見つかった既存`login`エントリの一覧 + 「新しいアイテムを作成」を選択肢として表示し、ユーザーが紐付け先を選ぶ。

### vaultがロック中に`create()`/`get()`が呼ばれた場合

`create()`（登録ボタンの明示的クリックが前提）・`get()`（サインインボタンのクリックが前提）のいずれも、ロック中は単純にpassthroughせず、儀式ウィンドウ内でアンロックを挟んでから続行する（当初案からの変更。旧設計では`get()`はロック中は無条件passthroughだったが、`create()`向けに実装したアンロック挟み込みと挙動を揃えるため、`get()`にも同じ仕組みを適用した）。

1. `excludeCredentials`チェック・`matchingEntries`計算（create）/`api_webauthn_find_credentials`（get）は復号が必要なため実行できない。そこでService Workerは`{kind:'locked'}` contextで儀式ウィンドウを先に開く（同一ウィンドウを使い回す。タイムアウトは入力時間確保のため180秒に延長）。
2. 儀式ウィンドウは`UnlockRitual`画面を表示し、`UNLOCK`メッセージ（メインpopupの「アンロック」画面と共通のメッセージ型）を送ってvaultをアンロックさせる。
3. アンロック成功時、Service Worker側（`resumeLockedWebauthnRituals`）が本来の処理をこの時点で初めて実行し、儀式windowのcontextを差し替える。タイムアウトも通常の85秒にリセットする。儀式ウィンドウは`WEBAUTHN_RITUAL_CONTEXT_UPDATED`通知（または自分自身のアンロック成功レスポンス）を契機にcontextを再取得し、次の画面へ自動遷移する。差し替え先のcontextは次のいずれか:
   - create: 既存`credential_id`と一致 → `{kind:'error', reason:'already_registered'}`（ローカライズ済みメッセージを表示し、閉じるとInvalidStateErrorでreject）
   - create: 一致なし → `{kind:'create', rpId, rpName, matchingEntries}`（通常の紐付け先選択画面へ）
   - get: 候補0件 → `{kind:'error', reason:'no_credentials'}`（ローカライズ済みメッセージを表示し、閉じるとstatus:'passthrough'でブラウザネイティブ処理へ）
   - get: 候補1件以上 → `{kind:'get', rpId, candidates}`（通常の候補選択画面へ）
4. 以降は通常のcreate確認/候補選択フローと同じ。ユーザーがどの経路（この儀式ウィンドウ内、またはメインpopup）でアンロックしても、儀式は継続される。

**get()のサイドチャネル防止方針の変更点**: アンロック済み状態での従来の設計は「候補0件なら儀式ウィンドウを一切開かない」ことでサイト側に何も観測させなかったが、ロック中はそもそも候補数を復号なしに知りえないため、この最適化は成立しない。ロック中は候補の有無に関わらず`{kind:'locked'}`でポップアップウィンドウを開き、アンロック後に候補0件と判明した場合のみ、ウィンドウ内にその旨を表示してから`passthrough`する。これにより「vaultが現在ロックされているかどうか」はウィンドウの有無から推測されうるが、「このサイト用のPasskeyを持っているかどうか」はロック中は最後まで秘匿される（アンロックしない限り誰にも分からない）。

## 3-7. 新規Passkey作成時の紐付け先エントリ決定

`create()`が呼ばれた際、Service Workerは`rp_id`（eTLD+1）に一致する既存の`login`エントリを検索し、以下のいずれかに分岐する。

| 状況 | 挙動 |
|---|---|
| 一致する`login`エントリが1件 | そのエントリに`passkey`カスタムフィールドを追加することをデフォルト提案（確認ダイアログで表示）。ユーザーは「新規エントリとして作成」も選択可能 |
| 一致する`login`エントリが複数件 | どのエントリに紐付けるか、または新規作成するかをユーザーに選択させる |
| 一致なし | 新規`login`エントリを作成（`name`は`rp_name`または`rp_id`、`url`は`rp_id`、`username`は`user_name`、`password`は空文字）した上で`passkey`カスタムフィールドを追加 |

この判定は既存のオートフィルのURL/ドメインマッチングと同じeTLD+1ベースの照合を使う。

# Part 4: セキュリティ上の注意点

1. **秘密鍵はFFI境界を一切越えない**。越境するのはattestationObject/signatureという公開して構わない署名結果のみ。
2. **rp_id/origin検証の多段防御**。ページやMAIN world側が主張する値を最終判断には使わない。
3. **既存クレデンシャルの存在有無を推測させるサイドチャネルの防止**: **vaultがアンロック済みの状態でリクエストを受けた場合**、`get()`で候補0件、または`create()`で`excludeCredentials`が一致した場合は、儀式ウィンドウを一切開かない（開いて即閉じることも含む）。ウィンドウの生成・フォーカス移動はページ側から`visibilitychange`/`blur`イベント等で観測されうるため、それ自体が「このユーザーはこのサイトのPasskeyを持っているか」を推測させるサイドチャネルになりうる。UIを見せるかどうかの分岐は、儀式ウィンドウを開く**前**に完全に確定させる。
   **vaultがロック中の場合はこの限りではない**:  候補の有無は復号しないと分からないため、`create()`/`get()`いずれも候補の有無に関わらず`{kind:'locked'}`で儀式ウィンドウを先に開き、アンロック後に初めて候補0件/`excludeCredentials`一致が判明した場合は、ウィンドウ内にその旨を表示してから終了する。これにより「vaultが現在ロックされているか」はウィンドウの有無から推測されうる（アンロック済みなら候補0件で無反応、ロック中なら常にウィンドウが開くため）が、「ロック中のvaultがこのサイト用のPasskeyを持っているか」はアンロックしない限り最後まで秘匿される。前者の情報漏洩（ロック状態の推測可否）は許容する——vaultのロック状態自体は既存のオートフィル機能でも同様に外部から観測しうる情報であり、Passkey機能固有の新規リスクではないため。
4. **エラーメッセージの無害化**: vault-core由来の内部エラー文字列をページJSに直接渡さない。ページに返す拒否理由は必ずWebAuthn仕様が定める汎用的な`DOMException`（`NotAllowedError`等）に正規化する。
5. **タイムアウト/ウィンドウクローズの必達処理**: 横取りによりブラウザネイティブの`options.publicKey.timeout`強制が働かなくなるため、MAIN world側で独自タイムアウトを実装する。儀式ウィンドウが閉じられた場合・Service Worker再起動でport切断された場合を含め、必ずページのPromiseを解決（`NotAllowedError`相当でreject）させ、ハングしたままにしない。
6. **常時ユーザー操作を必須にする**。
7. **`isUserVerifyingPlatformAuthenticatorAvailable()`を`true`に上書きする判断とトレードオフ**: 上書きしないと、プラットフォーム認証器を持たない環境（Linuxデスクトップ等）で多くのサイトが「Passkeyでサインイン」ボタン自体を出さず、kuraのPasskey機能が実質使えなくなる。したがって`true`固定を推奨するが、これは「kuraが常にPasskey対応を主張する」ことを意味し、実際にはvaultがロック中・該当Passkeyを持っていない場合は上記3項のパススルー/静音拒否と組み合わせて初めて安全に成立する。