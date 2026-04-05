<!-- doc-status: design -->
# Android オートフィル機能 設計書

## 1. 概要

Androidの **Autofill Framework**（API 26+）を利用して、kuraをOSレベルのパスワードマネージャーサービスとして登録する。これにより、他のアプリやブラウザのログインフォームで、vaultに保存されたクレデンシャルの入力候補表示・自動入力が可能になる。

### 全体アーキテクチャ

```
他のアプリ / ブラウザ
  └── ログインフォーム
        ├── OS が AssistStructure を収集
        └── AutofillManager が kura に問い合わせ
              ↕
KuraAutofillService（同一プロセス）
  ├── フィールド検出（AssistStructure 解析）
  ├── エントリマッチング（URL / パッケージ名）
  └── VaultBridge（JNI）
        └── vault_core（暗号化・復号）
```

ユーザーがフォームフィールドにフォーカスすると、OSが `AssistStructure`（フォームのメタデータ）を収集し、kuraの `AutofillService` に渡す。kuraはフィールドを解析してクレデンシャル候補を返し、ユーザーが選択するとフィールドに値が入力される。

## 2. 対応範囲

### 対応するフォームタイプ

| タイプ | 説明 |
|--------|------|
| LOGIN | ユーザー名 + パスワード |
| LOGIN_USERNAME | ユーザー名のみ（分割ログインの1画面目） |
| LOGIN_PASSWORD | パスワードのみ（分割ログインの2画面目） |

初期リリースではログインフォームのみ対応する。クレジットカード等の対応は将来的に追加可能。

### 対応するコンテキスト

| コンテキスト | 対応 | 備考 |
|-------------|------|------|
| ネイティブアプリ | ○ | packageNameでマッチ |
| WebView内フォーム | ○ | webDomainでマッチ |
| ブラウザ（Chrome等） | ○ | WebViewと同様 |

## 3. Credential Manager API との関係

Android 14（API 34）で導入された **Credential Manager API** は、パスワード・パスキー・フェデレーテッドログインを統合的に扱う新しいAPI。

### 方針

**初期リリースでは Autofill Framework のみ実装する。**

| 観点 | Autofill Framework | Credential Manager |
|------|-------------------|-------------------|
| 対応API | 26+ | 34+ |
| カバー範囲 | kuraのminSdk 26の全デバイス | Android 14+のみ |
| パスキー対応 | × | ○ |
| 実装複雑度 | 中 | 高（CredentialProviderService + UI） |

Credential Manager APIは将来的にパスキー対応と合わせて追加する。`CredentialProviderService`として独立した実装になるが、`VaultRepository`を共有できるため、既存のAutofill実装に影響しない。

## 4. サービスアーキテクチャ

### コンポーネント構成

```
AndroidManifest.xml
  └── KuraAutofillService（AutofillService継承）
        ├── onFillRequest()   → クレデンシャル候補を返す
        ├── onSaveRequest()   → 新規クレデンシャルを保存
        └── onConnected() / onDisconnected()

  └── AutofillAuthActivity（認証UI）
        ├── マスターパスワード入力
        ├── 生体認証
        └── 認証成功後に FillResponse を返却
```

### 同一プロセスモデル

`KuraAutofillService`はアプリの**メインプロセス**で動作する。これにより：

- `VaultBridge`（JNI singleton）のセッション状態を共有できる
- メインアプリでアンロック済みなら、AutofillServiceでも即座にvaultにアクセスできる
- IPC不要、vault二重ロードなし

### Manifest登録

```xml
<service
    android:name=".autofill.KuraAutofillService"
    android:exported="true"
    android:permission="android.permission.BIND_AUTOFILL_SERVICE">
    <intent-filter>
        <action android:name="android.service.autofill.AutofillService" />
    </intent-filter>
    <meta-data
        android:name="android.autofill"
        android:resource="@xml/autofill_service_configuration" />
</service>

<activity
    android:name=".autofill.AutofillAuthActivity"
    android:exported="false"
    android:theme="@style/Theme.Kura" />
```

### サービス有効化

ユーザーはAndroidの「設定 > パスワードとアカウント > 自動入力サービス」からkuraを選択する必要がある。kuraの設定画面から直接この設定画面を開くショートカットを提供する。

## 5. フィールド検出

### AssistStructure の解析

Autofill Frameworkは、対象アプリのビュー階層を `AssistStructure` として提供する。各ノード（`ViewNode`）から以下の情報を取得できる。

| 情報 | 取得元 | 信頼度 |
|------|--------|--------|
| autofillHints | `ViewNode.getAutofillHints()` | 最高 |
| HTML属性 | `ViewNode.getHtmlInfo()` | 高（WebView） |
| inputType | `ViewNode.getInputType()` | 中 |
| idEntry / hint | `ViewNode.getIdEntry()`, `ViewNode.getHint()` | 低 |

### 検出優先順位

**Tier 1: autofillHints（最優先）**

Android開発者がビューに設定する標準的なヒント。設定されていれば最も信頼性が高い。

| ヒント値 | フィールドタイプ |
|---------|--------------|
| `AUTOFILL_HINT_USERNAME` | ユーザー名 |
| `AUTOFILL_HINT_EMAIL_ADDRESS` | メールアドレス（ユーザー名として扱う） |
| `AUTOFILL_HINT_PASSWORD` | パスワード |
| `AUTOFILL_HINT_NEW_PASSWORD` | 新しいパスワード |
| `AUTOFILL_HINT_PHONE` | 電話番号（ユーザー名として扱う） |

**Tier 2: HTML属性（WebView）**

WebViewのフォームでは `HtmlInfo` から HTML の `type`, `name`, `autocomplete` 属性を取得できる。ブラウザ拡張版（Section 3.1）と同様のシグナルマッチングを適用する。

| autocomplete値 | フィールドタイプ |
|----------------|--------------|
| `username` | ユーザー名 |
| `current-password` | パスワード |
| `new-password` | 新しいパスワード |
| `email` | メールアドレス（ユーザー名として扱う） |

**Tier 3: inputType フラグ**

`autofillHints` も HTML属性もない場合、`inputType` から推定する。

| inputType | フィールドタイプ |
|-----------|--------------|
| `TYPE_TEXT_VARIATION_PASSWORD` | パスワード |
| `TYPE_TEXT_VARIATION_WEB_PASSWORD` | パスワード |
| `TYPE_TEXT_VARIATION_VISIBLE_PASSWORD` | パスワード |
| `TYPE_TEXT_VARIATION_EMAIL_ADDRESS` | メールアドレス（ユーザー名候補） |
| `TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS` | メールアドレス（ユーザー名候補） |

**Tier 4: ヒューリスティック（フォールバック）**

上記いずれにも該当しない場合、`idEntry`（リソースID名）と `hint`（ヒントテキスト）のテキストパターンマッチングで推定する。

| パターン（正規表現、大文字小文字無視） | フィールドタイプ |
|--------------------------------------|--------------|
| `user\|login\|account\|email\|phone\|id` | ユーザー名 |
| `pass\|pwd\|senha\|contrase` | パスワード |

### フォームタイプの分類

検出されたフィールドの組み合わせからフォームタイプを判定する。ブラウザ拡張版（Section 3.2）と同様のロジック。

```
ユーザー名候補 + パスワード → LOGIN
ユーザー名候補のみ         → LOGIN_USERNAME
パスワードのみ             → LOGIN_PASSWORD
```

## 6. エントリマッチング

### WebView / ブラウザの場合

`AssistStructure` の `webDomain` を使用する。保存されたエントリの `url` フィールドからドメインを抽出し、マッチングする。

**マッチングロジック：**
1. エントリの `url` からホスト名を抽出する
2. `webDomain` とホスト名のeTLD+1が一致するエントリを候補とする
3. 複数候補がある場合はサブドメインの完全一致を優先する

### ネイティブアプリの場合

`AssistStructure` の `packageName` を使用する。

**制約:** パッケージ名とURLの対応関係を汎用的に解決する仕組み（Digital Asset Linksなど）は初期リリースでは実装しない。以下の簡易方式を採用する。

1. **完全一致**: エントリのURLにパッケージ名と一致するドメインが含まれている場合（例: `com.example.app` → `example.com`）に候補とする
2. **フォールバック**: 一致するエントリがなければ、全ログインエントリを候補として表示する（最大5件、最近使用順）

ユーザーは手動でエントリを検索・選択することもできる。

### マッチング結果のキャッシュ

同一セッション中に同じ `webDomain` / `packageName` のリクエストが複数回来る場合がある（フォーム内の各フィールドごとに `onFillRequest` が呼ばれる可能性）。マッチング結果をメモリ上にキャッシュし、パフォーマンスを確保する。キャッシュはvaultロック時にクリアする。

## 7. Vault ロック時のフロー

### 認証用 Dataset

vaultがロック状態で `onFillRequest` を受けた場合、通常のクレデンシャル候補の代わりに**認証用Dataset**を返す。

```
FillResponse
  └── Dataset: "kura - タップしてアンロック"
        └── IntentSender → AutofillAuthActivity
```

ユーザーがこのDatasetをタップすると `AutofillAuthActivity` が起動し、マスターパスワード入力または生体認証でvaultをアンロックする。

### AutofillAuthActivity のフロー

1. アクティビティ起動時に `Intent` から `FillRequest` 情報を受け取る
2. マスターパスワード入力画面または生体認証プロンプトを表示
3. 認証成功後：
   - vaultをアンロックする
   - `AssistStructure` を再解析してクレデンシャル候補の `FillResponse` を構築する
   - `setResult(RESULT_OK, intent)` で `FillResponse` を返却する
4. 認証失敗・キャンセル時：
   - `setResult(RESULT_CANCELED)` を返却する

### 生体認証との統合

既存の `BiometricHelper` を再利用する。生体認証が設定済みの場合、`AutofillAuthActivity` は直接生体認証プロンプトを表示する。マスターパスワードを暗号化して保存している既存の仕組みにより、生体認証成功時にvaultをアンロックできる。

## 8. FillResponse の構築

### Dataset の構成

各候補エントリに対して1つの `Dataset` を作成する。

```
FillResponse
  ├── Dataset: "Example.com (user@example.com)"
  │     ├── ユーザー名フィールド → AutofillValue("user@example.com")
  │     └── パスワードフィールド → AutofillValue("password123")
  ├── Dataset: "Example Corp (admin@example.com)"
  │     ├── ユーザー名フィールド → AutofillValue("admin@example.com")
  │     └── パスワードフィールド → AutofillValue("p@ssw0rd")
  └── （最大5件）
```

### Dataset の表示情報

各 `Dataset` には `RemoteViews` で表示用のUIを設定する。

- **タイトル**: エントリ名
- **サブタイトル**: ユーザー名（またはメールアドレス）
- **アイコン**: kuraのアプリアイコン

### パスワードフィールドのみの場合（分割ログイン）

パスワードフィールドのみが検出された場合、ユーザー名フィールドへの `AutofillValue` 設定は省略する。`Dataset` の表示にはエントリ名とユーザー名を含め、どのアカウントのパスワードかを識別できるようにする。

## 9. 保存フロー

### onSaveRequest

ユーザーがフォームを送信した際、OSが `onSaveRequest` を呼び出す。kuraは入力された値を取得し、新規エントリの保存または既存エントリの更新を提案する。

**前提条件:** vaultがアンロック状態であること。ロック中は保存処理を行わない（`onSaveRequest` で認証フローを挟むのはUX上複雑になるため、初期リリースでは対応しない）。

### 保存フロー

1. `SaveRequest` から `AssistStructure` を取得する
2. フィールドを解析し、ユーザー名とパスワードの値を抽出する
3. `webDomain` / `packageName` を取得する
4. 既存エントリとの照合：
   - **一致するエントリあり・パスワードが異なる** → 更新確認の通知を表示
   - **一致するエントリなし** → 新規保存確認の通知を表示
   - **一致するエントリあり・パスワード同一** → 何もしない
5. ユーザーが確認した場合、vaultに保存し同期する

### 保存確認UI

`onSaveRequest` の `SaveCallback` を利用するか、通知（Notification）で保存確認UIを提供する。確認なしの自動保存は行わない。

### SaveInfo の設定

`FillResponse` の構築時に `SaveInfo` を設定し、OSに対して保存対象のフィールドを通知する。

```
SaveInfo
  ├── SaveInfo.SAVE_DATA_TYPE_USERNAME
  ├── SaveInfo.SAVE_DATA_TYPE_PASSWORD
  └── requiredIds: [usernameFieldId, passwordFieldId]
```

## 10. セキュリティ設計

### クレデンシャルの取り扱い

- `Dataset` に設定する `AutofillValue` はOSのAutofill Frameworkを通じて直接フォームフィールドに注入される。kuraから対象アプリへの直接的なIPC通信は発生しない
- `FillResponse` のキャッシュ（`FillResponse.setIgnoredIds()`等）は使用しない。毎回vault_coreから値を取得する
- vaultロック時にメモリ上のキャッシュを全てクリアする

### フィッシング対策

**ブラウザ（WebView）の場合：**
- `webDomain` はOSが提供するため、対象アプリがこの値を偽装することはできない
- eTLD+1ベースのマッチングにより、`login.example.com` と `example.com.evil.com` を区別できる

**ネイティブアプリの場合：**
- `packageName` はOSが提供する値であり、偽装できない
- ただし、パッケージ名からURLへのマッチングは不完全なため（Section 6）、関連のないアプリにクレデンシャルが表示される可能性はある。ユーザーが明示的に候補を選択する操作が必要なため、リスクは限定的

### ロック状態の厳格な管理

- `onFillRequest` の冒頭で必ず `VaultBridge.isUnlocked()` を確認する
- アンロック状態でなければ認証用Datasetのみを返す
- アプリのオートロック設定（バックグラウンド移行後の自動ロック）はAutofillServiceにも適用される

## 11. 設定画面

kuraの設定画面に以下の項目を追加する。

| 設定項目 | 説明 | デフォルト |
|---------|------|----------|
| オートフィルサービスを有効化 | Androidの自動入力設定画面を開く | — |
| オートフィル機能の有効/無効 | kura内でオートフィル応答を制御する | 有効 |

「オートフィルサービスを有効化」はAndroidの設定画面へのショートカットであり、kura側で直接制御するものではない。

## 12. 制限事項

| 制限 | 理由 |
|------|------|
| ネイティブアプリでのURL完全マッチングは不可 | Digital Asset Linksの実装コストが大きく、初期リリースでは見送り |
| ロック中の保存フローは非対応 | `onSaveRequest` 内での認証フローはUX上の複雑性が高い |
| クレジットカード等の対応は初期リリースでは見送り | ログインフォームのみに集中 |
| TOTP自動入力は非対応 | Autofill Frameworkが OTPフィールドの標準ヒントを持たない。将来的に `AUTOFILL_HINT_SMS_OTP` 等の活用を検討 |
| カスタムキーボード（IME）との干渉 | 一部のIMEがAutofill Frameworkの候補表示を妨げる場合がある。OS側の制約 |
| Android 8.0-8.1（API 26-27）での挙動差 | Autofill Frameworkの初期バージョンでは一部のアプリ互換性に問題がある場合がある |

## 13. 将来的な拡張

| 機能 | 概要 |
|------|------|
| Credential Manager API | API 34+向けに `CredentialProviderService` を追加し、パスキー対応を含める |
| Digital Asset Links | パッケージ名とURLの公式な対応関係を利用した厳密なマッチング |
| クレジットカード対応 | `SAVE_DATA_TYPE_CREDIT_CARD` への対応 |
| インライン候補表示 | Android 11+の `InlineSuggestionsRequest` によるキーボード上での候補表示 |
| 除外アプリリスト | 特定のアプリでオートフィルを無効化する設定 |
