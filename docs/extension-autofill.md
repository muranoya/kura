<!-- doc-status: partial -->
# ブラウザ拡張オートフィル機能 仕様書

---

# Part 1: 機能仕様

## 1-1. 概要

ブラウザ拡張機能において、表示中のウェブページ上のフォーム（ログイン、クレジットカード等）を検出し、vaultに保存されたクレデンシャルの入力候補を表示・自動入力する機能。

### 対応範囲

**対応する機能：**
- フォーム検出（ヒューリスティック + パターンDB）
- クレデンシャル候補の表示（ドロップダウンUI）
- 選択されたクレデンシャルのフィールドへの自動入力
- 分割ログインフローでのエントリ引き継ぎ
- iframe内フォームへの対応

**対応しない機能：**
- 自動サブミット — フォームの送信（submitボタンのクリック等）は行わない。入力までを担い、送信はユーザーの意思で行う操作とする
- 新規クレデンシャルの自動保存 — フォーム送信を検知して「このパスワードを保存しますか？」と提案する機能は提供しない
- パスワード変更検知 — パスワード変更フォームの検出・既存エントリの更新提案は行わない

## 1-2. 対応フォームタイプ

| タイプ | 説明 | 例 |
|--------|------|-----|
| LOGIN | username + password が同一画面 | 大多数のウェブサイト |
| LOGIN_USERNAME | 分割ログインの1画面目（usernameのみ） | Google, Microsoft, Apple |
| LOGIN_PASSWORD | 分割ログインの2画面目（passwordのみ） | Google, Microsoft, Apple |
| TOTP | 6桁コード入力フィールド | 2FA認証画面 |
| CREDIT_CARD | カード番号/有効期限/CVV | 決済フォーム |

> **実装状況:** 全フォームタイプ（LOGIN, LOGIN_USERNAME, LOGIN_PASSWORD, TOTP, CREDIT_CARD）に対応済み。フィールド分類ロジックとフォーム検出の両方が有効。

## 1-3. URL/ドメインマッチング

保存されたエントリのURLと現在のページURLを照合し、候補を絞り込む。

### 1-3.1 eTLD+1ベースのマッチング

eTLD+1（effective Top-Level Domain + 1）を基準に照合する。

```
URL: https://login.example.com/auth
  → eTLD+1: example.com

URL: https://www.example.co.jp/login
  → eTLD+1: example.co.jp
```

- ページのeTLD+1とエントリURLのeTLD+1が一致すれば候補として表示する
- `login.example.com`, `www.example.com`, `app.example.com` は全て同一と見なす

### 1-3.2 サブドメイン厳密マッチ

> **未実装（将来対応予定）:** [パターンDB](extension-pattern-db.md)の実装時にサイト固有設定として実装する。

デフォルトではeTLD+1マッチにより、同一ドメイン内のサブドメインは全て同じクレデンシャル候補を共有する。サブドメインごとに異なるクレデンシャルを使い分けたい場合、パターンDBのサイト固有パターンで `match.strict_subdomain: true` を指定することで、完全なホスト名が一致するエントリのみを候補とする。

| `strict_subdomain` | ページURL | エントリURL | マッチ |
|---------------------|-----------|------------|--------|
| `false`（デフォルト） | `app.example.com` | `https://admin.example.com` | Yes（eTLD+1一致） |
| `true` | `app.example.com` | `https://admin.example.com` | No（ホスト名不一致） |
| `true` | `app.example.com` | `https://app.example.com` | Yes（ホスト名一致） |

- パターンDBにサイト固有パターンがないサイトでは、常にデフォルトのeTLD+1マッチが適用される
- グローバル設定としてのON/OFFは提供しない（サイトごとに制御が必要なため）

用途: `app.example.com`と`admin.example.com`で異なるクレデンシャルを持つユーザー向け。

### 1-3.3 URLなしのエントリ

URLが設定されていないエントリは、オートフィルの候補として自動表示しない。ポップアップからの手動検索でのみアクセスできる。

## 1-4. オートフィルUI

### 1-4.1 ドロップダウン表示

inputフィールドにフォーカスが当たり、かつ該当ドメインのクレデンシャルが存在する場合、フィールド直下にドロップダウンパネルを表示する。

**表示内容：**
- 各行: kuraアイコン + エントリ名 + ユーザー名
- 複数候補がある場合は全て表示（最大5件、超過時はスクロール）
- フッター: 「kura」ブランドテキスト

**HTTPページの警告：** HTTPページでは、オートフィルUI上に常に「このページは暗号化されていません」の警告を表示する。クレデンシャルの候補表示自体はブロックしない（ユーザーの判断に委ねる）。

> **実装済み:** HTTPページでオートフィルドロップダウンを表示する際、上部に警告バナーを表示する。

### 1-4.2 キーボード操作

| キー | 動作 |
|------|------|
| Arrow Down / Arrow Up | 候補を選択移動 |
| Enter | 選択中の候補で入力 |
| Escape | ドロップダウンを閉じる |
| Tab | ドロップダウンを閉じてフォーカスを移動 |

### 1-4.3 ドロップダウンの表示/非表示制御

| イベント | 動作 |
|---------|------|
| inputフィールドへのfocus | 候補があればドロップダウンを表示 |
| inputフィールドからのblur | 200ms遅延後にドロップダウンを非表示（クリック猶予） |
| Escape | 即座に非表示 |
| ページスクロール | 位置を更新（大きく移動した場合は非表示） |

### 1-4.4 ブラウザ内蔵autofillとの共存

- ブラウザのautofillを無効化する操作は行わない（`autocomplete="off"`を設定しない）
- 両方のドロップダウンが同時に表示されても、ユーザーがどちらかを選択できる
- これは1Password等の既存パスワードマネージャーと同じアプローチ

## 1-5. 分割ログインフロー

Google、Microsoft、Apple等では、usernameとpasswordが別画面に分割されている。

**ユーザーから見た動作：**

1. 1画面目（username）でオートフィルドロップダウンからエントリを選択し、usernameが入力される
2. ユーザーがsubmitして2画面目（password）に遷移する
3. 2画面目では自動的に同じエントリのパスワードが入力される（ドロップダウンの再選択は不要）
4. エントリにTOTPが設定されている場合、3画面目（TOTP）でも同様に自動入力される

2画面目以降の自動入力はタイムアウト（5分）で無効になる。タブを閉じた場合も無効になる。

## 1-6. 手動クレデンシャルキャプチャ

> **実装済み**

ウェブページ上でユーザーが入力したクレデンシャルを、手動操作でvaultに保存する機能。フォーム送信の自動検知は行わず、ユーザーがポップアップから明示的にキャプチャモードを開始する。

**設計判断:** フォーム送信の自動検知（submitイベント、beforeunload、MutationObserver等）によるクレデンシャルキャプチャは、以下の理由から採用しない:

- ヒューリスティックによるREGISTRATION/PASSWORD_CHANGEフォーム検出の精度・メンテナンスコストが高い
- OAuth、マジックリンク、パスキー等、パスワード不要な認証フローが増加しており、自動検知の対象範囲が縮小している
- `beforeunload`でのService Workerへのメッセージ送信は到達が保証されない
- MutationObserverではフォーム送信と単なるページ遷移の区別がつかない

パスワード生成はポップアップUIの既存機能で対応する。

**ユーザーから見た動作：**

1. ポップアップの「このページのクレデンシャルを保存」ボタンをクリック（vaultロック中は非表示）
2. ポップアップが閉じ、ページ上にキャプチャUIが表示される
3. inputフィールドにマウスホバーするとハイライトされる
4. フィールドをクリックすると役割選択のポップオーバーが表示される（「ユーザー名」「パスワード」「スキップ」）
5. 指定済みフィールドにはバッジ（「ユーザー名」「パスワード」）が表示される
6. 「保存する」をクリックすると、指定フィールドの値がvaultに新規エントリとして保存される
7. 保存結果がトースト通知で表示され、キャプチャモードが終了する

**終了条件：**

| 条件 | 動作 |
|------|------|
| 「保存する」クリック | 保存処理後に終了 |
| 「キャンセル」クリック | 即座に終了 |
| Escキー | 即座に終了 |
| ページ遷移 | 自然に終了 |
| vaultロック | トースト表示して終了 |

---

# Part 2: アーキテクチャ

## 2-1. 全体構成

```
ウェブページ
  └── Content Script（manifest宣言による自動注入）
        ├── フォーム検出（ヒューリスティック / パターンDB）
        ├── オートフィルUI（Shadow DOM内ドロップダウン）
        └── フィールド入力
              ↕ chrome.runtime.sendMessage
Service Worker
  ├── クレデンシャル照合（URL/ドメインマッチング）
  └── WASM (vault_core)
        └── 暗号化・復号
```

Content Scriptは`manifest.json`の`content_scripts`宣言により全ページに自動注入される。ページ上のフォームを検出し、Service Workerにクレデンシャルを問い合わせる。Service WorkerはWASM経由でvaultを復号し、該当するクレデンシャルをContent Scriptに返す。Content Scriptはフォームに値を入力する。

## 2-2. コンテンツスクリプト注入戦略

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

**`<all_urls>`を使用する理由：** パスワードマネージャーはユーザーが登録しているあらゆるサイトでオートフィルを提供する必要があるため、対象ドメインを事前に限定することができない。最小権限の原則から外れるが、この性質上避けられない。

## 2-3. メッセージング設計

### 2-3.1 メッセージタイプ

`src/shared/messages.ts`で定義されたオートフィル関連のメッセージタイプ。

**Content Script → Service Worker（`chrome.runtime.sendMessage` + `sendResponse`コールバック）：**

| タイプ | ペイロード | レスポンス | 説明 |
|--------|----------|----------|------|
| `AUTOFILL_GET_CREDENTIALS` | `{ url: string }` | `{ credentials: AutofillCredentialCandidate[] }` | 指定URLに一致するクレデンシャル候補のリストを要求 |
| `AUTOFILL_FILL_REQUEST` | `{ entryId: string }` | `{ fillData: AutofillFillData }` | 選択されたエントリの完全なクレデンシャルを要求 |
| `AUTOFILL_SAVE_CAPTURED` | `{ url: string, username: string \| null, password: string }` | `{ success: boolean, entryId: string }` | 手動キャプチャしたクレデンシャルを新規エントリとしてvaultに保存（Section 1-6参照） |

レスポンスは`sendResponse`コールバックパターンで返却される（個別のプッシュメッセージではない）。

**Popup → Service Worker（`chrome.runtime.sendMessage`）：**

| タイプ | ペイロード | 説明 |
|--------|----------|------|
| `AUTOFILL_START_CAPTURE` | `{}` | アクティブタブでのクレデンシャルキャプチャモード開始を要求。Service WorkerがアクティブタブのContent Scriptに転送する（Section 1-6参照） |

**Service Worker → Content Script（`chrome.tabs.sendMessage`経由のプッシュ通知）：**

| タイプ | ペイロード | 説明 |
|--------|----------|------|
| `AUTOFILL_VAULT_LOCKED` | `{}` | vaultがロックされたことの通知（UIを非表示にする） |
| `AUTOFILL_START_CAPTURE` | `{}` | クレデンシャルキャプチャモードの開始指示（Popupからの転送） |

> **実装済み:** 全メッセージタイプ（`AUTOFILL_GET_CREDENTIALS`, `AUTOFILL_FILL_REQUEST`, `AUTOFILL_GET_TOTP`, `AUTOFILL_GET_CREDIT_CARDS`, `AUTOFILL_PENDING_FLOW_STORE` / `AUTOFILL_PENDING_FLOW_QUERY`, `AUTOFILL_START_CAPTURE`, `AUTOFILL_SAVE_CAPTURED`）が実装済み。

### 2-3.2 Service Worker側のVault状態管理

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

## 2-4. セキュリティ設計

オートフィル機能全体に適用されるセキュリティ方針。各個別設計でのセキュリティ関連の判断はここの方針に基づく。

### 2-4.1 クレデンシャルの最小露出

Content Scriptはvault全体やDEKにアクセスしない。クレデンシャルの受け渡しは2段階に分け、必要な情報のみを必要なタイミングで渡す。

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

### 2-4.2 ISOLATED worldによるページスクリプトからの隔離

Content ScriptはISOLATED world（ページスクリプトとは分離された実行環境）で動作する。これにより：

- ページスクリプトが`HTMLInputElement.prototype`のsetterを上書きしても、Content Script側のprototypeは常にネイティブの状態が保たれる
- 悪意ある第三者スクリプト（広告タグ等）がクレデンシャルを横取りすることを防ぐ

### 2-4.3 不可視フォームへの入力防止

フィールドへの入力前に対象要素の視認性をチェックし、不可視のフォーム（invisible form攻撃）へのクレデンシャル書き込みを防ぐ。正規サイトのページ内に広告等でinvisible formが埋め込まれている場合の攻撃を無効化する。

### 2-4.4 CSP制限への対応

一部のウェブサイトは厳格なContent Security Policyを設定しており、インラインスタイルやスクリプトの注入を制限する場合がある。

- オートフィルUIのスタイルは拡張機能のCSSファイルから読み込む（`chrome.runtime.getURL()`経由）
- Shadow DOMはページのCSPから分離されるため、ほとんどのケースで問題にならない
- manifest宣言によるContent Script注入はCSPの影響を受けない

### 2-4.5 HTTPページの取り扱い

HTTPページではクレデンシャルが平文で送信されるリスクがある。候補表示自体はブロックしないが、オートフィルUI上に常に警告を表示してユーザーの判断に委ねる（Section 1-4.1参照）。

---

# Part 3: 個別設計

## 3-1. フォーム検出ヒューリスティック

汎用ヒューリスティックでフォームを検出する。

### 3-1.1 重み付きシグナル方式

各inputフィールドに対して、複数のシグナルソースから重み付きスコアを算出し、フィールドの役割（username、password等）を判定する。

| 優先度 | シグナルソース | 重み | 説明 |
|--------|---------------|------|------|
| 1 | `autocomplete`属性 | 10 | HTML仕様準拠。`username`, `current-password`, `cc-number`等。存在すれば最も信頼性が高い |
| 2 | `type`属性 | 8 | `type="password"`はほぼ確定的。`type="email"`, `type="tel"`はpasswordフィールドの近くにあればusername候補 |
| 3 | `name` / `id`属性 | 6 | 既知のパターンとマッチング: `/^(user\|email\|login\|account\|phone)/i`, `/^(pass\|pwd\|senha\|contrase)/i`, `/^(otp\|totp\|code\|token\|verify)/i` |
| 4 | `aria-label` / `placeholder` / `title` | 4 | ローカライズされたテキストシグナル。汎用的な`name`属性を持つサイトで有効 |
| 5 | 関連`<label>`テキスト | 4 | `for`属性による紐付け、またはDOM親要素の走査で発見 |
| 6 | ページURLコンテキスト | 2 | パスに`/login`, `/signin`, `/auth`, `/register`, `/signup`を含む。タイブレーカーとしてのみ使用 |

**スコアの使われ方：** 各フィールドについて、マッチしたシグナルの重みを合算してフィールドタイプごとのスコアを計算し、最もスコアが高いタイプに分類する。例えば `autocomplete="username"`（+10）かつ `name="email"`（+6）を持つフィールドはusernameスコアが16となり、他のタイプより高ければusernameと判定される。スコアが同点の場合は優先度の高いシグナルが勝つ。いずれのタイプにも閾値（最低スコア）に満たない場合は分類不能として無視する。

### 3-1.2 フォームタイプ分類アルゴリズム

各`<form>`要素（またはフォームライクなコンテナ）に対して：

1. 内部のvisibleな`<input>`要素を収集する
2. 各inputに対して11.1のシグナル方式でフィールドタイプ（username / password / totp / cc_number 等）を判定する
3. 判定されたフィールドの組み合わせからフォームタイプを分類する：

```
username候補 1つ + password 1つ          → LOGIN
username候補 1つ + password 0            → LOGIN_USERNAME
password 1つ + username候補 0            → LOGIN_PASSWORD
短い数値入力 1つ (4-8桁, maxlength制限)   → TOTP
cc-number + cc-exp + cc-cvc              → CREDIT_CARD
```

### 3-1.3 フォームレスフィールドへの対応

モダンSPAでは`<form>`要素なしでinputフィールドが配置されることが多い（例: Gmailのログイン）。

- visibleな`<input type="password">`を起点として検索する
- 近傍のinputフィールドを、DOM構造上の共通祖先（3〜4階層以内）でクラスタリングする
- クラスタ単位でフォームタイプ分類を適用する

### 3-1.4 デフォルトヒューリスティック設定

パターンDBにサイト固有の定義がないページに適用される、汎用的なフォーム検出ルール。

ヒューリスティックの内容（フィールドシグナルのパターン、スキップセレクタ、フォーム分類ルール）はソースコード上で定義し、Section 3-1.1の重み付きシグナル方式に従って実装する。具体的なシグナル定義は以下の通り。

**フィールドシグナル定義：**

| フィールドタイプ | autocomplete値 | typeヒント | name/idパターン |
|----------------|---------------|-----------|----------------|
| username | `username` | `email`, `tel`, `text` | `^(user\|email\|login\|account\|phone\|id)` |
| password | `current-password` | `password` | `^(pass\|pwd\|senha\|contrase)` |
| totp | `one-time-code` | `text`, `number`, `tel` | `^(otp\|totp\|code\|token\|verify\|mfa\|2fa)` |
| cc_number | `cc-number` | — | `^(card.?num\|cc.?num\|credit)` |
| cc_exp | `cc-exp`, `cc-exp-month`, `cc-exp-year` | — | `^(exp\|valid)` |
| cc_cvc | `cc-csc`, `cc-cvc`, `cc-cvv` | — | `^(cvc\|cvv\|csc\|security.?code)` |
| cc_name | `cc-name` | — | `^(card.?holder\|cc.?name)` |

**スキップ対象（検出から除外）：** `username`や`totp`のtypeヒントに`text`等の汎用型が含まれるため、検索フィールドがtype属性だけでスコア閾値を超えて誤検出される。これを防ぐため、以下のセレクタ・属性パターンに一致するフィールドはシグナル評価の前にスキップする。

`input[type='search']`、`input[role='searchbox']`、`input[aria-label*='search' i]`、`input[name*='search' i]`、`input[name*='query' i]`、`input[name*='keyword' i]`

## 3-2. SPA・動的コンテンツ検知

### 3-2.1 スキャントリガー

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
- カスタム入力コンポーネント（Web Components等）: 内部の `<input>` がOpen Shadow DOM内にある場合はfocusイベントのバブリングで捕捉できる（Section 3-2.3参照）

**MutationObserverを廃止した理由：** SPAで動的追加されたフィールドも、ユーザーがフォーカスした瞬間にキャプチャできるため、DOM監視は不要。デバウンスやパフォーマンスガードといった複雑な仕組みも省ける。

**`autofocus`属性のフィールドについて：** ブラウザが自動フォーカスするため、focusイベントが捕捉できない場合がある。ただし、ユーザーの明示的なアクションなしに候補を表示することになるため、意図的に無視する。

### 3-2.2 SPAナビゲーション検知

SPA遷移後に新しいフォームが出現した場合も、ユーザーがそのフィールドにフォーカスした時点でfocusイベント（Section 3-2.1）が検出する。

**分割ログインフローとの関係：** SPA型の分割ログイン（URLが変わらずDOMのみ書き換わるケース）も、パスワードフィールドへのフォーカス時に検出する。通常のページ遷移型（Google, Microsoft等）は、遷移後の新しいContent ScriptのfocusイベントハンドラがService Workerの`pendingLoginFlows`を参照することで同一フローとして扱われる（Section 3-5参照）。

### 3-2.3 Shadow DOM

- **Open Shadow Root**（`element.shadowRoot`にアクセス可能）: focusイベントはShadow DOM境界を越えてバブリングするため、追加の設定なしに捕捉できる。
- **Closed Shadow Root**（アクセス不可）: 対応不可。既知の制限として受け入れる。

### 3-2.4 iframe

> **実装済み:** `all_frames: true` によりiframe内にもContent Scriptが注入される。各iframe内のContent Scriptは独立インスタンスとして動作し、`window.location.href`でiframe自身のURLを取得してService Workerに送信する。

- **Same-origin iframe**: `all_frames: true` で各iframeにContent Scriptのインスタンスを注入する。各インスタンスはiframe自身のURL（`window.location`）のドメインをService Workerに送信し、そのドメインに合致するクレデンシャルをサジェストする。親ページのドメインではなくiframe自身のドメインを使う点に注意。
- **Cross-origin iframe**: `content_scripts.matches`が`<all_urls>`のため、cross-origin iframeにも注入される。
- **既知の制限**: ドロップダウンUIはiframe内の`document.body`に描画されるため、iframeの境界を超えて表示することはできない。iframeが小さい場合、ドロップダウンが切れる可能性がある。
- **Closed Shadow Root内のiframe**: 対応不可。既知の制限として受け入れる。

## 3-3. パターンDB

> **未実装（将来対応予定）:** パターンDBシステムは未実装。現在はSection 3-1のヒューリスティック検出のみで動作する。

サイト固有のフォーム検出ルールをJSONで管理するシステム。ヒューリスティック検出では対応できないサイトに対して、セレクタベースのフォーム定義を提供する。

詳細は [`docs/extension-pattern-db.md`](extension-pattern-db.md) を参照。

## 3-4. URL/ドメインマッチング実装

Section 1-3で定義したマッチング仕様の実装詳細。

### 3-4.1 eTLD+1の判定

> **実装済み**

[Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat)（PSL）を使用する。リポジトリの`assets/public_suffix_list.dat`にPSLを配置しておき、`extension/scripts/update-psl.ts`で手動更新する。ビルド時にTypeScriptのソースコード（ルックアップ用データ構造）に変換してバンドルする。最長一致で判定し、該当しない場合はデフォルト（最後のラベルがTLD）として処理する。

**ビルド時処理：**

1. `extension/scripts/generate-etld.ts`が`assets/public_suffix_list.dat`を読み込む
2. コメント行・空行を除去し、通常ルール・ワイルドカード・例外をパースする
3. `extension/src/shared/etld-data.generated.ts`に3つのSetとして出力する
4. `extension/src/shared/etld.ts`がこのデータをimportしてPSLルックアップを実行する
5. バンドルに含める（ランタイムでの外部リクエストは不要）

## 3-5. 分割ログインフロー実装

Section 1-5で定義した分割ログインフローの実装詳細。

> **実装済み:** LOGIN_USERNAMEフォームでクレデンシャルが選択されると、Service Workerの`pendingLoginFlows`にtabId・ドメイン・エントリIDを保存する。次のLOGIN_PASSWORDフォームで同一タブ・同一ドメインのpending flowが存在すれば、ドロップダウンを表示せず自動的にパスワードを入力する。タイムアウトは5分、タブクローズ時に自動クリーンアップされる。

### 3-5.1 pendingLoginFlows

Service WorkerのインメモリMapでフロー状態を管理する。Content Scriptはページ遷移で破棄されるため、クロスページの状態保持にはService Workerを使う必要がある（セキュリティ方針 Section 2-4.2 により、sessionStorageはページスクリプトから読み取り可能なため使用しない）。

```typescript
// Service Worker
const pendingLoginFlows = new Map<number, {
  domain: string;
  entryId: string;
  username: string;
  timestamp: number;
}>();

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingLoginFlows.delete(tabId);
});
```

**検知フロー：**

1. LOGIN_USERNAMEフォームを検出し、kuraがusernameを入力（またはユーザーが手動入力）
2. Service WorkerのメモリにtabIdをキーとして `pendingLoginFlows.set(tabId, { domain, entryId, username, timestamp })` を保存
3. 次のページ/DOM状態でLOGIN_PASSWORDフォームを検出した場合、`pendingLoginFlows`を参照して同一フローとして扱う
4. タイムアウト（5分）経過後、またはタブクローズ時（`chrome.tabs.onRemoved`）に`pendingLoginFlows`から削除する

**Service Worker再起動時の挙動：** `pendingLoginFlows`はインメモリMapに保持されるため、Service Workerが予期せず再起動した場合（ブラウザによるアイドル停止等）、保持中のデータは消失する。これは想定された動作であり、ユーザーは分割ログインの2画面目で手動でクレデンシャルを選択し直す必要がある。

## 3-6. フィリング技法

### 3-6.1 フィールドの視認性チェック

フィールドへの入力前に、対象要素が実際にユーザーから見える状態にあることを確認する（セキュリティ方針 Section 2-4.3）。

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

### 3-6.2 フレームワーク対応のイベントディスパッチ

単純な`input.value = "..."`の設定だけでは、React/Angular/Vueなどのフレームワークが変更を検知できない。以下の手順でフィールドに値を設定する。ISOLATED worldのネイティブsetterを使用する（セキュリティ方針 Section 2-4.2）。

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

### 3-6.3 フィールド間のタイミング

複数フィールドを連続して入力する場合、フレームワークの状態更新を待つために各フィールド間にデフォルト30msの遅延を挿入する。

## 3-7. 手動クレデンシャルキャプチャ実装

> **実装済み**

Section 1-6で定義した手動クレデンシャルキャプチャの実装詳細。

### 3-7.1 キャプチャモード開始フロー

```
Popup                    Service Worker              Content Script
  │                           │                           │
  ├─ AUTOFILL_START_CAPTURE ─►│                           │
  │  (fire-and-forget)        │                           │
  │  ポップアップは閉じる       ├─ AUTOFILL_START_CAPTURE ─►│
  │                           │  (chrome.tabs.sendMessage) │
  │                           │                           ├─ キャプチャモード開始
  │                           │                           │
```

1. ユーザーがポップアップで「このページのクレデンシャルを保存」ボタンをクリック
2. ポップアップがService Workerに`AUTOFILL_START_CAPTURE`を送信（fire-and-forget）
3. ポップアップは閉じる（送信完了を待たない）
4. Service WorkerがアクティブタブのContent Scriptに`AUTOFILL_START_CAPTURE`を転送（`chrome.tabs.sendMessage`）
5. Content Scriptがキャプチャモードに入る

### 3-7.2 キャプチャモードUI

キャプチャモード中、Content Scriptはページ上にキャプチャUIを表示する。Shadow DOMホスト内にレンダリングし、ページのCSSとの干渉を防ぐ（オートフィルドロップダウンと同じホストを共有）。

**フィールド選択:**

- ページ上のinputフィールドにマウスホバーすると、ハイライト（枠線 + 背景色変更）を表示する
- フィールドをクリックすると、役割選択のポップオーバーを表示する:
  - 「ユーザー名」: クリックしたフィールドをusernameとして指定
  - 「パスワード」: クリックしたフィールドをpasswordとして指定
  - 「スキップ」: 指定をキャンセル
- 指定済みフィールドにはバッジ（「ユーザー名」「パスワード」）を表示する
- 同じ役割を別のフィールドに再指定すると、前の指定は解除される

### 3-7.3 保存処理

1. 「保存する」クリック時、Content Scriptが指定フィールドの`element.value`を読み取る（ISOLATED worldで動作するため、ページスクリプトによるgetter上書きの影響を受けない — セキュリティ方針 Section 2-4.2）
2. Content ScriptがService Workerに`AUTOFILL_SAVE_CAPTURED`を送信:
   ```typescript
   {
     url: string;            // window.location.href
     username: string | null; // usernameフィールドの値（未指定ならnull）
     password: string;        // passwordフィールドの値
   }
   ```
3. Service Worker側の処理:
   - vaultがアンロック状態であることを確認
   - URLからドメイン名を抽出し、エントリ名のデフォルト値とする（例: `example.com`）
   - `api_create_entry`でloginタイプのエントリを作成する
     - `typed_value`: `{ url, username, password, totp: null }`
     - ラベル: なし、カスタムフィールド: なし
   - ローカル保存（`saveLocally`）+ 自動同期（`autoSync`）を実行
   - 結果をContent Scriptにレスポンスとして返却
4. Content Scriptが保存結果を表示（成功/失敗のトースト通知）し、キャプチャモードを終了する

**vaultロック中の場合:** ポップアップの「このページのクレデンシャルを保存」ボタンはvaultロック中は非表示（またはdisabled）とする。キャプチャモード中にvaultがロックされた場合は、キャプチャモードを終了し「vaultがロックされました」のトースト通知を表示する。

### 3-7.4 Service Worker再起動の影響

このフローではService Workerにインメモリ状態を保持しない。キャプチャモードの状態はContent Scriptのメモリに保持されるため、Service Workerの予期せぬ再起動の影響を受けない。ページ遷移時はContent Scriptが破棄されるため、キャプチャモードも自然に終了する。
