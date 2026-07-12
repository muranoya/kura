<!-- doc-status: implemented -->

# Android AutofillService 実装方針

---

# Part 1: 機能仕様

## 1-1. 概要

Android標準の[AutofillFramework](https://developer.android.com/guide/topics/text/autofill)（API 26以上）に対応する`AutofillService`をAndroidアプリに実装し、**他アプリ（ネイティブアプリ）のログインフォーム**に対してvault内のクレデンシャルを自動入力できるようにする。

**本フェーズ（v1）の対象は、ネイティブアプリのオートフィルのみ**とする。Chrome/Firefox等のブラウザで表示中のウェブサイトへのオートフィルは、検証すべき技術的な不確定要素があるため今回は対象外とし、将来のフェーズで改めて検討する（理由と必要な検証はSection 1-6を参照）。

既存の`android/rust-jni`は既にログイン一覧取得・アンロック・エントリ復号等のJNIブリッジを備えており、AutofillServiceはこの上に構築する。vault-core本体への変更は不要（Section 2-4参照）。

### 対応範囲

**対応する機能：**

- ネイティブアプリのログインフォーム（username + password）の検出
- ネイティブアプリのTOTP（2段階認証コード）フィールドの検出とオートフィル（同一フォーム内のusername/password同居ケース、ログイン後に出るTOTP専用画面の両方に対応。Section 1-5参照）
- パッケージ名ベースのマッチング（Section 1-3）
- vaultロック中の認証プロンプト経由でのオートフィル
- クレデンシャル候補の選択・自動入力

**対応しない機能（将来課題、Section 3-4参照）：**

- ブラウザで表示中のウェブサイトへのオートフィル — Section 1-6参照
- 新規ログイン情報の保存提案（`onSaveRequest`） — フォーム送信を検知して「このパスワードをkuraに保存しますか？」と提案する機能は今回は実装しない
- クレジットカード等、login以外のエントリタイプのオートフィル
- 分割ログインフロー（usernameとpasswordが別画面）の引き継ぎ — ブラウザ拡張のような画面間の状態引き継ぎは行わず、各`onFillRequest`は独立して処理する

## 1-2. 対応フォームタイプ


| タイプ   | 説明                                                     |
| ----- | ------------------------------------------------------ |
| LOGIN | username + password のペア。両方、またはpasswordのみのフィールド集合を対象とする |
| TOTP  | 2段階認証コード入力欄。LOGINと同一フォームに同居する場合と、ログイン後に出る専用画面（username/passwordなし）の両方を対象とする |


分割ログイン（username単体の画面）はブラウザ拡張と異なり、Android Autofillフレームワークでは各`onFillRequest`が単一の`AssistStructure`スナップショットとして独立に届く。画面間の状態を引き継ぐService Worker相当の仕組みは設けず、usernameフィールドのみの画面ではusername候補のみを提示する。TOTP専用画面（2段階認証画面）も同様に、その`onFillRequest`単体で完結する形で候補を提示する。

## 1-3. マッチング方式（パッケージ名ベース）

ネイティブアプリからのリクエストでは、`AssistStructure.getActivityComponent().getPackageName()`からリクエスト元のパッケージ名が分かる。

Android標準のベストプラクティスである[Digital Asset Links](https://developers.google.com/digital-asset-links)（`assetlinks.json`によるアプリ⇔ウェブサイトの検証）は、**対象ウェブサイト側が`assetlinks.json`を用意している必要があり、kura側だけでは網羅・制御できない**ため採用しない。

代わりに、**リポジトリで管理するパッケージ名⇔ドメインの手動マッピングDB**を新設する（Section 3-2）。これはウェブブラウザ拡張のパターンDBファイルと同じ思想であり、外部の検証情報に依存せず、既知の主要アプリについて確実なマッチングを提供する。

- 未登録パッケージは候補を一切表示しない（誤マッチより「候補なし」を優先する安全側デフォルト）
- ヒューリスティックな推測（パッケージ名からドメインを機械的に導出する等）は行わない。`com.example.android` → `example.com`のような単純な変換は誤マッチが多く、field-classifierを保守的に保つという既存の設計方針と同様の考え方に反するため
- データ形式・配置場所はSection 3-2で詳述

## 1-4. オートフィルUI

`FillResponse`に候補（`Dataset`）を積んで返す。各`Dataset`はエントリ名を表示ラベルとし、選択されるとusername/passwordフィールドに値が入力される。

- vaultがアンロック済みの場合: マッチしたエントリをそのまま`Dataset`として提示する
- vaultがロック中の場合: 認証プレースホルダーの`Dataset`を1件提示し、選択すると認証フローに入る（Section 2-2）
- マッチする候補が0件（アンロック済みで該当エントリなし、またはロック中でも該当なしと判定できない場合を除く）の場合、候補自体を提示しない

TOTPフィールドを含む候補は、username/password用の`Dataset`とは**別の`Dataset`**として1件追加で提示する（1候補につき最大2つの`Dataset`が並ぶ）。理由と詳細はSection 1-5参照。

## 1-5. TOTP（2段階認証コード）オートフィルの詳細

TOTPコードは既定30秒（エントリのotpauth設定次第で変動）で失効するため、username/passwordのように`onFillRequest`時点でまとめて生成・埋め込む方式（Section 2-3）はそのまま使えない。ユーザーが候補を選ぶまでの間にコードが失効している恐れがあるためである。

そのため、TOTP用の`Dataset`はAndroid Autofillの**Dataset単位認証**（`Dataset.Builder.setAuthentication(IntentSender)`）を利用し、コード自体は`onFillRequest`時点では生成しない。ユーザーがTOTP候補をタップした瞬間に`AutofillTotpResolveActivity`（トランポリンActivity）が起動し、その場で最新のコードを生成した`Dataset`を返す。

- `onFillRequest`時点では、対象エントリがTOTPカスタムフィールド（`CustomFieldType.Totp`）を持つかどうかのみを確認する（コードそのものは生成しない。クレデンシャル最小露出の原則、Section 2-3）
- `AutofillTotpResolveActivity`は選択の瞬間に`generateTotpFromValue`（vault-core、既存API）でコードを生成し、`Dataset`を`EXTRA_AUTHENTICATION_RESULT`として返す（`AutofillUnlockActivity`が`FillResponse`を返すのとは型が異なる点に注意）
- `onFillRequest`時点でvaultがアンロック済みでも、ユーザーが候補をタップするまでの間に自動ロックタイマーで再ロックされている可能性があるため、`AutofillTotpResolveActivity`は`AutofillUnlockActivity`と同じ認証フロー（`AutofillAuthScreen`、Section 2-2）を経由してから解決する
- TOTPフィールドの検出は`FieldClassifier`のヒューリスティックスコアリングに委ねる。Android Autofillフレームワークにはワンタイムコード専用の`autofillHints`定数は存在しないため、`idEntry`/`hint`の正規表現（`otp`, `totp`, `verification code`, `認証コード`等）を主要シグナルとし、`inputType`（数値クラス等）は単独では判定に使わない弱いシグナルとして扱う（詳細はSection 3-1、`FieldClassifier.kt`参照）

**対応しない機能の詳細:**

- **Save機能**: `onSaveRequest`の実装（新規ログイン検知・保存提案）は、既存の`EntryCreateScreen`との連携やUI設計を要する別スコープの作業として今回は扱わない

## 1-6. ブラウザ経由のウェブサイトオートフィルを対象外とする理由

### 1-6-1. 検討の経緯（要約）

設計初期には、ブラウザ拡張と同水準の体験（`ViewNode.getWebDomain()`が取得できるブラウザ由来リクエストに対する、eTLD+1判定・サイト別パターンDBを使ったログインフォーム検出）をAndroidでも実現する方向で検討していた。具体的には以下を検討し、いずれも次点の課題に突き当たった。

1. **eTLD+1判定ロジックのvault-core集約**: ブラウザ拡張が持つ`extractETldPlus1`をvault-core（Rust）に移植し、WASM/JNI双方から呼び出す案。ロジック自体は移植可能だが、後述のパターンDBの課題と合わせて検討した結果、単独で進める意義が薄れた
2. **サイト別パターンDB（CSSセレクタベース）の共有**: ブラウザ拡張の`extension/patterns/sites/*.json`は、ヒューリスティックで検出できない一部サイト（現状3件）に対するCSSセレクタベースの個別対応。これをAndroidでも使えなければ、「同じサイトなのに拡張機能では検出できてAndroidでは検出できない」というズレが、まさにこの3サイトで発生する
3. **パターンDBをvault-core側で解決する案**: セレクタ解決ロジック自体をvault-core（Rust）に実装し共有する案を検討したが、拡張機能は`document.querySelector`というブラウザネイティブのCSSエンジンを無償で使っており、これと同等の表現力をvault-core側で持たせるには、vault-core自身がCSSセレクタエンジンを実装する必要がある。将来的な結合子（子孫セレクタ等）や疑似クラスへの対応を考えると、これは現実的な投資対効果とは言えない
4. **セレクタ解決をアプリ側に残し、Android側にCSSエンジンを追加する案**: vault-coreにエンジンを持たせる代わりに、拡張機能は従来通り`document.querySelector`を使い、Androidは独自にCSSセレクタエンジン（例: jsoup等の既存ライブラリをViewNodeツリーから合成した疑似DOMに適用する）を持つ、という案。CSSエンジン自体の実装コストは現実的な範囲に収まりそうだが、次項の理由でこの案の有効性自体が未検証

### 1-6-2. 対象外とする理由

上記の検討を通じて分かったのは、**Androidの`AssistStructure`はページのHTMLをそのまま渡してくれるわけではない**という点である。ブラウザ（Chrome/Firefox等）が、自分の内部DOMを「Autofillに関係しそうな範囲」で`ViewNode`ツリーへ**独自に翻訳・要約したもの**を受け取るに過ぎない。この翻訳の忠実度は、kura側では制御できないブラウザ実装依存の要素であり、具体的には以下が不明である：

- フォーム要素（`<input>`等）だけでなく、その祖先要素（`<form>`, `<div>`等）が`ViewNode`として公開されるのか、それとも末端の入力要素だけをフラットに公開しているのか。後者の場合、CSSエンジンをAndroid側に持たせても、子孫セレクタのような祖先関係を要求するセレクタは原理的に解決不可能（データが無い）
- `ViewNode.getHtmlInfo()`が返す属性（`name`/`id`/`class`/`type`/`autocomplete`等）がどこまで正確・網羅的か
- Chrome / Firefox / Samsung Internet等、ブラウザごとにこの精度が異なるか。異なる場合、「Android版で揃える」対象が「拡張機能 vs Android」の2軸ではなく「拡張機能 vs Android+Chrome vs Android+Firefox」という多軸の整合性問題になる
- Android OSバージョン・ブラウザバージョンによる差異

これらは実機で検証しない限り分からない。**技術的な実現可能性そのものが不明な状態でCSSエンジンの実装やvault-core側の共通化に投資するのはリスクが高い**ため、ブラウザ経由のウェブサイトオートフィルは本フェーズの対象外とし、まずはこの不確定要素のないネイティブアプリのオートフィルから着手する。

なお、ネイティブアプリオートフィルの実装方針（Section 3-1）は、上記のブラウザ固有の課題（`getWebDomain()`が返る = ブラウザ由来のリクエストである場合）とは無関係であり、この決定による影響を受けない。`KuraAutofillService`は`getWebDomain()`が非nullのリクエストを検出した場合、候補を返さない（`FillCallback.onSuccess(null)`）ことを明示的な仕様とする。

### 1-6-3. 将来対応に向けて必要な検証

ブラウザ経由のオートフィル対応を将来検討する際は、着手前に以下を実機で検証する：

1. `**AssistStructure`のダンプ調査**: 最小限のAutofillServiceを実装し、複数の実サイト（できればヒューリスティックで検出できない、パターンDB相当の個別対応が必要そうな複雑なフォームを持つサイトを含む）に対して、Chrome・Firefox for Androidそれぞれで`onFillRequest`時の`AssistStructure`をログ出力する
2. 上記のログから、以下を確認する：
  - フォーム要素の祖先構造（`<form>`等）が`ViewNode`として保持されているか、フラットな構造か
  - `ViewNode.getHtmlInfo()`の属性の正確性・網羅性
  - ブラウザ間・OSバージョン間での差異の有無
  - `ViewNode.getWebDomain()`自体の正確性・一貫性（サブドメイン、ポート番号の扱い等）
3. 検証結果に応じて対応方針を評価し直す：
  - 祖先構造が十分に保持されているなら、Android側にCSSセレクタエンジン（jsoup等）を導入し、パターンDBのデータ（`.json`）をそのまま活用する設計（Section 1-6-1の案4）が現実的な選択肢になる
  - フラットな構造しか得られない場合、複合セレクタ・結合子を要するパターンはAndroidでは原理的に再現不可能という前提を受け入れた上で、単純な属性一致のみサポートする、または対応自体を見送るかを判断する

# Part 2: アーキテクチャ

## 2-1. 全体構成

Android OSのAutofillフレームワークから呼び出される`AutofillService`実装として`KuraAutofillService`を新設する。`onFillRequest`は、ブラウザ由来リクエストの除外（Section 1-6）、`AssistStructure`解析によるフィールド検出（Section 3-1）、vaultのロック状態確認、状態に応じたDataset構築または認証プレースホルダー提示、という順で処理する。`onSaveRequest`（新規ログイン保存提案）は対応しない（Section 1-1）。

既存の`android/rust-jni`経由でvault-core（Rust）を呼び出す既存の構成をそのまま踏襲し、vault-core本体への変更は行わない（Section 2-4参照）。

### 2-1-1. Manifest宣言

`AutofillService`はシステムのAutofillフレームワークからバインドされるコンポーネントであり、`BIND_AUTOFILL_SERVICE`権限の指定がシステム以外からのバインドを拒否するために必須となる。`minSdk 26`のため、AutofillFramework自体の可用性チェック（バージョン分岐）は不要。

### 2-1-2. プロセスモデル

`KuraAutofillService`はアプリ本体と同一プロセスで動作させる（別プロセスには分離しない）。

- **アプリが既に起動・アンロック済みの場合**: 同一プロセス内でvault-core側のグローバルな状態をそのまま共有できるため、追加のアンロック操作なしに即座にオートフィル候補を返せる
- **OSにアプリプロセスをkillされた状態で`KuraAutofillService`が単独起動される場合**: プロセスが新規生成されるためvaultはロック状態からスタートする。この場合はSection 2-2の認証フローに入る

vault IDは既存実装同様、固定値を用いる。複数vault対応は現状スコープ外。

## 2-2. 認証フロー

`onFillRequest`の冒頭でvaultのロック状態を確認する。

- アンロック済みの場合は、そのままマッチング処理（Section 1-3）へ進む
- ロック中の場合は、認証プレースホルダー（タップすると認証Activityを起動する`Dataset`）を1件提示する。ユーザーがタップすると認証Activityが起動し、認証成功後に実データセットを返却する（標準的なAutofill Authenticationパターン）

認証Activityは既存の`LockScreen`のロジック（`BiometricHelper`は`Context`非依存で`Cipher`取得可能、`BiometricPrompt`表示自体は`FragmentActivity`が必要）を可能な限り再利用する。生体認証が未設定の場合はマスターパスワード入力にフォールバックする、既存`LockScreen`と同様の挙動とする。

## 2-3. データフロー・セキュリティ

「クレデンシャルの最小露出」原則を維持する。候補リスト取得の時点ではパスワードを含まない情報（URL・ユーザー名等）のみを扱い、パッケージ名⇔ドメインマッピングDBによる絞り込み（Section 1-3）を行った上で、実際にマッチしたエントリについてのみ個別に復号する。

Android Autofillフレームワークの`Dataset`はフィールド値を`onFillRequest`のレスポンス構築時点で確定させる必要があり、ブラウザ拡張のように「候補表示後、選択された1件のみ復号する」という二段階を素朴には実現できない（`Dataset`ごとに個別の認証を設定し、選択時に値を確定させることも可能だが、都度認証を要求するとUXが悪化する）。そのため、**vaultアンロック済みの場合は候補提示の時点で全マッチ候補のパスワードをまとめて復号し`Dataset`に埋め込む方式を採用した**（パッケージ名マッピングDBによる絞り込みで該当件数は通常少数のため許容）。選択時に個別復号する方式は、都度認証によるUX悪化を避けるため採用しなかった。

例外的にTOTPコードのみはDataset単位認証（選択時に個別解決する方式）を採用している。パスワードと異なりTOTPコードは短時間で失効するため、値の鮮度をUXより優先する必要がある（Section 1-5参照）。

## 2-4. vault-core / JNI層の変更点

vault-core側の変更は不要。ログイン候補一覧を取得するための既存APIをそのまま利用する。

`android/rust-jni`には、既存のJNIブリッジ関数群と同じパターンを踏襲した新規ブリッジ関数を1つ追加する。Android側の`VaultRepository`でも、既存の同種メソッドと同じパターンでデシリアライズ・suspend化を行う。

# Part 3: 個別設計

## 3-1. AssistStructure解析・フィールド検出

`onFillRequest`で渡される`AssistStructure`を再帰的にトラバースし、`ViewNode`ごとにフィールドの役割を判定する。判定ロジックはAndroidアプリ内（Kotlin）に閉じた実装とし、vault-core・拡張機能とのロジック共有は行わない（Section 1-6参照。ネイティブアプリには拡張機能側に対応する実装が元々存在しないため、共有の効能が薄い）。

### 3-1-1. 優先順位

1. `ViewNode.getAutofillHints()`: `View.AUTOFILL_HINT_USERNAME` / `AUTOFILL_HINT_PASSWORD` / `AUTOFILL_HINT_EMAIL_ADDRESS`が設定されていれば最優先で採用する。Android開発者が明示的に付与したヒントであり信頼性が最も高い
2. **ヒューリスティックfallback**: `autofillHints`が未設定のView（多くのアプリで発生しうる）に対し、以下のシグナルでスコアリングする：
  - `ViewNode.getHint()`（プレースホルダーテキスト相当）
  - `ViewNode.getIdEntry()`（リソースID名。例: `password_input`, `username_field`）
  - `ViewNode.getInputType()`（`InputType.TYPE_TEXT_VARIATION_PASSWORD`, `TYPE_TEXT_VARIATION_WEB_PASSWORD`等はpasswordの強いシグナル）

extension側の重み付きシグナル方式と同じ**考え方**（複数シグナルの重み付けスコアリング、閾値未満は分類不能として無視する保守的な設計）をKotlin実装の参考にする。ただしコード・データ（正規表現・重み定義）自体は共有せず、Android独自にチューニングする。誤検出によって無関係なフィールドにオートフィル候補が出ることを避けるため、検出漏れは許容し積極的な拡張は行わない。

### 3-1-2. リクエスト元の判定とブラウザ由来リクエストの扱い

- `structure.getWebDomain()`（`ViewNode`単位、いずれかのノードで取得できればブラウザ由来と判定）が非nullの場合、**候補を返さない**（`FillCallback.onSuccess(null)`）。本フェーズではブラウザ経由のウェブサイトオートフィルは対象外のため（Section 1-6）
- 取得できない場合（ネイティブアプリ由来）は`structure.getActivityComponent().getPackageName()`でパッケージ名を取得し、Section 1-3のマッチングに進む

## 3-2. パッケージ名⇔ドメインマッピングDB

### 3-2-1. データ形式・配置

パッケージ名をキーとし、値を属性オブジェクト（ドメイン等）とする辞書形式のデータとする。値をドメイン文字列そのものではなくオブジェクトにするのは、将来的な拡張（例: コメント、検証状況フラグ、複数ドメインを許容する場合の配列化等）をスキーマ非破壊で行えるようにするため。1ドメインに対して複数パッケージが対応するケース（Android版/iOS版で別パッケージ名、等）を考慮し、キーはパッケージ名側とする。

**配置場所:** リポジトリ直下の`assets/`は「外部権威データソース」（PSL等、外部から取得し定期更新するデータ）の置き場という既存方針であり、本マッピングDBは外部データではなくkuraチームが自前でキュレーションするデータのため区別する。`extension/patterns/`（拡張機能が自前キュレーションするサイトパターンDB）と同様の位置づけとして、Androidアプリ内リソースとして配置する。

## 3-3. 設定導線

Androidの「自動入力サービス」設定でkuraを選択してもらうための導線を設定画面に追加する。

- `Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE`インテントを起動し、システム設定でkuraを選択できるようにする
- `AutofillManager.hasEnabledAutofillServices()`で現在の設定状態を表示する

# Part 4: 将来課題

- **ブラウザ経由のウェブサイトオートフィル対応**: Section 1-6-3の実機検証を行った上で改めて設計する。最優先の将来課題
- **Save対応**: `onSaveRequest`実装。新規ログイン検知後、既存`EntryCreateScreen`へ遷移し確認・保存させるフロー設計が必要

