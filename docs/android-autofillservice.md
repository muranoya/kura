<!-- doc-status: implemented -->

# Android AutofillService 実装方針

# Part 1: 機能仕様

## 1-1. 概要

AndroidのAutofillFrameworkに対応する`AutofillService`を実装し、**他アプリ（ネイティブアプリ）およびブラウザで表示中のウェブサイト**のログインフォームに対してvault内のクレデンシャルを自動入力できるようにする。ただしログインフォームに限定されており、クレジットカード等の他フォーム種別については未対応。

### 対応範囲

**対応する機能：**

- ネイティブアプリのログインフォーム（username + password）の検出
- ブラウザ（Chrome/Firefox/WebView）で表示中のウェブサイトのログインフォーム（username + password）の検出
- ネイティブアプリ・ブラウザ双方のTOTP（2段階認証コード）フィールドの検出とオートフィル（同一フォーム内のusername/password同居ケース、ログイン後に出るTOTP専用画面の両方に対応。
- パッケージ名ベースのマッチング／`webDomain`ベースのマッチング
- vaultロック中の認証プロンプト経由でのオートフィル
- クレデンシャル候補の選択・自動入力

**対応しない機能：**

- 新規ログイン情報の保存提案（`onSaveRequest`） — フォーム送信を検知して「このパスワードをkuraに保存しますか？」と提案する機能は実装しない
- クレジットカード等、login以外のエントリタイプのオートフィル（ネイティブアプリ・ブラウザ共通）
- 分割ログインフロー（usernameとpasswordが別画面）の引き継ぎ — ブラウザ拡張のような画面間の状態引き継ぎは行わず、各`onFillRequest`は独立して処理する

## 1-2. 対応フォームタイプ


| タイプ   | 説明                                                     |
| ----- | ------------------------------------------------------ |
| LOGIN | username + password のペア。両方、またはpasswordのみのフィールド集合を対象とする |
| TOTP  | 2段階認証コード入力欄。LOGINと同一フォームに同居する場合と、ログイン後に出る専用画面（username/passwordなし）の両方を対象とする |


分割ログイン（username単体の画面）はブラウザ拡張と異なり、Android Autofillフレームワークでは各`onFillRequest`が単一の`AssistStructure`スナップショットとして独立に届く。画面間の状態を引き継ぐService Worker相当の仕組みは設けず、usernameフィールドのみの画面ではusername候補のみを提示する。TOTP専用画面（2段階認証画面）も同様に、その`onFillRequest`単体で完結する形で候補を提示する。

## 1-3. マッチング方式（パッケージ名ベース）

**本セクションはネイティブアプリ由来リクエスト（`structure.getWebDomain()`が全ノードでnullの場合）にのみ適用される。** ブラウザ由来リクエストは`getWebDomain()`から直接ドメインが取得できるため、本セクションのパッケージ名⇔ドメインマッピングファイルは不要であり、別の方式を取る。

ネイティブアプリからのリクエストでは、`AssistStructure.getActivityComponent().getPackageName()`からリクエスト元のパッケージ名が分かる。

Android標準のベストプラクティスであるDigital Asset Links（`assetlinks.json`によるアプリ⇔ウェブサイトの検証）は、対象ウェブサイト側が`assetlinks.json`を用意している必要があり、定期的に全パスワードエントリを走査して、`assetlinks.json`を収集し保持する必要がある。`assetlinks.json`の管理と定期更新処理は煩雑なため採用しない。

なりすまし対策として、パッケージ名⇔ドメインマッピングにDigital Asset Links（`assetlinks.json`）から取得したCert SHA-256 Fingerprintsを記録し、Autofill時に実際の署名証明書のフィンガープリントと突き合わせることで、同一パッケージ名を騙る偽アプリへのクレデンシャル流出を防ぐ案も検討した。しかし主要アプリの`assetlinks.json`を実際に収集したところ、Cert SHA-256 Fingerprintsが更新されておらず、実際に配布されているアプリの署名と一致しないケースが多数見つかった。アプリを実機にインストールして実物のCert SHA-256 Fingerprintsを取得し、それをアプリにバンドルする方式も検討したが、対象アプリが更新されるたびにフィンガープリントも追従させる必要がありメンテナンスコストが非常に高いため、この方式は断念した。結果として、Cert SHA-256 Fingerprintsによるアプリの正当性検証は行わないこととした。

また、Android 12 (API 31) で導入された`DomainVerificationManager` APIを使用してパッケージ名とドメインの検証済み関連付けを動的に取得することも検討した。**自分自身以外のアプリのドメイン情報を取得するには、原則`QUERY_ALL_PACKAGES`権限が必要**となる。この権限はGoogle Play Storeで厳しく制限されている。KuraはGoogle Play Storeでの配布は予定していないため技術的には問題ないが、**インストール済みアプリ一覧を丸ごと取得できてしまう点はアプリの信頼性を保つ観点から避けたい**。

ただし、Android 11以降のパッケージ可視性（Package Visibility）の仕組み上、Manifestの`<queries>`要素に対象パッケージ名を個別に列挙する形であれば、`QUERY_ALL_PACKAGES`を使わずに特定パッケージへの可視性のみを得られる可能性がある。この方式であれば「インストール済みアプリ一覧を丸ごと取得できてしまう」という懸念も原理的には回避でき、`package_domains.json`で管理する既知パッケージのみを`<queries>`に列挙する形であれば両立しうる。そのためこの案は完全に却下したわけではなく、今後の検討課題として残しており、現時点ではパターンファイルに依存する実装を採用している。

代わりに、**リポジトリで管理するパッケージ名⇔ドメインの手動マッピングファイル**を新設する。これはウェブブラウザ拡張のパターンファイルと同じ思想であり、外部の検証情報や機微な権限に依存せず、既知の主要アプリについて確実なマッチングを提供する。

- 未登録パッケージは候補を一切表示しない（誤マッチより「候補なし」を優先する安全側デフォルト）
- ヒューリスティックな推測（パッケージ名からドメインを機械的に導出する等）は行わない。`com.example.android` → `example.com`のような単純な変換は誤マッチが多く、field-classifierを保守的に保つという既存の設計方針と同様の考え方に反するため

## 1-4. オートフィルUI

`FillResponse`に候補（`Dataset`）を積んで返す。各`Dataset`はエントリ名を表示ラベルとし、選択されるとusername/passwordフィールドに値が入力される。

- vaultがアンロック済みの場合: マッチしたエントリをそのまま`Dataset`として提示する
- vaultがロック中の場合: 認証プレースホルダーの`Dataset`を1件提示し、選択すると認証フローに入る
- マッチする候補が0件（アンロック済みで該当エントリなし、またはロック中でも該当なしと判定できない場合を除く）の場合、候補自体を提示しない

TOTPフィールドを含む候補は、username/password用の`Dataset`とは**別の`Dataset`**として1件追加で提示する（1候補につき最大2つの`Dataset`が並ぶ）。

## 1-5. TOTPオートフィルの詳細

TOTPコードは既定30秒で失効するため、username/passwordのように`onFillRequest`時点でまとめて生成・埋め込む方式はそのまま使えない。ユーザーが候補を選ぶまでの間にコードが失効している恐れがあるためである。

そのため、TOTP用の`Dataset`はAndroid Autofillの**Dataset単位認証**（`Dataset.Builder.setAuthentication(IntentSender)`）を利用し、コード自体は`onFillRequest`時点では生成しない。ユーザーがTOTP候補をタップした瞬間に`AutofillTotpResolveActivity`（トランポリンActivity）が起動し、その場で最新のコードを生成した`Dataset`を返す。

- `onFillRequest`時点では、対象エントリがTOTPカスタムフィールド（`CustomFieldType.Totp`）を持つかどうかのみを確認する（コードそのものは生成しない。クレデンシャル最小露出の原則）
- `AutofillTotpResolveActivity`は選択の瞬間に`generateTotpFromValue`（vault-core、既存API）でコードを生成し、`Dataset`を`EXTRA_AUTHENTICATION_RESULT`として返す（`AutofillUnlockActivity`が`FillResponse`を返すのとは型が異なる点に注意）
- `onFillRequest`時点でvaultがアンロック済みでも、ユーザーが候補をタップするまでの間に自動ロックタイマーで再ロックされている可能性があるため、`AutofillTotpResolveActivity`は`AutofillUnlockActivity`と同じ認証フロー（`AutofillAuthScreen`）を経由してから解決する
- TOTPフィールドの検出は`FieldClassifier`のヒューリスティックスコアリングに委ねる。Android Autofillフレームワークにはワンタイムコード専用の`autofillHints`定数は存在しないため、`idEntry`/`hint`の正規表現（`otp`, `totp`, `verification code`, `認証コード`等）を主要シグナルとし、`inputType`（数値クラス等）は単独では判定に使わない弱いシグナルとして扱う。**この判定シグナルはネイティブアプリの`ViewNode`属性が前提であり、ブラウザ由来リクエストでは`idEntry`は意味を持たない。** ブラウザ由来リクエストでのTOTPフィールド検出は`htmlAttributes`（`name`/`id`/`autocomplete="one-time-code"`等）を対象とする必要があり、シグナルの一覧・優先順位はネイティブアプリとは別建てで扱う。なお、選択時にコードを生成する`AutofillTotpResolveActivity`によるDataset単位認証の仕組み自体は、リクエスト元によらず共通のアーキテクチャとして再利用できる

## 1-6. ブラウザ経由のウェブサイトオートフィル

### 1-6-1. 実機検証で判明した事実

以下4パターンの`AssistStructure`をJSONダンプし解析した

* ネイティブアプリのログイン画面
* アプリ内WebView、Chromiumベース
* Firefoxでログイン画面を開いたケース
* Chromeでログイン画面を開いたケース

**(a) フォームの祖先構造 — 3ブラウザ共通でほぼフラット**

Chrome/WebViewは`htmlTag="form"`のノード直下に`input`（username, password）が直接の子として並ぶ。中間の`<div>`等の祖先要素は一切現れない。Firefoxに至っては`<form>`タグ自体が存在せず、`htmlTag="html"`のノード直下に`input`が直接並ぶ。

```
Chrome:   (Androidネイティブビュー) → form → input, input
WebView:  (Androidネイティブビュー) → form(WebViewノード) → input, input
Firefox:  (Androidネイティブビュー) → html → input, input
```

つまり3ブラウザとも「文脈ノード（form/html）1つ→inputが直下」という2階層のみで、子孫結合子（`div.foo input`等）を要するCSSセレクタは原理的に再現不可能なデータしか得られない。

**(b) `htmlAttributes`の正確性・網羅性 — 高い**

Chrome/WebView(Chromium系)は`name`/`type`/`id`等の生HTML属性に加え、独自キー`ua-autofill-hints`/`computed-autofill-hints`/`crowdsourcing-autofill-hints`（値: `"USERNAME"`/`"PASSWORD"`、大文字）を持つ。

```json
"htmlAttributes": {
  "name": "pass", "type": "password", "label": "パスワード",
  "ua-autofill-hints": "PASSWORD", "id": "m_login_password",
  "computed-autofill-hints": "PASSWORD", "crowdsourcing-autofill-hints": "PASSWORD"
}
```

Firefoxは生HTML属性（`name`/`type`/`autocomplete`/`aria-label`等）のみで、Chromium系のような独自キーは持たない。ただし`type`属性自体は両エンジンとも正確。

**(c) ブラウザエンジン間の差異 — 最重要の発見**

標準Android API `View.getAutofillHints()`（`AssistStructure`上は`ViewNode.getAutofillHints()`）の信頼性が、ブラウザエンジンによって非対称であることが判明した：

- **Firefox(Gecko)**: `getAutofillHints()`に正しく`["username"]`/`["password"]`が入る。標準APIがそのまま機能する
- **Chrome/WebView(Chromium)**: usernameフィールドは`["username","webauthn"]`（正しい値に加えて`webauthn`が混入）。**passwordフィールドは`["on"]`（`autocomplete`属性値がそのまま入る）としか返らず、標準APIだけではpasswordフィールドを検出できない**。Chromium系ではフィールド種別の判定に`htmlAttributes`の独自キーを見る必要がある

つまり「ブラウザエンジンごとに使うべき最優先シグナルが異なる」。単一の判定ロジックでは両エンジンを正しく扱えず、優先順位付きのシグナル設計が必要になる。

**(d) `webDomain`の正確性**

サブドメインまで含めて正確に取得できていた。ただし祖先ノード（form/htmlの親等）では`webDomain`が空文字列やnullになるケースがあり、既存の「いずれかのノードで取得できればブラウザ由来と判定する」という方針はこの実態を踏まえたものとして、そのまま維持できる。

### 1-6-2. フィールド検出方針

`structure.getWebDomain()`が非nullの場合のフィールド検出は、ネイティブアプリ向けとは**独立したロジック**として扱う。ネイティブアプリ向けロジックは`ViewNode`のAndroidネイティブ属性（`idEntry`, `inputType`等）を前提としており、ブラウザ由来の`htmlTag`/`htmlAttributes`とはデータ源が全く異なるため、無理に一本化しない。

ブラウザ由来リクエストのシグナル優先順位（案）：

1. `htmlAttributes`の独自キー（`ua-autofill-hints`/`computed-autofill-hints`、値`"USERNAME"`/`"PASSWORD"`）が存在すれば最優先で採用する。存在する場合、そのノードはChromium系ブラウザ（Chrome・WebViewとも同一エンジン）由来と判定できる
2. 上記が存在しない場合、`ViewNode.getAutofillHints()`（`hints`）を見る。Firefoxではここに`"username"`/`"password"`が正確に入る
3. 上記いずれでも判定できない場合、`htmlAttributes.type`（`"password"`/`"email"`）をfallbackとして使う。両エンジン共通で正確なシグナルである
4. さらに個別サイト対応として、Android向けサイト別パターンファイルによる`name`/`id`属性の直接一致を用いる

### 1-6-3. Android向けサイト別パターンファイル

拡張機能のパターンファイルとは**別ファイル・別スキーマとして、Android専用のサイト別パターンファイルを新設する**方針とする。このパターンデータは共有しない。

**共有しない理由**: 拡張機能は`document.querySelector`というブラウザネイティブのCSSエンジンを前提に、任意の複雑なCSSセレクタ（子孫結合子・疑似クラス等）を許容するスキーマ（`extension/patterns/schema.json`）を持つ。一方Androidは祖先構造がほぼフラットであり、複雑なセレクタを原理的に再現できない。無理に共有スキーマにすると、以下のいずれかの問題を抱える：

- スキーマを単純な属性一致に制約すると、拡張機能側の将来の表現力を制限してしまう
- スキーマを任意のCSSセレクタのまま許容すると、Android側でパースできないパターンが将来紛れ込むリスクが残り続ける

そのため、Android向けパターンファイルは**単純な属性一致（`name`/`id`等のキーバリュー比較）のみをサポートする専用フォーマット**とし、CSSセレクタは扱わない。データの重複管理（同一サイトについて拡張機能用・Android用の2箇所に記述する手間）は許容し、各プラットフォームの実データに即したフォーマットを優先する。

# Part 2: アーキテクチャ

## 2-1. 全体構成

Autofillフレームワークから呼び出される`AutofillService`実装として`KuraAutofillService`を新設する。`onFillRequest`は、リクエスト元の判定（ネイティブアプリ／ウェブブラウザ）、`AssistStructure`解析によるフィールド検出、vaultのロック状態確認、状態に応じたDataset構築または認証プレースホルダー提示、という順で処理する。`onSaveRequest`（新規ログイン保存提案）は対応しない。

### 2-1-1. Manifest宣言

`AutofillService`はシステムのAutofillフレームワークからバインドされるコンポーネントであり、`BIND_AUTOFILL_SERVICE`権限の指定がシステム以外からのバインドを拒否するために必須となる。`minSdk`は`docs/android-passkey.md`（Credential Provider対応）により26から34に引き上げられているため、AutofillFramework自体の可用性チェック（バージョン分岐）は元々不要だった上に、その前提はさらに強まっている。

### 2-1-2. プロセスモデル

`KuraAutofillService`はアプリ本体と同一プロセスで動作させる（別プロセスには分離しない）。

- **アプリが既に起動・アンロック済みの場合**: 同一プロセス内でvault-core側のグローバルな状態をそのまま共有できるため、追加のアンロック操作なしに即座にオートフィル候補を返せる
- **OSにアプリプロセスをkillされた状態で`KuraAutofillService`が単独起動される場合**: プロセスが新規生成されるためvaultはロック状態からスタートする。この場合はSection 2-2の認証フローに入る

vault IDは既存実装同様、固定値を用いる。複数vault対応は現状スコープ外。

## 2-2. 認証フロー

`onFillRequest`の冒頭でvaultのロック状態を確認する。

- アンロック済みの場合は、そのままマッチング処理へ進む
- ロック中の場合は、認証プレースホルダー（タップすると認証Activityを起動する`Dataset`）を1件提示する。ユーザーがタップすると認証Activityが起動し、認証成功後に実データセットを返却する（標準的なAutofill Authenticationパターン）

認証Activityは既存の`LockScreen`のロジック（`BiometricHelper`は`Context`非依存で`Cipher`取得可能、`BiometricPrompt`表示自体は`FragmentActivity`が必要）を可能な限り再利用する。生体認証が未設定の場合はマスターパスワード入力にフォールバックする、既存`LockScreen`と同様の挙動とする。

## 2-3. データフロー・セキュリティ

「クレデンシャルの最小露出」原則を維持する。候補リスト取得の時点ではパスワードを含まない情報（URL・ユーザー名等）のみを扱う。マッチング対象のドメイン文字列自体の解決（ネイティブアプリはパッケージ名⇔ドメインマッピングファイル。ブラウザは`webDomain`の直接一致）はAndroidアプリ内で行うが、解決したドメインに対する実際のエントリ絞り込みはvault-core側の`api_list_login_candidates(domain, strict_subdomain)`（PSL/eTLD+1ベース）に委ねる。拡張機能も同一のvault-core関数を経由するため、Android・拡張機能で候補マッチングの挙動が一致する。実際にマッチしたエントリについてのみ個別に復号する。マッチ対象となるURLは エントリのログインURL（`typed_value.url`）に加え、URL型カスタムフィールド（`field_type == "url"`）の値も含まれるため、1つのエントリに複数サイトを紐付けられる。

Autofillフレームワークの`Dataset`はフィールド値を`onFillRequest`のレスポンス構築時点で確定させる必要があり、ブラウザ拡張のように「候補表示後、選択された1件のみ復号する」という二段階を素朴には実現できない（`Dataset`ごとに個別の認証を設定し、選択時に値を確定させることも可能だが、都度認証を要求するとUXが悪化する）。そのため、**vaultアンロック済みの場合は候補提示の時点で全マッチ候補のパスワードをまとめて復号し`Dataset`に埋め込む方式を採用した**（ドメインベースの絞り込みで該当件数は通常少数のため許容）。選択時に個別復号する方式は、都度認証によるUX悪化を避けるため採用しなかった。

例外的にTOTPコードのみはDataset単位認証（選択時に個別解決する方式）を採用している。パスワードと異なりTOTPコードは短時間で失効するため、値の鮮度をUXより優先する必要がある。

# Part 3: 個別設計

## 3-1. AssistStructure解析・フィールド検出

`onFillRequest`で渡される`AssistStructure`を再帰的にトラバースし、`ViewNode`ごとにフィールドの役割を判定する。判定ロジックはAndroidアプリ内に閉じた実装とし、vault-core・拡張機能とのロジック共有は行わない（ネイティブアプリ向け判定ロジックには拡張機能側に対応する実装が元々存在しないため、共有の効能が薄い）。まずリクエスト元を判定し、ネイティブアプリ由来ならSection 3-1-1、ブラウザ由来ならSection 1-6-2のロジックに進む。

### 3-1-1. 優先順位（ネイティブアプリ由来リクエスト）

1. `ViewNode.getAutofillHints()`: `View.AUTOFILL_HINT_USERNAME` / `AUTOFILL_HINT_PASSWORD` / `AUTOFILL_HINT_EMAIL_ADDRESS`が設定されていれば最優先で採用する。Android開発者が明示的に付与したヒントであり信頼性が最も高い
2. **ヒューリスティックfallback**: `autofillHints`が未設定のView（多くのアプリで発生しうる）に対し、以下のシグナルでスコアリングする：
  - `ViewNode.getHint()`（プレースホルダーテキスト相当）
  - `ViewNode.getIdEntry()`（リソースID名。例: `password_input`, `username_field`）
  - `ViewNode.getInputType()`（`InputType.TYPE_TEXT_VARIATION_PASSWORD`, `TYPE_TEXT_VARIATION_WEB_PASSWORD`等はpasswordの強いシグナル）

extension側の重み付きシグナル方式と同じ**考え方**（複数シグナルの重み付けスコアリング、閾値未満は分類不能として無視する保守的な設計）をKotlin実装の参考にする。ただしコード・データ（正規表現・重み定義）自体は共有せず、Android独自にチューニングする。誤検出によって無関係なフィールドにオートフィル候補が出ることを避けるため、検出漏れは許容し積極的な拡張は行わない。

### 3-1-2. リクエスト元の判定

- `structure.getWebDomain()`（`ViewNode`単位、いずれかのノードで取得できればブラウザ由来と判定）が非nullの場合、ブラウザ由来リクエストとしてSection 1-6-2のフィールド検出方針に進む
- 取得できない場合（ネイティブアプリ由来）は`structure.getActivityComponent().getPackageName()`でパッケージ名を取得し、Section 1-3のマッチングに進む

`AssistStructureParser.parse()`は、祖先ノードでは`webDomain`が空/nullになるケースがある実態（1-6-1(d)）を踏まえ、木構造の走査中にブラウザ由来と判明した時点で打ち切るのではなく、全ノードを収集してから判定する2段階方式で実装している。ネイティブアプリ向け（`FieldClassifier`, Section 3-1-1）とブラウザ向け（`BrowserFieldClassifier`, Section 1-6-2, 1-5）は別クラスとして独立実装されている。

## 3-2. パッケージ名⇔ドメインマッピングファイル（ネイティブアプリ専用）

**本パターンファイルはネイティブアプリ由来リクエスト専用**である。ブラウザ由来リクエストは`getWebDomain()`で直接ドメインが取得できるため本パターンファイルを参照しない。ブラウザ由来リクエスト向けのサイト別パターンファイルは3-2-2で別途扱う。

### 3-2-1. データ形式・配置

パッケージ名をキーとし、値を属性オブジェクト（ドメイン等）とする辞書形式のデータとする。値をドメイン文字列そのものではなくオブジェクトにするのは、将来的な拡張（例: コメント、検証状況フラグ、複数ドメインを許容する場合の配列化等）をスキーマ非破壊で行えるようにするため。1ドメインに対して複数パッケージが対応するケース（Android版/iOS版で別パッケージ名、等）を考慮し、キーはパッケージ名側とする。

**配置場所:** リポジトリ直下の`assets/`は「外部権威データソース」（PSL等、外部から取得し定期更新するデータ）の置き場という既存方針であり、本マッピングファイルは外部データではなくkuraチームが自前でキュレーションするデータのため区別する。`extension/patterns/`（拡張機能が自前キュレーションするサイトパターンファイル）と同様の位置づけとして、Androidアプリ内リソースとして配置する。

### 3-2-2. Android向けサイト別フィールド検出パターンファイル（ブラウザ由来リクエスト用）

Section 1-6-3の方針に基づき、拡張機能のパターンファイルとは別ファイル・別スキーマとして、Android専用のサイト別フィールド検出パターンファイルを新設した。

- **データ形式**: ドメインをキーとし、値は`username`/`password`/`totp`のフィールド種別ごとに`htmlAttributes`の`name`または`id`属性値のリストを直接指定する辞書形式（`SiteFieldPatternMap.kt`の`SitePatternEntry`）。CSSセレクタは扱わない（子孫結合子等を要するセレクタはAndroid側の`AssistStructure`では原理的に再現できないため）。ドメインの引き当ては完全一致 or サブドメイン許容のサフィックス一致（`www.`除去込み）とし、複数キーがマッチする場合は最長一致を採用する（`HostMatcher.kt`）。これはフィールド検出専用の軽量な文字列比較であり、PSL/eTLD+1は使わない。vaultエントリ自体のドメインマッチング（ログイン候補検索）はvault-core側の`api_list_login_candidates`に一元化されており、`HostMatcher.kt`はそちらとは独立している
- **配置場所**: `android/app/src/main/assets/site_field_patterns.json`。3-2-1のパッケージ名⇔ドメインファイル（`package_domains.json`）と同様、Androidアプリ内リソースとして配置する。初期状態は空オブジェクトからスタートしており、標準シグナル（Chromium独自キー/`autofillHints`/`type`属性）だけでは検出できないサイトを実機検証で洗い出し、随時追加していく（拡張機能側の`extension/patterns/`と同様、継続的なキュレーション運用が前提のデータであり、実装の完成度とは切り離して扱う）。
- **拡張機能側パターンファイルとの関係**: 同一サイトについて拡張機能用・Android用それぞれにデータを持つことになり重複管理コストが発生するが、CSSセレクタの表現力の前提が両プラットフォームで根本的に異なるため、共有パターンファイルとしてスキーマを歩み寄らせるより、各プラットフォームの実データに即した専用フォーマットを優先する
- **判定優先順位における位置づけ**: `BrowserFieldClassifier.kt`が1-6-2/1-5の優先順位に従い、Chromium独自キー・`autofillHints`・`type`属性・TOTPシグナル（`autocomplete="one-time-code"`/name・id正規表現）のいずれでも判定できなかった場合の最終フォールバックとして本パターンファイルを参照する

## 3-3. 設定導線

Androidの「自動入力サービス」設定でkuraを選択してもらうための導線を設定画面に追加する。

- `Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE`インテントを起動し、システム設定でkuraを選択できるようにする
- `AutofillManager.hasEnabledAutofillServices()`で現在の設定状態を表示する
