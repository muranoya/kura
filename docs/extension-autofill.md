<!-- doc-status: partial -->
# ブラウザ拡張オートフィル機能 仕様書

## 1. 概要

ブラウザ拡張機能において、表示中のウェブページ上のフォーム（ログイン、クレジットカード等）を検出し、vaultに保存されたクレデンシャルの入力候補を表示・自動入力する機能。

### 全体アーキテクチャ

```
ウェブページ
  └── Content Script（manifest宣言による自動注入）
        ├── フォーム検出（ヒューリスティック）
        ├── オートフィルUI（Shadow DOM内ドロップダウン）
        └── フィールド入力
              ↕ chrome.runtime.sendMessage
Service Worker
  ├── クレデンシャル照合（URL/ドメインマッチング）
  └── WASM (vault_core)
        └── 暗号化・復号
```

Content Scriptは`manifest.json`の`content_scripts`宣言により全ページに自動注入される。ページ上のフォームを検出し、Service Workerにクレデンシャルを問い合わせる。Service WorkerはWASM経由でvaultを復号し、該当するクレデンシャルをContent Scriptに返す。Content Scriptはフォームに値を入力する。

## 2. 対応フォームタイプ

| タイプ | 説明 | 例 |
|--------|------|-----|
| LOGIN | username + password が同一画面 | 大多数のウェブサイト |
| LOGIN_USERNAME | 分割ログインの1画面目（usernameのみ） | Google, Microsoft, Apple |
| LOGIN_PASSWORD | 分割ログインの2画面目（passwordのみ） | Google, Microsoft, Apple |
| REGISTRATION | 新規アカウント作成フォーム | サインアップ画面 |
| PASSWORD_CHANGE | 旧パスワード + 新パスワード x2 | パスワード変更画面 |
| TOTP | 6桁コード入力フィールド | 2FA認証画面 |
| CREDIT_CARD | カード番号/有効期限/CVV | 決済フォーム |

> **実装状況:** LOGIN, LOGIN_USERNAME, LOGIN_PASSWORD のみ実装済み。REGISTRATION, PASSWORD_CHANGE, TOTP, CREDIT_CARD はフィールド分類ロジックは存在するがフォーム検出時にスキップされる（将来対応予定）。

## 3. フォーム検出ヒューリスティック

汎用ヒューリスティックでフォームを検出する。

### 3.1 重み付きシグナル方式

各inputフィールドに対して、複数のシグナルソースから重み付きスコアを算出し、フィールドの役割（username、password等）を判定する。

| 優先度 | シグナルソース | 重み | 説明 |
|--------|---------------|------|------|
| 1 | `autocomplete`属性 | 10 | HTML仕様準拠。`username`, `current-password`, `new-password`, `cc-number`等。存在すれば最も信頼性が高い |
| 2 | `type`属性 | 8 | `type="password"`はほぼ確定的。`type="email"`, `type="tel"`はpasswordフィールドの近くにあればusername候補 |
| 3 | `name` / `id`属性 | 6 | 既知のパターンとマッチング: `/^(user\|email\|login\|account\|phone)/i`, `/^(pass\|pwd\|senha\|contrase)/i`, `/^(otp\|totp\|code\|token\|verify)/i` |
| 4 | `aria-label` / `placeholder` / `title` | 4 | ローカライズされたテキストシグナル。汎用的な`name`属性を持つサイトで有効 |
| 5 | 関連`<label>`テキスト | 4 | `for`属性による紐付け、またはDOM親要素の走査で発見 |
| 6 | ページURLコンテキスト | 2 | パスに`/login`, `/signin`, `/auth`, `/register`, `/signup`を含む。タイブレーカーとしてのみ使用 |

**スコアの使われ方：** 各フィールドについて、マッチしたシグナルの重みを合算してフィールドタイプごとのスコアを計算し、最もスコアが高いタイプに分類する。例えば `autocomplete="username"`（+10）かつ `name="email"`（+6）を持つフィールドはusernameスコアが16となり、他のタイプより高ければusernameと判定される。スコアが同点の場合は優先度の高いシグナルが勝つ。いずれのタイプにも閾値（最低スコア）に満たない場合は分類不能として無視する。

### 3.2 フォームタイプ分類アルゴリズム

各`<form>`要素（またはフォームライクなコンテナ）に対して：

1. 内部のvisibleな`<input>`要素を収集する
2. 各inputに対して3.1のシグナル方式でフィールドタイプ（username / password / new_password / totp / cc_number 等）を判定する
3. 判定されたフィールドの組み合わせからフォームタイプを分類する：

```
username候補 1つ + password 1つ          → LOGIN
username候補 1つ + password 0            → LOGIN_USERNAME
password 1つ + username候補 0            → LOGIN_PASSWORD
password 1つ + new-password 2つ          → PASSWORD_CHANGE
username + email + password 1つ以上      → REGISTRATION
短い数値入力 1つ (4-8桁, maxlength制限)   → TOTP
cc-number + cc-exp + cc-cvc              → CREDIT_CARD
```

### 3.3 フォームレスフィールドへの対応

モダンSPAでは`<form>`要素なしでinputフィールドが配置されることが多い（例: Gmailのログイン）。

- visibleな`<input type="password">`を起点として検索する
- 近傍のinputフィールドを、DOM構造上の共通祖先（3〜4階層以内）でクラスタリングする
- クラスタ単位でフォームタイプ分類を適用する

### 3.4 分割ログインフローの検知

Google、Microsoft、Apple等では、usernameとpasswordが別画面に分割されている。

> **未実装（将来対応予定）:** 現在の実装ではLOGIN_USERNAMEとLOGIN_PASSWORDの検出は行われるが、画面間の関連付け（`pendingLoginFlows`）は未実装。各画面で独立して候補が表示される。以下は将来の設計計画。

**検知フロー：**

1. LOGIN_USERNAMEフォームを検出し、kuraがusernameを入力（またはユーザーが手動入力）
2. Service WorkerのメモリにtabIdをキーとして `pendingLoginFlows.set(tabId, { domain, username, timestamp })` を保存
3. 次のページ/DOM状態でLOGIN_PASSWORDフォームを検出した場合、`pendingLoginFlows`を参照して同一フローとして扱う
4. タイムアウト（5分）経過後、またはタブクローズ時（`chrome.tabs.onRemoved`）に`pendingLoginFlows`から削除する

```typescript
// Service Worker
const pendingLoginFlows = new Map<number, {
  domain: string;
  username: string;
  timestamp: number;
}>();

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingLoginFlows.delete(tabId);
});
```

**sessionStorageを使わない理由：** sessionStorageはページスクリプトから読み取り可能なため、悪意あるページがusernameを盗める可能性がある。また、Googleなどの分割ログインは通常のページ遷移を伴うため、Content Scriptのメモリはページ遷移時に破棄されてしまい利用できない。

## 4. SPA・動的コンテンツ検知

### 4.1 スキャントリガー

フォーム検出のトリガーは **documentレベルのfocusイベント（キャプチャフェーズ）一本** に絞る。

```typescript
document.addEventListener('focus', (e) => {
  const target = e.target;
  // HTMLTextAreaElementはfocusイベントで捕捉されるが、即座にreturnされ処理対象外
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    return;
  }
  if (target instanceof HTMLTextAreaElement) return;
  handleInputFocus(target);
}, true); // capture: true でバブリングしないfocusも捕捉
```

この方式により、静的ページ・SPA・動的に追加されたフォームのいずれも、ユーザーがフィールドにフォーカスした時点でオンデマンドに検出できる。事前スキャンやMutationObserverは不要。

**`<input>` 以外の入力要素について：**
- `<textarea>`: focusイベントで捕捉されるが、即座にreturnされ処理対象外とする
- `contenteditable` 要素: リッチテキストエディタ等で使われるが、ログインフォームのフィールドとして使われることはほぼないため対象外とする
- カスタム入力コンポーネント（Web Components等）: 内部の `<input>` がOpen Shadow DOM内にある場合はfocusイベントのバブリングで捕捉できる（Section 4.3参照）

**MutationObserverを廃止した理由：** SPAで動的追加されたフィールドも、ユーザーがフォーカスした瞬間にキャプチャできるため、DOM監視は不要。デバウンスやパフォーマンスガードといった複雑な仕組みも省ける。

**`autofocus`属性のフィールドについて：** ブラウザが自動フォーカスするため、focusイベントが捕捉できない場合がある。ただし、ユーザーの明示的なアクションなしに候補を表示することになるため、意図的に無視する。

### 4.2 SPAナビゲーション検知

SPA遷移後に新しいフォームが出現した場合も、ユーザーがそのフィールドにフォーカスした時点でfocusイベント（Section 4.1）が検出する。

**分割ログインフローとの関係：** SPA型の分割ログイン（URLが変わらずDOMのみ書き換わるケース）も、パスワードフィールドへのフォーカス時に検出する。通常のページ遷移型（Google, Microsoft等）は、遷移後の新しいContent ScriptのfocusイベントハンドラがService Workerの`pendingLoginFlows`を参照することで同一フローとして扱われる（Section 3.4）。

### 4.3 Shadow DOM

- **Open Shadow Root**（`element.shadowRoot`にアクセス可能）: focusイベントはShadow DOM境界を越えてバブリングするため、追加の設定なしに捕捉できる。
- **Closed Shadow Root**（アクセス不可）: 対応不可。既知の制限として受け入れる。

### 4.4 iframe

> **未実装（将来対応予定）:** 現在のmanifestには`all_frames: true`が設定されていないため、Content Scriptはトップフレームでのみ動作する。以下は将来の設計計画。

- **Same-origin iframe**: `all_frames: true` で各iframeにContent Scriptのインスタンスを注入する。各インスタンスはiframe自身のURL（`window.location`）のドメインをService Workerに送信し、そのドメインに合致するクレデンシャルをサジェストする。親ページのドメインではなくiframe自身のドメインを使う点に注意。
- **Cross-origin iframe**: `host_permissions`に含まれるオリジンのiframeには注入可能。含まれない場合（例: 3D Secure決済iframe）は対応不可。

## 5. パターンDB

> **未実装（将来対応予定）:** パターンDBシステムは未実装。現在はSection 3のヒューリスティック検出のみで動作する。以下のサブセクション（5.1〜5.8）は将来の設計計画として残す。

### 5.1 概要

サイト固有のフォーム検出ルールをJSONで管理し、GitHubリポジトリ上で公開する。コミュニティからのコントリビューションを受け付ける。

- 拡張機能にはビルド時の最新パターンDBを同梱する
- 動的更新は行わない（将来的にGitHub Pages経由の定期更新を検討）
- 更新はリリース単位で行う

### 5.2 ファイル構成

```
extension/patterns/
  schema.json              ← JSON Schemaバリデーション定義
  sites/
    accounts.google.com.json
    login.microsoftonline.com.json
    amazon.com.json
    ...
  build/
    patterns.json           ← ビルド時に自動生成されるマージ済みファイル
```

- `sites/`配下にドメインごとのJSONファイルを配置する
- ビルド時にViteプラグイン（またはpre-buildスクリプト）が全ファイルをマージして`build/patterns.json`を生成する
- Content ScriptまたはService Workerが`patterns.json`を読み込む

### 5.3 デフォルトヒューリスティック設定

パターンDBにサイト固有の定義がないページに適用される、汎用的なフォーム検出ルール。

ヒューリスティックの内容（フィールドシグナルのパターン、スキップセレクタ、フォーム分類ルール）はソースコード上で定義し、Section 3.1の重み付きシグナル方式に従って実装する。具体的なシグナル定義は以下の通り。

**フィールドシグナル定義：**

| フィールドタイプ | autocomplete値 | typeヒント | name/idパターン |
|----------------|---------------|-----------|----------------|
| username | `username` | `email`, `tel`, `text` | `^(user\|email\|login\|account\|phone\|id)` |
| password | `current-password` | `password` | `^(pass\|pwd\|senha\|contrase)` |
| new_password | `new-password` | `password` | `^(new.?pass\|confirm.?pass\|retype)` |
| totp | `one-time-code` | `text`, `number`, `tel` | `^(otp\|totp\|code\|token\|verify\|mfa\|2fa)` |
| cc_number | `cc-number` | — | `^(card.?num\|cc.?num\|credit)` |
| cc_exp | `cc-exp`, `cc-exp-month`, `cc-exp-year` | — | `^(exp\|valid)` |
| cc_cvc | `cc-csc`, `cc-cvc`, `cc-cvv` | — | `^(cvc\|cvv\|csc\|security.?code)` |
| cc_name | `cc-name` | — | `^(card.?holder\|cc.?name)` |

**スキップ対象（検出から除外）：** `input[type='search']`、`input[role='searchbox']`、`input[aria-label*='search' i]`、`input[name*='search' i]`、`input[name*='query' i]`、`input[name*='keyword' i]`

### 5.4 サイト固有パターンのスキーマ

```json
{
  "match": {
    "type": "domain | domain_suffix",
    "value": "string"
  },
  "disabled": false,
  "forms": [
    {
      "id": "string (フォーム識別子、multi-step参照用)",
      "type": "login | login_username | login_password | registration | password_change | totp | credit_card",
      "condition": {
        "url_path": "string (正規表現、このフォームが表示されるパス)",
        "element_exists": "string (CSSセレクタ、この要素が存在するときのみ適用)"
      },
      "fields": {
        "<field_name>": {
          "selector": "string (CSSセレクタ)",
          "fallback_selectors": ["string (代替セレクタ)"],
          "value_attribute": "string (value以外の属性に設定する場合)",
          "fill_delay_ms": 0
        }
      },
      "skip_fields": ["string (CSSセレクタ: 検出対象から除外するフィールド)"],
      "submit": {
        "selector": "string (送信ボタンのCSSセレクタ)",
        "action": "click | submit",
        "delay_ms": 0
      },
      "next_step": "string (multi-stepフローの次のフォームID)",
      "wait_for": {
        "selector": "string (フィールド入力前に待機する要素のCSSセレクタ)",
        "timeout_ms": 5000
      }
    }
  ]
}
```

**matchタイプの説明：**

| タイプ | 値の例 | マッチ対象 |
|--------|--------|-----------|
| `domain` | `"accounts.google.com"` | 指定したホスト名に完全一致 |
| `domain_suffix` | `"amazon.com"` | 指定ドメインおよびそのすべてのサブドメインに一致（`www.amazon.com`, `smile.amazon.com` 等） |

**正規表現マッチ（`url_pattern`）は採用しない：** マッチ範囲が人間にも機械にも静的に検証しにくく、悪意あるコントリビューターが過剰に広いパターン（例: `.*\.com`）を紛れ込ませるリスクがある。パスベースの条件分岐が必要な場合は、フォームレベルの `condition.url_path` で代替する。

### 5.5 パターンの具体例

#### Google（分割ログイン）

```json
{
  "match": {
    "type": "domain",
    "value": "accounts.google.com"
  },
  "forms": [
    {
      "id": "google-username",
      "type": "login_username",
      "condition": {
        "url_path": "/v3/signin/identifier"
      },
      "fields": {
        "username": {
          "selector": "input[type='email'][name='identifier']",
          "fallback_selectors": ["#identifierId"]
        }
      },
      "submit": {
        "selector": "#identifierNext button",
        "action": "click"
      },
      "next_step": "google-password"
    },
    {
      "id": "google-password",
      "type": "login_password",
      "condition": {
        "url_path": "/v3/signin/challenge"
      },
      "wait_for": {
        "selector": "input[type='password'][name='Passwd']",
        "timeout_ms": 5000
      },
      "fields": {
        "password": {
          "selector": "input[type='password'][name='Passwd']"
        }
      },
      "submit": {
        "selector": "#passwordNext button",
        "action": "click"
      }
    }
  ]
}
```

#### Amazon（標準ログイン）

```json
{
  "match": {
    "type": "domain_suffix",
    "value": "amazon.com"
  },
  "forms": [
    {
      "id": "amazon-login",
      "type": "login",
      "fields": {
        "username": {
          "selector": "input[name='email']",
          "fallback_selectors": ["#ap_email"]
        },
        "password": {
          "selector": "input[name='password']",
          "fallback_selectors": ["#ap_password"]
        }
      },
      "submit": {
        "selector": "#signInSubmit",
        "action": "click"
      }
    }
  ]
}
```

#### オートフィル無効化

```json
{
  "match": {
    "type": "domain",
    "value": "internal-admin.example.com"
  },
  "disabled": true
}
```

### 5.6 パターンの評価順序

1. `domain`マッチ（完全一致）
2. `domain_suffix`マッチ（ワイルドカード）
3. `default`（汎用ヒューリスティック）

複数のパターンがマッチした場合、より具体的なパターンを優先する。

### 5.7 ビルド時処理

1. `extension/patterns/sites/`配下の全JSONファイルを読み込む
2. `extension/patterns/schema.json`でバリデーション
3. サイト固有パターンをマージして`build/patterns.json`を生成
4. Content Scriptの静的アセットとしてバンドル

### 5.8 開発者モード（パターンテスト）

拡張機能のオプションページに開発者モードを用意し、パターン作成・検証を支援する。

**機能：**

- **カスタムパターンの読み込み**：ファイルピッカーで任意の `patterns.json` を読み込み、ビルド済みのパターンDBと差し替えて動作させる。
- **デバッグパネル**：現在のページでのマッチ結果をパネルに表示する。
  - どの `match` タイプ（`domain` / `domain_suffix` / ヒューリスティック）で一致したか
  - 検出されたフィールドとそのシグナルスコア（ヒューリスティックの場合）
  - パターンDBのセレクタが実際のDOMに一致しているか
  - 入力を実行せずにドライランで確認できるモード

**セキュリティ上の注意：** 開発者モードは拡張機能のオプションページからのみ有効化できる。通常の利用時は無効であり、カスタムパターンはメモリ上にのみ保持してvaultには保存しない。

## 6. コンテンツスクリプト注入戦略

### 6.1 manifest宣言による注入

`manifest.json`の`content_scripts`宣言により、全URLに対して`document_idle`タイミングで自動注入する。

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/main.ts"],
      "run_at": "document_idle"
    }
  ]
}
```

**設計判断：**
- Vault状態に関わらず全ページに注入される（ロック時はService Worker側でクレデンシャルの返却を拒否するため安全）
- `chrome.scripting.executeScript`によるオンデマンド注入は不採用とした（Service Workerの起動タイミングに依存せず確実に注入できるため）
- 二重初期化は`window.__kura_autofill_initialized`フラグで防止する

**`<all_urls>`を使用する理由：** パスワードマネージャーはユーザーが登録しているあらゆるサイトでオートフィルを提供する必要があるため、対象ドメインを事前に限定することができない。最小権限の原則から外れるが、この性質上避けられない選択であり、1Password等の主要パスワードマネージャーも同様のアプローチを採用している。

### 6.2 必要な権限

```json
{
  "permissions": ["storage", "alarms", "clipboardWrite", "offscreen", "tabs"]
}
```

- `<all_urls>`は`content_scripts.matches`でのみ使用し、`host_permissions`としては不要
- `scripting`権限・`activeTab`権限はmanifest宣言方式のため不要
- Firefox（`manifest.firefox.json`）では`offscreen`権限なし

## 7. セキュリティ設計

### 7.1 クレデンシャル受け渡しフロー（2段階方式）

Content Scriptがvault全体やDEKにアクセスすることを防ぐため、クレデンシャルの受け渡しを2段階に分ける。

```
[ステップ1: 候補リスト取得]
Content Script                          Service Worker
  │                                         │
  ├── AUTOFILL_GET_CREDENTIALS ──────────►  │
  │   { url: "https://example.com" }        │
  │                                         ├── URL/ドメインマッチング
  │                                         ├── 一致するエントリを検索
  │  ◄─────── AUTOFILL_CREDENTIALS_LIST ──  │
  │   [{ entryId, name, username }]         │
  │   ※パスワードは含まない                   │
  │                                         │
  ├── ドロップダウンUIに候補を表示            │

[ステップ2: 選択されたクレデンシャルの取得]
  │                                         │
  ├── AUTOFILL_FILL_REQUEST ─────────────►  │
  │   { entryId: "uuid" }                  │
  │                                         ├── vault復号
  │  ◄──────── AUTOFILL_FILL_DATA ────────  │
  │   { username, password }                │
  │                                         │
  ├── フィールドに入力                       │
  ├── クレデンシャルデータを即座に破棄         │
```

### 7.2 input.value setterの安全な使用

悪意ある第三者スクリプト（広告タグ等）が `HTMLInputElement.prototype` の `value` setterを上書きした場合、kuraがフィールドに書き込む際にそのスクリプトがクレデンシャルを横取りできる。

**対策：** Content ScriptはISOLATED world（ページスクリプトとは分離された実行環境）で動作するため、ページスクリプトが`HTMLInputElement.prototype`を上書きしても影響を受けない。Content Script側のprototypeは常にネイティブの状態が保たれる。

```typescript
// ISOLATED worldではprototypeがページスクリプトに汚染されないため、
// いつでも安全にネイティブsetterにアクセスできる
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype, 'value'
)!.set!;

// フィールド入力時：ネイティブsetterを直接呼び出す
function fillField(element: HTMLInputElement, value: string) {
  nativeInputValueSetter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
```

### 7.3 CSP制限への対応

一部のウェブサイトは厳格なContent Security Policyを設定しており、インラインスタイルやスクリプトの注入を制限する場合がある。

**対策：**
- オートフィルUIのスタイルは拡張機能のCSSファイルから読み込む（`chrome.runtime.getURL()`経由）
- Shadow DOMはページのCSPから分離されるため、ほとんどのケースで問題にならない
- manifest宣言によるContent Script注入はCSPの影響を受けない

### 7.4 HTTP vs HTTPSの取り扱い

> **未実装（将来対応予定）:** 現在の実装ではHTTP/HTTPSの区別による警告表示は行わない。

| ページ | 保存URL | 動作 |
|--------|---------|------|
| HTTPS | HTTPS | 通常通り候補を表示 |
| HTTPS | HTTP | 通常通り候補を表示（アップグレードは安全） |
| HTTP | HTTPS | 警告を表示した上で候補を表示（ダウングレード） |
| HTTP | HTTP | 通常通り候補を表示 |

HTTPページではオートフィルUI上に「このページは暗号化されていません」の警告を表示する。

## 8. URL/ドメインマッチング

### 8.1 eTLD+1ベースのマッチング

保存されたエントリのURLと現在のページURLを照合する際、eTLD+1（effective Top-Level Domain + 1）を基準とする。

```
URL: https://login.example.com/auth
  → eTLD+1: example.com

URL: https://www.example.co.jp/login
  → eTLD+1: example.co.jp
```

**デフォルトの照合ロジック：**
- ページのeTLD+1とエントリURLのeTLD+1が一致すれば候補として表示する
- `login.example.com`, `www.example.com`, `app.example.com` は全て同一と見なす

**eTLD+1の判定：** 一般的なマルチパートTLD（`co.jp`, `com.au`, `co.uk`, `blogspot.com`, `github.io`等）約60件をハードコードしたセットを使用する（`extension/src/shared/etld.ts`）。最長一致で判定し、該当しない場合は末尾2セグメントをeTLD+1とする。フルPSLのバンドルは将来対応予定。

### 8.2 サブドメイン厳密マッチ

> **未実装（将来対応予定）**

設定で有効化できるオプション。有効時は、完全なホスト名が一致するエントリのみを候補とする。

用途: `app.example.com`と`admin.example.com`で異なるクレデンシャルを持つユーザー向け。

### 8.3 URLなしのエントリ

URLが設定されていないエントリは、オートフィルの候補として自動表示しない。ポップアップからの手動検索でのみアクセスできる。

## 9. オートフィルUI

### 9.1 ドロップダウン表示

inputフィールドにフォーカスが当たり、かつ該当ドメインのクレデンシャルが存在する場合、フィールド直下にドロップダウンパネルを表示する。

**レンダリング方式：**
- `document.body`にShadow DOMコンテナを追加し、その中にドロップダウンをレンダリングする
- Shadow DOMによりページのCSSとkuraのUIスタイルが相互に干渉しない
- ドロップダウンの位置は対象inputの`getBoundingClientRect()`で算出し、スクロール/リサイズ時に更新する

**表示内容：**
- 各行: kuraアイコン + エントリ名 + ユーザー名
- 複数候補がある場合は全て表示（最大5件、超過時はスクロール）
- フッター: 「kura」ブランドテキスト

### 9.2 キーボード操作

| キー | 動作 |
|------|------|
| Arrow Down / Arrow Up | 候補を選択移動 |
| Enter | 選択中の候補で入力 |
| Escape | ドロップダウンを閉じる |
| Tab | ドロップダウンを閉じてフォーカスを移動 |

### 9.3 ドロップダウンの表示/非表示制御

| イベント | 動作 |
|---------|------|
| inputフィールドへのfocus | 候補があればドロップダウンを表示 |
| inputフィールドからのblur | 200ms遅延後にドロップダウンを非表示（クリック猶予） |
| Escape | 即座に非表示 |
| ページスクロール | 位置を更新（大きく移動した場合は非表示） |

> **未実装（将来対応予定）:** inputへの手動入力による候補のフィルタリング機能（入力テキストで候補を絞り込み、一致する候補がなくなった場合に非表示にする）。

### 9.4 ブラウザ内蔵autofillとの共存

kuraのドロップダウンはブラウザ内蔵のautofillドロップダウンと同時に表示される可能性がある。

**方針：**
- ブラウザのautofillを無効化する操作は行わない（`autocomplete="off"`を設定しない）
- 両方のドロップダウンが同時に表示されても、ユーザーがどちらかを選択できる
- これは1Password等の既存パスワードマネージャーと同じアプローチ

### 9.5 自動サブミット

> **未実装（将来対応予定）**

**デフォルト: 無効**

設定で有効化した場合の動作：
1. フォームにクレデンシャルを入力
2. 500ms待機（ユーザーにキャンセルの猶予を与える）
3. パターンDBで`submit`が定義されていればそれに従う
4. 未定義の場合は`<form>`要素の`submit()`を呼ぶ、またはsubmitボタンを`click()`する

**セキュリティ上の理由によりデフォルト無効：**
- フィッシングページへの自動送信を防ぐ
- ユーザーがドメインを確認する時間を確保する
- 追加のpre-submit検証があるサイトでの問題を回避

### 9.6 クレデンシャル保存/更新プロンプト

> **未実装（将来対応予定）**

フォーム送信後（`submit`イベントまたはナビゲーション検知時）、入力されたクレデンシャルがvaultと一致しない場合にプロンプトを表示する。

| 状況 | プロンプト |
|------|----------|
| 新規クレデンシャル（ドメインに一致するエントリなし） | 「このログイン情報を保存しますか？」 |
| 既存エントリのパスワードが異なる | 「パスワードを更新しますか？」 |
| 一致するエントリが既にある | プロンプトなし |

プロンプトはページ上部の通知バー、または拡張機能アイコンのバッジで表示する。

## 10. フィリング技法

### 10.1 フィールドの視認性チェック

フィールドへの入力前に、対象要素が実際にユーザーから見える状態にあることを確認する。これにより、invisible form/input（ページに埋め込まれた不可視フォーム）へのクレデンシャルの書き込みを防ぐことができる。

```typescript
function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    style.opacity !== '0'
  );
}

// 入力前に必ずチェック
if (!isVisible(targetField)) {
  console.warn('[kura] フィールドが非表示のため入力をスキップ:', targetField);
  return;
}
```

**対象となる攻撃シナリオ：** 正規サイトのページ内に広告等で invisible form が埋め込まれている場合、ヒューリスティックがそのフォームの input を検出してしまう可能性がある。ユーザーがオートフィルを選択すると invisible form にクレデンシャルが書き込まれ、ページスクリプトが `input` イベントを通じて値を読み取って送信できてしまう。視認性チェックによりこれを無効化する。

### 10.2 フレームワーク対応のイベントディスパッチ

単純な`input.value = "..."`の設定だけでは、React/Angular/Vueなどのフレームワークが変更を検知できない。以下の手順でフィールドに値を設定する。

```typescript
function fillField(element: HTMLInputElement, value: string) {
  // 1. フォーカスを当てる
  element.focus();
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  // 2. ネイティブsetterで値を設定（ページスクリプトによる上書き回避）
  nativeInputValueSetter.call(element, value);

  // 3. イベントをディスパッチ（フレームワークの変更検知を発火させる）
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // 4. キーボードイベントのシミュレーション（一部のサイトで必要）
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}
```

### 10.3 フィールド間のタイミング

複数フィールドを連続して入力する場合、フレームワークの状態更新を待つために各フィールド間にデフォルト30msの遅延を挿入する。

## 11. メッセージング設計

### 11.1 メッセージタイプ

`src/shared/messages.ts`で定義されたオートフィル関連のメッセージタイプ。

**Content Script → Service Worker（`chrome.runtime.sendMessage` + `sendResponse`コールバック）：**

| タイプ | ペイロード | レスポンス | 説明 |
|--------|----------|----------|------|
| `AUTOFILL_GET_CREDENTIALS` | `{ url: string }` | `{ credentials: AutofillCredentialCandidate[] }` | 指定URLに一致するクレデンシャル候補のリストを要求 |
| `AUTOFILL_FILL_REQUEST` | `{ entryId: string }` | `{ fillData: AutofillFillData }` | 選択されたエントリの完全なクレデンシャルを要求 |

レスポンスは`sendResponse`コールバックパターンで返却される（個別のプッシュメッセージではない）。

**Service Worker → Content Script（`chrome.tabs.sendMessage`経由のプッシュ通知）：**

| タイプ | ペイロード | 説明 |
|--------|----------|------|
| `AUTOFILL_VAULT_LOCKED` | `{}` | vaultがロックされたことの通知（UIを非表示にする） |

> **未実装（将来対応予定）:** `AUTOFILL_SAVE_CREDENTIALS`（新規クレデンシャル保存）、`AUTOFILL_UPDATE_CREDENTIALS`（パスワード更新）、`AUTOFILL_GET_TOTP`（TOTPコード取得）。

### 11.2 Service Worker側のVault状態管理

```typescript
// vaultロック時：全タブのContent Scriptに通知
function onVaultLocked() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_VAULT_LOCKED' });
      }
    });
  });
}

// vaultアンロック時：manifest宣言方式のため注入は不要（no-op）
function onVaultUnlocked() {
  // Content Scriptはmanifest宣言により常に注入済み
  // クレデンシャルの返却はService Worker側のアンロック状態チェックで制御する
}
```

Content Scriptはロック通知を受信すると、focusイベントリスナーの解除・ドロップダウンの破棄・初期化フラグのリセットを行い、オートフィル機能を完全に無効化する。