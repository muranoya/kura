<!-- doc-status: design -->
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
- パッケージ名ベースのマッチング（Section 1-3）
- vaultロック中の認証プロンプト経由でのオートフィル
- クレデンシャル候補の選択・自動入力

**対応しない機能（将来課題、Section 3-4参照）：**

- ブラウザで表示中のウェブサイトへのオートフィル — Section 1-6参照
- 新規ログイン情報の保存提案（`onSaveRequest`） — フォーム送信を検知して「このパスワードをkuraに保存しますか？」と提案する機能は今回は実装しない
- TOTP（2段階認証コード）のオートフィル — vault-core側に土台となるAPI（`api_list_totp_periods`）は既にあるが、今回のスコープには含めない
- クレジットカード等、login以外のエントリタイプのオートフィル
- 分割ログインフロー（usernameとpasswordが別画面）の引き継ぎ — ブラウザ拡張のような画面間の状態引き継ぎは行わず、各`onFillRequest`は独立して処理する

## 1-2. 対応フォームタイプ

| タイプ | 説明 |
|--------|------|
| LOGIN | username + password のペア。両方、またはpasswordのみのフィールド集合を対象とする |

分割ログイン（username単体の画面）はブラウザ拡張と異なり、Android Autofillフレームワークでは各`onFillRequest`が単一の`AssistStructure`スナップショットとして独立に届く。画面間の状態を引き継ぐService Worker相当の仕組みは設けず、usernameフィールドのみの画面ではusername候補のみを提示する。

## 1-3. マッチング方式（パッケージ名ベース）

ネイティブアプリからのリクエストでは、`AssistStructure.getActivityComponent().getPackageName()`からリクエスト元のパッケージ名が分かる。

Android標準のベストプラクティスである[Digital Asset Links](https://developers.google.com/digital-asset-links)（`assetlinks.json`によるアプリ⇔ウェブサイトの検証）は、**対象ウェブサイト側が`assetlinks.json`を用意している必要があり、kura側だけでは網羅・制御できない**ため採用しない。

代わりに、**リポジトリで管理するパッケージ名⇔ドメインの手動マッピングDB**を新設する（Section 3-2）。これは`extension/patterns/sites/*.json`（サイト固有のフォーム検出パターンをリポジトリでキュレーションする設計、[`docs/extension-pattern-db.md`](extension-pattern-db.md)）と同じ思想であり、外部の検証情報に依存せず、既知の主要アプリについて確実なマッチングを提供する。

- 未登録パッケージは候補を一切表示しない（誤マッチより「候補なし」を優先する安全側デフォルト）
- ヒューリスティックな推測（パッケージ名からドメインを機械的に導出する等）は行わない。`com.example.android` → `example.com`のような単純な変換は誤マッチが多く、field-classifierを保守的に保つという既存の設計方針と同様の考え方に反するため
- データ形式・配置場所はSection 3-2で詳述

## 1-4. オートフィルUI

`FillResponse`に候補（`Dataset`）を積んで返す。各`Dataset`はエントリ名を表示ラベルとし、選択されるとusername/passwordフィールドに値が入力される。

- vaultがアンロック済みの場合: マッチしたエントリをそのまま`Dataset`として提示する
- vaultがロック中の場合: 認証プレースホルダーの`Dataset`を1件提示し、選択すると認証フローに入る（Section 2-2）
- マッチする候補が0件（アンロック済みで該当エントリなし、またはロック中でも該当なしと判定できない場合を除く）の場合、候補自体を提示しない（`FillCallback.onSuccess(null)`）

## 1-5. 対応しない機能の詳細

ブラウザ拡張（[`docs/extension-autofill.md`](extension-autofill.md) Section 1-1）と同様の設計判断に加え、Android固有の理由を以下に記す。

- **Save機能**: `onSaveRequest`の実装（新規ログイン検知・保存提案）は、既存の`EntryCreateScreen`との連携やUI設計を要する別スコープの作業として今回は扱わない
- **TOTP**: vault-core側`api_list_totp_periods`（コード本体を含まない周期情報のみ）は既に存在し将来のTOTPオートフィル対応の土台になるが、`Dataset`への複数候補提示（`InlinePresentation`等）の設計を要するため今回は対象外とする

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

1. **`AssistStructure`のダンプ調査**: 最小限のAutofillServiceを実装し、複数の実サイト（できればヒューリスティックで検出できない、パターンDB相当の個別対応が必要そうな複雑なフォームを持つサイトを含む）に対して、Chrome・Firefox for Androidそれぞれで`onFillRequest`時の`AssistStructure`をログ出力する
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

```
Android OS (Autofill Framework)
  └── KuraAutofillService : AutofillService
        ├── onFillRequest()
        │     ├── getWebDomain()が非null → 候補なしで終了（Section 1-6）
        │     ├── AssistStructure解析（フィールド検出、Section 3-1）
        │     ├── VaultBridge.isUnlocked() 確認
        │     ├── アンロック済み: listLoginUrls() → パッケージ名マッチング → Dataset構築
        │     └── ロック中: 認証プレースホルダーDataset → 認証Activity起動
        └── (onSaveRequest は未実装 = 将来課題)

android/rust-jni (JNI)
  └── vault-core (Rust、変更なし)
        └── VaultManager（vault_idキーのプロセス内グローバル状態）
```

### 2-1-1. Manifest宣言

```xml
<service
    android:name=".autofill.KuraAutofillService"
    android:label="@string/app_name"
    android:permission="android.permission.BIND_AUTOFILL_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.service.autofill.AutofillService" />
    </intent-filter>
    <meta-data
        android:name="android.autofill"
        android:resource="@xml/autofill_service_configuration" />
</service>
```

`android:permission="android.permission.BIND_AUTOFILL_SERVICE"`はシステム以外からのバインドを拒否するために必須。`minSdk 26`のため、AutofillFramework自体の可用性チェック（バージョン分岐）は不要。

想定パッケージ: `android/app/src/main/java/net/meshpeak/kura/autofill/`（新規ディレクトリ、既存の`bridge`/`data`/`ui`/`viewmodel`と並列）。

### 2-1-2. プロセスモデル

既存Manifestに`android:process`指定は無く、AutofillServiceも同様に指定しない（同一プロセス内で動作）。

- **アプリが既に起動・アンロック済みの場合**: MainActivityと同じプロセス内でRust側`VaultManager`のグローバル状態（`android/rust-jni/src/lib.rs`の`static MANAGERS: LazyLock<Mutex<HashMap<String, Arc<VaultManager>>>>`）をそのまま共有できる。追加のアンロック操作なしに即座にオートフィル候補を返せる
- **OSにアプリプロセスをkillされた状態で`KuraAutofillService`が単独起動される場合**: プロセスが新規生成されるため`VaultManager`はロック状態からスタートする。この場合はSection 2-2の認証フローに入る

vault_idは既存実装同様、固定文字列`"default"`（`VaultRepository.DEFAULT_VAULT_ID`）を用いる。複数vault対応は現状スコープ外。

## 2-2. 認証フロー

```
onFillRequest()
  │
  ├── VaultBridge.isUnlocked("default") ?
  │
  ├── true ─────────────────────────────────────┐
  │                                              │
  │                                    マッチング処理へ（Section 1-3）
  │
  └── false
        │
        ├── FillResponse.setAuthentication(
        │       autofillIds,
        │       pendingIntent.intentSender,  // AutofillUnlockActivity起動
        │       presentation                  // 「kuraでロック解除」等のプレースホルダー
        │   )
        │
        └── ユーザーがタップ
              │
              ├── AutofillUnlockActivity 起動
              │     ├── 既存 BiometricHelper / LockScreen ロジックを再利用
              │     │     （BiometricPromptはFragmentActivity必須）
              │     └── 認証成功 → VaultBridge.unlock相当を実行
              │
              └── setResult(RESULT_OK, intent) で実データセットを返却
                    （標準的な Autofill Authentication パターン）
```

認証Activityは既存の`LockScreen.kt`のロジック（`BiometricHelper`は`Context`非依存で`Cipher`取得可能、`BiometricPrompt`表示自体は`FragmentActivity`が必要）を可能な限り再利用する。生体認証が未設定の場合はマスターパスワード入力にフォールバックする、既存`LockScreen`と同様の挙動とする。

## 2-3. データフロー・セキュリティ

ブラウザ拡張の設計方針（[`docs/extension-autofill.md`](extension-autofill.md) Section 2-3）を踏襲し、「クレデンシャルの最小露出」原則を維持する。

```
[ステップ1: 候補リスト取得]
onFillRequest
  ├── VaultBridge.listLoginUrls("default") で全loginエントリを取得
  │     → [{ id, name, url, username }]     // パスワードは含まない
  ├── Androidアプリ側でパッケージ名⇔ドメインマッピングDBによりフィルタ（Section 1-3）
  └── マッチしたエントリ分の Dataset を構築
        （ラベルは name/username のみ表示、値は未確定のプレースホルダー）

[ステップ2: 選択時の復号]
ユーザーがDatasetを選択
  └── 選択されたDatasetのAutofillValueとして、あらかじめ復号済みの値を設定する
        か、遅延Dataset（Android 11+の InlinePresentation / 認証付きDataset）で
        選択時に api_get_entry 相当を呼び復号する
```

**設計判断（要検討事項として明記）:** Android Autofillフレームワークの`Dataset`はフィールド値を`onFillRequest`のレスポンス構築時点で確定させる必要があり、ブラウザ拡張のように「候補表示後、選択された1件のみ復号する」という二段階を素朴には実現できない（`Dataset`ごとに`setAuthentication`を個別に設定し、選択時に認証Activity経由で値を確定させることは可能だが、都度認証を要求するとUXが悪化する）。そのため実装時は以下のいずれかを選ぶ必要がある：

- vaultアンロック済みの場合は、候補提示の時点で全マッチ候補のパスワードをまとめて復号し`Dataset`に埋め込む（`api_get_entry`をマッチ件数分呼ぶ。パッケージ名マッピングDBによる絞り込みで件数は通常少数）
- 候補が多い場合に備え、`Dataset`単位で`setAuthentication`を使い選択時に個別復号する方式も選択肢とする

いずれにせよ、`SecretString`/`zeroize`によるメモリゼロ化方針（[`docs/architecture.md`](architecture.md)）はAutofill経路でも維持し、Kotlin側で受け取ったパスワード文字列は`Dataset`構築後速やかに参照を破棄する。

## 2-4. vault-core / JNI層の変更点

vault-core側の変更は不要。`api_list_login_urls`（`vault-core/src/api/entries.rs`）は既存のまま利用する。

`android/rust-jni/src/lib.rs`に、既存の`listEntries`と同じ`jni_catch` + `with_manager`パターンを踏襲した関数を追加する：

```rust
#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_listLoginUrls(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let candidates = with_manager(&vid, |m| m.api_list_login_urls())
            .map_err(|e| format!("Failed to list login urls: {}", e))?;
        let json = serde_json::to_string(&candidates).unwrap_or_else(|_| "[]".to_string());
        new_jstring(env, &json)
    })
}
```

`android/app/.../bridge/VaultBridge.kt`に対応する`external fun listLoginUrls(vaultId: String): String`を追加し、`VaultRepository`側で`AutofillCandidate`データクラス（`id`, `name`, `url`, `username`）へのデシリアライズとsuspend化（`withContext(Dispatchers.Default)`）を行う、既存の`listEntries`と同じパターンを踏襲する。

# Part 3: 個別設計

## 3-1. AssistStructure解析・フィールド検出

`onFillRequest`で渡される`AssistStructure`を再帰的にトラバースし、`ViewNode`ごとにフィールドの役割を判定する。判定ロジックはAndroidアプリ内（Kotlin）に閉じた実装とし、vault-core・拡張機能とのロジック共有は行わない（Section 1-6参照。ネイティブアプリには拡張機能側に対応する実装が元々存在しないため、共有の効能が薄い）。

### 3-1-1. 優先順位

1. **`ViewNode.getAutofillHints()`**: `View.AUTOFILL_HINT_USERNAME` / `AUTOFILL_HINT_PASSWORD` / `AUTOFILL_HINT_EMAIL_ADDRESS`が設定されていれば最優先で採用する。Android開発者が明示的に付与したヒントであり信頼性が最も高い
2. **ヒューリスティックfallback**: `autofillHints`が未設定のView（多くのアプリで発生しうる）に対し、以下のシグナルでスコアリングする：
   - `ViewNode.getHint()`（プレースホルダーテキスト相当）
   - `ViewNode.getIdEntry()`（リソースID名。例: `password_input`, `username_field`）
   - `ViewNode.getInputType()`（`InputType.TYPE_TEXT_VARIATION_PASSWORD`, `TYPE_TEXT_VARIATION_WEB_PASSWORD`等はpasswordの強いシグナル）

extension側`field-classifier.ts`の重み付きシグナル方式（[`docs/extension-autofill.md`](extension-autofill.md) Section 3-1-1）と同じ**考え方**（複数シグナルの重み付けスコアリング、閾値未満は分類不能として無視する保守的な設計）をKotlin実装の参考にする。ただしコード・データ（正規表現・重み定義）自体は共有せず、Android独自にチューニングする。誤検出によって無関係なフィールドにオートフィル候補が出ることを避けるため、検出漏れは許容し積極的な拡張は行わない。

### 3-1-2. リクエスト元の判定とブラウザ由来リクエストの扱い

- `structure.getWebDomain()`（`ViewNode`単位、いずれかのノードで取得できればブラウザ由来と判定）が非nullの場合、**候補を返さない**（`FillCallback.onSuccess(null)`）。本フェーズではブラウザ経由のウェブサイトオートフィルは対象外のため（Section 1-6）
- 取得できない場合（ネイティブアプリ由来）は`structure.getActivityComponent().getPackageName()`でパッケージ名を取得し、Section 1-3のマッチングに進む

## 3-2. パッケージ名⇔ドメインマッピングDB

### 3-2-1. データ形式・配置

```json
{
  "com.example.android.app": { "domain": "example.com" },
  "com.example.messenger": { "domain": "example.com" }
}
```

パッケージ名 → 属性オブジェクトの辞書とする。値を`domain`のみのプリミティブ（文字列）ではなくオブジェクトにするのは、将来的な拡張（例: `note`によるコメント、`verified`のような検証状況フラグ、複数ドメインを許容する場合の配列化等）をスキーマ非破壊で行えるようにするため。1ドメインに対して複数パッケージが対応するケース（Android版/iOS版で別パッケージ名、等）を考慮し、キーはパッケージ名側とする。

**配置場所:** リポジトリ直下の`assets/`は「外部権威データソース」（PSL等、外部から取得し定期更新するデータ）の置き場という既存方針であり、本マッピングDBは外部データではなくkuraチームが自前でキュレーションするデータのため区別する。`extension/patterns/`（拡張機能が自前キュレーションするサイトパターンDB）と同様の位置づけとして、Androidアプリ内リソース（例: `android/app/src/main/assets/package_domains.json`）に配置する案とする。

### 3-2-2. メンテナンス方針

- 初期リストは主要な国内外サービスの公式アプリ（銀行、SNS、メール、ECサイト等）を中心に手動で作成する
- 新規追加はPR単位で行う（ドメイン所有者による検証は行わないため、明らかに公式と分かるパッケージ名のみを登録する運用ルールを別途定める）
- 誤って無関係なドメインが登録された場合の影響を抑えるため、未登録パッケージは常に「候補なし」とする安全側デフォルトを維持する（Section 1-3）

## 3-3. 設定導線

Androidの「自動入力サービス」設定でkuraを選択してもらうためのオンボーディングを`SettingsScreen.kt`に追加する。

- `Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE`インテントを起動し、システム設定でkuraを選択できるようにする
- `AutofillManager.hasEnabledAutofillServices()`で現在の設定状態を表示する
- 未設定時はホーム画面やオンボーディングフローでの案内も検討するが、詳細な導線設計は実装時に詰める

## 3-4. 将来課題

- **ブラウザ経由のウェブサイトオートフィル対応**: Section 1-6-3の実機検証を行った上で改めて設計する。最優先の将来課題
- **Save対応**: `onSaveRequest`実装。新規ログイン検知後、既存`EntryCreateScreen`へ遷移し確認・保存させるフロー設計が必要
- **TOTPオートフィル**: `api_list_totp_periods`を活用し、パスワードと合わせてワンタイムコード候補を提示する。Android 11+の`InlinePresentation`活用も合わせて検討
- **分割ログインフローの引き継ぎ**: 複数画面にまたがるログインフォームでの状態引き継ぎ
- **パッケージ⇔ドメインマッピングDBの拡充手段**: ユーザーによる手動追加（アプリ内UIからの登録）や、将来的なDigital Asset Links検証への切り替え・併用
