<!-- doc-status: design -->
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

`CustomField.value`にJSON文字列として格納する構造（vault-core内では`PasskeyFieldData`として扱う）:

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

    // 追加: ISOLATED world側ブリッジ
    { "matches": ["<all_urls>"], "js": ["src/content/webauthn-bridge.ts"], "run_at": "document_start", "all_frames": true },

    // 追加: MAIN world注入スクリプト
    { "matches": ["<all_urls>"], "js": ["src/content/webauthn-main.ts"], "run_at": "document_start", "all_frames": true, "world": "MAIN" }
  ]
}
```

`document_start`が必須（ページの他スクリプトが`navigator.credentials.create/get`の参照をキャッシュする前に上書きする必要があるため）。

**ブラウザ対応状況:**

- **Chrome**: `world: "MAIN"`はChrome 111+でmanifest宣言可能。ただし、manifest宣言では動作せず`chrome.scripting.registerContentScripts`による動的登録でのみ動作するという既知の不具合報告があるため、実装時は両方式を実機検証し、manifest宣言が信頼できない場合は動的登録にフォールバックする（Part 8 Phase 0参照）。
- **Firefox**: Firefox 128でMAIN world対応。既存の`manifest.firefox.json`の`strict_min_version`（現状112.0）を128以上に引き上げる必要がある。対応ブラウザ幅の変更となるため、実装フェーズでメンテナーの承認を得る。

MAIN world scriptは`chrome.*` APIに一切アクセスできないため、ISOLATED world側とのpostMessage仲介が必須になる。

## 3-3. 秘密鍵はFFI境界を越えない

MAIN world・ISOLATED world・Service Workerのいずれのメモリにも秘密鍵の生バイトが乗ることはない。境界を越えるのはattestationObject/signatureという、署名結果として公開して構わないデータのみ。署名処理はvault-core内で完結する。

## 3-4. CBOR/attestationObject構築はRust側

attestationObject（`{fmt: "none", attStmt: {}, authData: <bytes>}`）とauthenticatorData（`rpIdHash(32B) | flags(1B) | signCount(4B) | [attestedCredentialData]`）はバイト単位の正確性が要求されるフォーマットであり、署名対象（`authenticatorData || clientDataHash`）の構築と署名は不可分。TS側でバイト列を組み立ててRust側に渡す設計は、バイトオーダー等のバグがJS/Rust境界を跨いで混入しやすくテスト容易性も落ちるため避け、Rust側に一本化する。

**責務分割:**

- **TypeScript（Service Worker）**: `clientDataJSON`の組み立てのみ（`{type, challenge, origin, crossOrigin}`。`window.location.origin`というDOM由来の値が必要なためJS側が自然）。
- **Rust（vault-core）**: `clientDataJSON`のSHA-256ハッシュ計算、authenticatorData/attestationObjectのCBOR構築、COSE_Key構築、ECDSA署名、対象`login`エントリの`custom_fields`への読み書き。

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
  │ requestId発行、独自タイムアウトタイマー開始
  │ postMessage({ type: 'KURA_WEBAUTHN_GET_REQUEST', requestId, options }, origin)
  ▼
[ISOLATED world] webauthn-bridge.ts
  │ 自前のwindow.locationからorigin/hostnameを独立取得
  │ chrome.runtime.sendMessage({ type: 'WEBAUTHN_GET_REQUEST', payload: { ..., origin } })
  ▼
Service Worker background/webauthn.ts
  │ etld.tsでrp.id vs origin のsuffix検証 → 不一致ならreject
  │ vault.api_webauthn_find_credentials(rp_id, allowCredentials)
  │   → entry_type=="login"のエントリを走査し、custom_fields内のfield_type=="passkey"を
  │     collectする（非機密フィールドのみの候補、Part 2-4参照）
  │
  ├─ 候補0件 ────────────────────────────► ISOLATED → MAIN: "PASSTHROUGH"
  │                                          MAIN worldが元のnavigator.credentials.getを呼ぶ
  │                                          （ネイティブ認証器/他拡張機能に処理を譲る。UIは開かない）
  │
  └─ 候補1件以上
        │ chrome.windows.create（儀式ウィンドウ）を開き、専用portで接続を維持
        │ ユーザーがカードを選択・確認クリック（カードは「loginエントリ名 + Passkey名」で表示）
        │ vault.api_webauthn_get_assertion(entry_id, custom_field_id, client_data_json)
        │   [秘密鍵はvault-core内のみで完結]
        │ 儀式ウィンドウclose
        ▼
      ISOLATED → MAIN: { credentialId, authenticatorData, signature, userHandle }（base64url）
        ▼
      [MAIN world] PublicKeyCredential形状のオブジェクトを構築しPromiseをresolve
        ▼
      Webページ側のget()呼び出しがresolveされる
```

### `navigator.credentials.create()`（登録）

基本構造は同じだが、以下が異なる:

- Service Workerは`excludeCredentials`と既存`credential_id`の一致をUIを開く**前**にチェックし、一致すれば即座に（UIを一切開かず）reject。
- 確認ダイアログでは「どの`login`エントリに紐付けるか」を決定する必要がある（3-7節参照）。
- 候補選択UIの代わりに「{rp_name}のPasskeyを作成しますか？」の確認ダイアログを表示する。「別の方法を使う」を選ぶとMAIN worldに"PASSTHROUGH"を返し、元の`create()`を呼ばせる。

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

- **種別選択の制限**: 「カスタムフィールド追加」の種別選択に`passkey`を表示するのは`entry_type == "login"`のエントリのみ。他のエントリタイプ（`secure_note`等）では選択肢に出さない。
- **入力フローの分岐**: `passkey`を選ぶと、通常のテキスト入力フォームの代わりに「このサイトの新しいPasskeyを作成」ボタンが表示され、WebAuthn作成儀式（3-6節の`create()`フロー相当）が起動する。ユーザーが直接テキストを入力して`passkey`フィールドを作ることはできない。
- **表示の読み取り専用化**: 一度作成された`passkey`カスタムフィールドは、既存の「値」欄をテキストとして表示・編集させず、専用のカード表示（作成日、RP名、削除ボタンのみ）にする。既存の「既知タイプは全フィールド編集可能」という前提を初めて破るケースであり、実装時に個別対応が必要になる点をここに明記しておく。

## 4-5. エントリ一覧・詳細画面への表示対応

新規`EntryType`を追加しないため、`EntryTypeIcon.tsx`等の既存のエントリ種別表示コンポーネントへの変更は不要。代わりに以下が必要になる。

- `EntryCard.tsx`/`EntryListPanel.tsx`: `login`エントリの`custom_fields`に`field_type == "passkey"`が含まれる場合、Passkey対応であることを示す小さなバッジ/アイコンを追加表示する。
- `login`エントリの詳細画面: `custom_fields`内の`passkey`エントリを「Passkey」セクションとしてグルーピング表示し、4-4節の専用カード表示を適用する。

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

## 7-2. 新規ファイル一覧

### vault-core

| 新規ファイル | 対応する既存ファイル | 内容 |
|---|---|---|
| `src/webauthn/mod.rs` | `src/crypto/encryption.rs`と並列 | 鍵生成、authenticatorData/attestationObject構築、COSE_Key構築、ECDSA署名、`PasskeyFieldData`のJSON変換、固定AAGUID定数 |
| `src/api/webauthn.rs` | `src/api/entries.rs`と並列 | `api_webauthn_find_credentials`（`login`エントリのcustom_fieldsを横断的に走査、非機密候補一覧を返す）、`api_webauthn_create_credential`（対象entry_id指定 or 新規login作成 + `passkey`カスタムフィールド追加）、`api_webauthn_get_assertion`（entry_id + custom_field_id指定で署名） |
| `tests/webauthn_test.rs` | 既存`tests/`配下の統合テスト群と並列 | バイト単位のラウンドトリップ・ゴールデンベクタテスト |

**当初案からの変更点**: `src/models/entry.rs`（`EntryType`追加）・`src/models/typed_value.rs`（`TypedValue::Passkey`追加）への変更は**不要**になった。既存の`CustomField`検索除外ロジック（`entry.rs`）への変更も不要（Part 2-4参照）。

### extension/wasm-bridge

`src/lib.rs`に、上記3関数のwasm-bindgenラッパーを追記する。

### extension（TypeScript）

| 新規ファイル | 対応する既存ファイル | 内容 |
|---|---|---|
| `src/content/webauthn-main.ts` | （新規カテゴリ） | MAIN world、`navigator.credentials.create/get`のオーバーライド、タイムアウト管理、requestIdマップ |
| `src/content/webauthn-bridge.ts` | `src/content/main.ts`のメッセージ中継部分と類似 | postMessage⇄`chrome.runtime.sendMessage`中継、独立したorigin再検証 |
| `src/background/webauthn.ts` | `src/background/autofill.ts`と並列 | `WEBAUTHN_*`メッセージハンドラ、rp_id suffix検証、紐付け先エントリ決定（3-7節）、儀式ウィンドウ管理 |
| `src/popup/webauthn.html` + `webauthn-main.tsx` | `src/background/offscreen.html`（別HTMLエントリの前例） | 儀式専用ウィンドウのエントリポイント |
| `src/popup/screens/webauthn/CreateConfirm.tsx` | `EntryTypeSelectDialog.tsx`（Radix Dialog利用実績） | 新規作成確認画面（紐付け先エントリ選択含む） |
| `src/popup/screens/webauthn/SelectCredential.tsx` | `EntryCard.tsx`/`EntryListPanel.tsx` | 複数候補選択画面 |

既存ファイルへの変更: `manifest.json`/`manifest.firefox.json`（content_scripts追加、Firefox `strict_min_version`引き上げ）、`src/background/index.ts`（`WEBAUTHN_`プレフィックス委譲を`AUTOFILL_`/`DEV_MODE_`と同パターンで追加）、`src/shared/messages.ts`（`WEBAUTHN_*`メッセージ型定義）、`EntryCard.tsx`/`EntryListPanel.tsx`（Passkeyバッジ表示）、`EntryForm.tsx`（`passkey`カスタムフィールドの種別制限・専用表示、4-4節）、i18nロケールファイル。

---

# Part 8: 段階的リリース

| フェーズ | 範囲 | 成果物 |
|---|---|---|
| **Phase 0（スパイク・検証）** | 実装なし。(a) manifest宣言`world:MAIN`と`chrome.scripting.registerContentScripts`の信頼性比較、(b) `PublicKeyCredential`ライクなオブジェクトが実サイト（webauthn.io、GitHub等）のJSで`instanceof`チェック等に耐えるかの検証、(c) ページCSPとの相互作用検証 | 検証結果メモ。以降のフェーズの設計を必要に応じて修正 |
| **Phase 1** | vault-coreの暗号処理+`login`エントリへの`passkey`カスタムフィールド読み書きAPIのみ。UI・拡張側の配線なし | `src/webauthn/`モジュール、`api/webauthn.rs`の3関数、Rustユニットテスト（バイト単位ゴールデンベクタ） |
| **Phase 2** | wasm-bridgeラッパー、MAIN/ISOLATED注入、Service Workerのメッセージハンドリングと儀式ウィンドウ管理、最小限の儀式UI（作成確認・紐付け先選択・候補選択）。設定画面に「Passkey対応（β）」トグルを追加しデフォルトOFFで段階的に有効化 | manifest変更、`webauthn-main.ts`/`webauthn-bridge.ts`/`background/webauthn.ts`/儀式用ポップアップ画面。doc-statusを`partial`に更新 |
| **Phase 3** | `login`エントリ一覧・詳細・編集画面でのPasskey表示対応（バッジ・専用カード表示・i18n）、カスタムフィールド追加UIの種別制限対応 | UI touch point一式。doc-statusを`implemented`に更新 |
| **Phase 4（将来・任意・スコープ外）** | Conditional Mediation対応、Bitwarden JSON export/importでのfido2Credentials互換、デスクトップ/Android側のUI対応 | 本ドキュメントでは設計しない |

Phase 2以降も、`mediation: "conditional"`が指定されたリクエストは常にオリジナル関数へパススルーする（Conditional UIはPhase 4の明示的な非対応スコープ）。
