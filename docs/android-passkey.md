<!-- doc-status: design -->
# Android Passkey (Credential Provider) 対応

# Part 1: 概要

## 1-1. 目的

Androidアプリを、ウェブサイト（ブラウザ経由）およびネイティブアプリが要求するPasskey（WebAuthn discoverable credential）の作成・認証に応答できる**Credential Provider**として振る舞わせる。データモデル・暗号処理は`docs/webauthn-passkey.md`（ブラウザ拡張向け、doc-status: `implemented`）で確立済みのものをそのまま再利用し、本ドキュメントはAndroid固有のプラットフォーム統合（`CredentialProviderService`実装、JNI連携、UI設計）のみを扱う。

`docs/webauthn-passkey.md` 1-1節に「Androidクライアントでの`create()`/`get()`対応は将来追加予定だが本ドキュメントのスコープ外。追加する際は別途Android向け設計ドキュメントを起こす想定」と明記されており、本ドキュメントがそれに該当する。

**対応する機能:**

- Passkeyの新規作成（`CredentialProviderService.onBeginCreateCredentialRequest`への応答）
- 保存済みPasskeyでの認証（`CredentialProviderService.onBeginGetCredentialRequest`への応答）
- ブラウザ（Chrome/Firefox等）発のWebオリジンからのリクエストへの対応
- ネイティブアプリ自身がRPとして発行するリクエストへの対応（パッケージ名⇔ドメインマッピング経由）
- `login`エントリ詳細画面でのPasskey表示（読み取り専用）— これは既存実装済み（`EntryDetailScreen.kt`の`PasskeyField`）であり本ドキュメントの対象外

**対応しない機能（スコープ外として明記）:**

- パスワードクレデンシャル（`BeginGetPasswordOption`/`BeginCreatePasswordCredentialRequest`）への対応。パスワードの自動入力は既存の`KuraAutofillService`（`docs/android-autofillservice.md`）が引き続き担当し、`CredentialProviderService`は`TYPE_PUBLIC_KEY_CREDENTIAL`（Passkey）のみを扱う。2つの仕組みを1つのサービスに統合しない（詳細はPart 2-3）
- Conditional Mediation相当（Android側では「自動サジェスト」に近い挙動だが、`BeginGetCredentialRequest`の扱いとして`CredentialEntry`一覧を返す通常フローと実質的に同じであるため、特別な考慮は不要。ただし初期実装では動作確認を優先し、細かな挙動チューニングは将来対応とする）
- 新規ログイン保存提案（Passkeyには`onSaveRequest`に相当する概念自体が存在しないため、そもそも非該当）

## 1-2. 前提知識：Android Credential Managerの2段階リクエストモデル

AndroidのCredential Manager（`androidx.credentials`、Android 14 / API 34で導入）は、サードパーティアプリが**Credential Provider**として登録され、ブラウザやネイティブアプリからのcreate/get要求に応答できる仕組みを提供する。1Password・Bitwarden・Dashlane等が同じ仕組みでPasskeyプロバイダとして機能している。

リクエストは常に2段階に分かれる。

1. **Query（Begin）フェーズ**: システムが全ての登録済みProviderに`onBeginCreateCredentialRequest`/`onBeginGetCredentialRequest`をブロードキャストし、各Providerは（実際の復号を伴わず）「候補が何件あるか」を`CreateEntry`/`CredentialEntry`のリストとして返す。システムはこれらを集約し、ユーザーに選択UI（システム標準のボトムシート）を提示する。
2. **Selectionフェーズ**: ユーザーがkuraの候補を選択すると、Query時に紐付けた`PendingIntent`が発火し、kuraアプリ自身のActivityが起動する。ここで初めて実際の復号・生体認証・vault-core呼び出しを行い、結果を`setResult()`で返す。

この2段階モデルにより、Query時点ではまだユーザーがkuraを選ぶかどうか分からないため、他社Providerの候補と横並びで表示される段階では機密情報に触れない設計が要求される。ブラウザ拡張の「候補0件ならUIを一切開かない」（`webauthn-passkey.md` Part 4-3）に相当するサイドチャネル配慮は、Androidでは「Query時点でロック中でも候補件数の概算を返さざるを得ない」という制約下でどう扱うかがPart 3-2の論点になる。

## 1-3. vault-core側は実装済み、Android側はゼロから

`vault-core/src/api/webauthn.rs`に以下の3つの公開APIが既に実装されており、ブラウザ拡張（`extension/wasm-bridge`経由）で使われている。Android側の作業は、これらのAPIをJNIで公開し、Credential Manager統合のプラットフォームコードを新設することに限定される。**vault-core自体への変更は原則不要。**

| API | 役割 |
|---|---|
| `api_webauthn_find_credentials(rp_id, allow_credential_ids)` | `rp_id`に一致するPasskey候補（秘密鍵を含まない）を列挙 |
| `api_webauthn_create_credential(entry_id, rp_id, rp_name, user_handle, user_name, user_display_name, exclude_credential_ids)` | 新規Passkeyを生成し`login`エントリに追加。`entry_id`が`None`なら新規エントリ作成 |
| `api_webauthn_get_assertion(entry_id, custom_field_id, client_data_json)` | 既存Passkeyで認証assertionに署名。`sign_count`を持たせない設計のためエントリ更新は行わない |

データ構造（`PasskeyFieldData`）・`sign_count`固定0の設計判断・`public_key`非保持の理由は全て`docs/webauthn-passkey.md` Part 2で確定済みであり、Android版でもそのまま踏襲する。ここで再検討はしない。

# Part 2: 全体アーキテクチャ

## 2-1. CredentialProviderServiceの実装

`androidx.credentials.provider.CredentialProviderService`を継承した`KuraCredentialProviderService`を新設する。

**依存関係の追加（`android/app/build.gradle.kts`）:**

```kotlin
dependencies {
    implementation("androidx.credentials:credentials:1.7.0-alpha02")
}
```

**Manifest宣言（`android/app/src/main/AndroidManifest.xml`への追加）:**

```xml
<service
    android:name=".credential.KuraCredentialProviderService"
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher"
    android:permission="android.permission.BIND_CREDENTIAL_PROVIDER_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.service.credentials.CredentialProviderService" />
    </intent-filter>
    <meta-data
        android:name="android.credentials.provider"
        android:resource="@xml/credential_provider" />
</service>
```

`android.permission.BIND_CREDENTIAL_PROVIDER_SERVICE`はシステムのみがバインド可能にするための必須宣言であり、`KuraAutofillService`が`BIND_AUTOFILL_SERVICE`を要求するのと同じ位置づけ（`docs/android-autofillservice.md` 2-1-1）。

**能力宣言（`android/app/src/main/res/xml/credential_provider.xml`、新設）:**

```xml
<credential-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:settingsSubtitle="@string/credential_provider_settings_subtitle">
    <capabilities>
        <capability name="androidx.credentials.TYPE_PUBLIC_KEY_CREDENTIAL" />
    </capabilities>
</credential-provider>
```

`TYPE_PASSWORD_CREDENTIAL`は宣言しない（1-1節、Part 2-3参照）。

## 2-2. 最小APIレベルとフィーチャーゲーティング

`CredentialProviderService`はAndroid 14（API 34）で導入された仕組みであり、現在のkuraの`minSdk = 26`（`android/app/build.gradle`）を下回る。既存の`KuraAutofillService`（API 26で動作）とは異なり、**Passkeyプロバイダ機能はAPI 34未満のデバイスでは提供できない。**

- `AndroidManifest.xml`の`<service>`宣言自体はAPI34未満の端末にインストールされても害はない（システムがCredential Manager機構自体を持たないため単に呼ばれないだけ）。`targetApi`属性の明示は不要（Lint対応として`tools:targetApi="34"`をservice要素に付与する）
- アプリ内の設定画面（Part 7）は`Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE`でガードし、API34未満では「このOSバージョンではPasskey機能は利用できません」の案内に差し替える
- `minSdk`自体を34に引き上げることはしない。オートフィル機能はAPI26以上の全端末で提供し続ける

## 2-3. 既存AutofillServiceとの役割分担

`KuraAutofillService`（パスワード/TOTPのオートフィル）と`KuraCredentialProviderService`（Passkey）は、Androidシステム上は完全に独立したコンポーネントであり、ユーザーはそれぞれ別々の設定画面（「自動入力サービス」と「パスキーサービス」）で有効化する。両方を同時に有効化することも可能。

一本化しない理由：

- `AutofillService`の`onFillRequest`は`AssistStructure`（画面のView階層）ベースの仕組みであり、Passkeyの`navigator.credentials.create()/get()`呼び出しはフォームフィールドを介さずJS APIとして直接発火するため、そもそも`AssistStructure`の枠組みでは捕捉できない。両者はAndroidが提供する別々のシステムAPIであり、実装を統合する余地がない
- ロック中の認証フロー（`BiometricHelper`/`LockScreen`の再利用）は共通化できるが、フレームワーク自体は分離されたまま

## 2-4. Passkey作成・認証時のドメインマッチングとの整合

`docs/android-autofillservice.md` 2-3にある通り、vaultエントリのドメインマッチングは常に`api_list_login_candidates(domain, strict_subdomain)`に一元化されている。Part 4で述べるOrigin検証で得られた`rp_id`は、`api_webauthn_find_credentials(rp_id, ...)`に渡す際は完全一致（`docs/webauthn-passkey.md` 2-2の`rp_id`フィールドと同じセマンティクス）であり、オートフィルのeTLD+1サブドメイン許容マッチングとは別ロジックである点に注意する（`vault-core/src/vault/webauthn.rs`の`find_passkey_credentials`は`data.rp_id != rp_id`で完全一致のみを見ている）。

# Part 3: リクエストフロー設計

## 3-1. Createフロー

```
クライアントアプリ (ブラウザ or ネイティブアプリ)
  │ CredentialManager.createCredential(CreatePublicKeyCredentialRequest)
  ▼
システム: 登録済み全Providerへブロードキャスト
  ▼
KuraCredentialProviderService.onBeginCreateCredentialRequest(BeginCreateCredentialRequest)
  │ request が BeginCreatePublicKeyCredentialRequest か判定
  │ Part 4のOrigin検証でrp_idを確定
  │ vaultロック中でも、ここではPendingIntentを1件返すのみで復号は行わない
  ▼
BeginCreateCredentialResponse(createEntries = [CreateEntry(...)])
  ▼
システム: 他社Providerの候補と合わせてユーザーに選択UIを提示
  ▼
ユーザーがkuraのCreateEntryを選択 → PendingIntent発火
  ▼
PasskeyCreateActivity 起動
  │ PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
  │ vaultロック中なら認証(BiometricHelper/マスターパスワード)を先に要求
  │ アンロック後、api_list_login_candidates相当の照合で紐付け先loginエントリを選択させる
  │   （webauthn-passkey.md 3-7と同じ「1件なら提案・複数件なら選択・0件なら新規作成」分岐）
  ▼
vault.api_webauthn_create_credential(...) 呼び出し（JNI経由）
  ▼
PendingIntentHandler.setCreateCredentialResponse(result, CreatePublicKeyCredentialResponse(...))
  ▼
setResult(RESULT_OK, result); finish()
  ▼
呼び出し元アプリにPasskey作成結果が返る
```

## 3-2. Getフロー

```
クライアントアプリ (ブラウザ or ネイティブアプリ)
  │ CredentialManager.getCredential(GetCredentialRequest)
  ▼
KuraCredentialProviderService.onBeginGetCredentialRequest(BeginGetCredentialRequest)
  │
  ├─ vaultアンロック済み
  │     │ Part 4のOrigin検証でrp_idを確定
  │     │ vault.api_webauthn_find_credentials(rp_id, allowCredentials) をJNI経由で呼び出し
  │     │   （秘密鍵を含まない候補一覧のみ。Query時点でこの程度の復号は許容する。理由は3-3参照）
  │     │
  │     ├─ 候補0件 → CredentialEntry無しのBeginGetCredentialResponseを返す
  │     │            （kuraはこのRPに対してPasskeyを持たない旨をシステムに伝える。
  │     │              他社Providerの候補があればそちらのみユーザーに提示される）
  │     │
  │     └─ 候補1件以上 → 各候補をPublicKeyCredentialEntryとして列挙して返す
  │
  └─ vaultロック中
        │ AuthenticationAction を1件返す
        │ （android-autofillservice.md 2-2の認証プレースホルダーDatasetと同じ考え方）
        ▼
ユーザーがCredentialEntry（またはAuthenticationAction）を選択 → PendingIntent発火
  ▼
PasskeyGetActivity 起動
  │ ロック中だった場合はここでBiometricHelper/マスターパスワード認証
  │ PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
  ▼
vault.api_webauthn_get_assertion(entry_id, custom_field_id, client_data_json) 呼び出し（JNI経由）
  ▼
PendingIntentHandler.setGetCredentialResponse(result, GetCredentialResponse(PublicKeyCredential(...)))
  ▼
setResult(RESULT_OK, result); finish()
```

## 3-3. Query時点での「アンロック済みなら候補を列挙する」設計判断

ブラウザ拡張版（`webauthn-passkey.md` Part 4-3）は「候補0件ならUIを一切開かない」というサイドチャネル対策を取っているが、これは拡張機能が候補の有無を自分だけで完結して判断し、ポップアップウィンドウの開閉そのものを制御できたことに依る。Androidの2段階モデルでは、**Query（Begin）フェーズの時点でシステムに`CredentialEntry`の有無を返す必要があり、この時点の応答自体がシステム標準UIに反映される**ため、「候補があるかないか」という情報はQueryフェーズで既にシステムに渡さざるを得ない。

したがって、Android版ではブラウザ拡張と同水準のサイドチャネル遮断は実現できない（Androidプラットフォームの制約であり、kura固有の設計不備ではない）。Query時点で候補一覧を返すこと自体は`api_webauthn_find_credentials`が秘密鍵を含まない情報のみを返す設計（Part 1-3の表）であるため、露出する情報は「kuraがこのRP向けのPasskeyを持っているか、いくつ持っているか」に限られ、秘密鍵や署名結果が漏れることはない。

ロック中は候補の有無を判定するために復号が必要なため、Query時点では常に`AuthenticationAction`のみを返し（候補が実際にあるかどうかに関わらず）、アンロック後のSelectionフェーズで初めて候補を確定する。これはブラウザ拡張の「ロック中はcreate/getいずれも`{kind:'locked'}`で儀式ウィンドウを先に開く」（`webauthn-passkey.md` 3-6）と同じ考え方であり、「vaultがロック中かどうか」はAuthenticationActionの提示から推測されうるが、「ロック中のvaultがこのRP用のPasskeyを持っているか」はアンロックしない限り秘匿される。

# Part 4: Origin検証・呼び出し元判定

## 4-1. ブラウザ発オリジンの取得

Chrome等の主要ブラウザは、Android OS（またはGoogle Play Servicesが提供するCredential Manager実装）に「特権アプリ（privileged app）」として登録されている。`BeginCreateCredentialRequest`/`BeginGetCredentialRequest`から取得できる`CallingAppInfo`に対し、`getOrigin(privilegedAllowlist)`を呼ぶことで、ブラウザが渡してきたWebオリジン（`https://example.com`形式）をそのまま取得できる。

```kotlin
val origin: String? = callingAppInfo.getOrigin(privilegedAllowlistJson)
```

`privilegedAllowlistJson`はGoogleが公開する既知ブラウザの許可リスト（パッケージ名 + 署名指紋 + 対応オリジン形式）であり、kura側でChromeやFirefoxを個別に許可申請する必要はない（1Password・Bitwarden等の実装と同様）。既存方針（`feedback_external_assets`：外部データソースはassetsに配置しビルド時DLは避ける）に倣い、このJSONは`android/app/src/main/assets/gpm_privileged_allowlist.json`としてリポジトリにバンドルし、PSL（`assets/`）と同様に手動で定期更新する運用とする。

**注意：kura自身をこのallowlistに載せる必要はない。** allowlistは「どのブラウザ／呼び出し元アプリを信頼してWebオリジンを代弁させるか」をシステム側が判断するためのものであり、kuraは受け取る側（Provider）であるため対象外。Digital Asset Links（`assetlinks.json`）もこの経路では不要（`docs/android-autofillservice.md` 1-3で触れているassetlinks.json不採用の経緯とは別の理由だが、結論として今回もassetlinks.jsonは不要という点で一致する）。

## 4-2. ネイティブアプリ発オリジンの扱い

`getOrigin()`がnull（呼び出し元がallowlistに載っていない一般アプリ、つまり大半のネイティブアプリ）の場合、`CallingAppInfo.signingInfo`から署名ベースのorigin（`android:apk-key-hash:<base64>`形式）を算出できるが、これはkuraのPasskeyデータの`rp_id`（ドメイン名前提、Part 1-3参照）とは形式が一致せず、そのままでは既存Passkeyと照合できない。

ネイティブアプリ自身がRPとしてPasskeyを要求するケース（例：銀行アプリが自社Webサイトと同じアカウントのPasskeyでログインさせたい場合）に対応するため、既存の`PackageDomainMap`（`android/app/src/main/java/net/meshpeak/kura/autofill/PackageDomainMap.kt`、`assets/package_domains.json`によるパッケージ名⇔ドメインの手動キュレーションDB、`docs/android-autofillservice.md` 3-2-1）を流用し、`callingAppInfo.packageName`からドメイン（`rp_id`として使う値）を引く。

```kotlin
val packageName = callingAppInfo.packageName
val rpId = PackageDomainMap.domainFor(context, packageName)
    ?: return /* 未登録パッケージはPasskey機能も候補なし。オートフィルと同じ安全側デフォルト */
```

**セキュリティ上の限界を明記する:** この経路はDigital Asset Linksのような暗号学的な所有権証明を伴わない。`PackageDomainMap`はkuraチームが手動でキュレーションするデータであり、「そのパッケージ名のアプリが本当にそのドメインの正規運営者である」ことをAndroid OSが保証しているわけではない。ただし、Android自体がAPKの署名検証によってパッケージ名の詐称（同一パッケージ名を騙る別アプリのインストール）を防いでいるため、実質的なリスクは「`PackageDomainMap`への誤ったマッピング登録」に限定される。この経路は**オプトイン的な位置づけ**とし、初期実装では`package_domains.json`に明示的に登録されたパッケージのみを対象にする（未登録は常に候補なし、という既存方針をPasskeyでも維持）。

## 4-3. rp_id検証のまとめ

| 呼び出し元 | rp_idの取得方法 | 追加検証 |
|---|---|---|
| ブラウザ（allowlist登録済み） | `callingAppInfo.getOrigin(allowlist)`で得たWebオリジンのホスト名 | なし（OSが署名検証済み） |
| ネイティブアプリ（`PackageDomainMap`登録済み） | パッケージ名からのドメイン引き当て | パッケージ名自体はAPK署名検証によりOSが保証 |
| 上記いずれにも該当しない呼び出し元 | 取得不可 | 候補なし・作成不可として扱う（安全側デフォルト） |

いずれの経路で取得した`rp_id`も、`api_webauthn_find_credentials`/`api_webauthn_create_credential`にそのまま渡す。vault-core側では`rp_id`の完全一致でのみ照合するため（Part 2-4）、Android側で正規化（小文字化等）が必要な場合はJNI呼び出し前に行う。

# Part 5: vault-core / JNI連携設計

## 5-1. rust-jniへの追加

`android/rust-jni/src/lib.rs`は、`MANAGERS`（`vault_id`ごとの`Arc<VaultManager>`マップ）・`with_manager`ヘルパー・`jni_catch`（panicをJava例外に変換する共通ラッパー）という既存パターンを持つ。WebAuthn関連の3関数もこのパターンに従って追加する。

```rust
#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_webauthnFindCredentials(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    rp_id: JString,
    allow_credential_ids_json: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let rp_id = get_string(env, &rp_id)?;
        let allow_ids: Vec<String> = serde_json::from_str(&get_string(env, &allow_credential_ids_json)?)
            .map_err(|e| format!("Invalid allow_credential_ids JSON: {}", e))?;
        let candidates = with_manager(&vid, |m| m.api_webauthn_find_credentials(rp_id, allow_ids))
            .map_err(|e| format!("Failed to find passkey credentials: {}", e))?;
        let json = serde_json::to_string(&candidates).unwrap_or_else(|_| "[]".to_string());
        new_jstring(env, &json)
    })
}
```

`api_webauthn_create_credential`・`api_webauthn_get_assertion`も同様に、既存の`createEntry`/`listLoginCandidates`と同じ引数変換パターン（`JString` → `String`、複合型はJSON文字列でシリアライズして受け渡し）でラップする。

## 5-2. VaultBridge.ktへの追加

```kotlin
// WebAuthn / Passkey operations
external fun webauthnFindCredentials(vaultId: String, rpId: String, allowCredentialIdsJson: String): String
external fun webauthnCreateCredential(
    vaultId: String,
    entryId: String?,
    rpId: String,
    rpName: String?,
    userHandle: String,
    userName: String,
    userDisplayName: String,
    excludeCredentialIdsJson: String
): String
external fun webauthnGetAssertion(
    vaultId: String,
    entryId: String,
    customFieldId: String,
    clientDataJson: String
): String
```

## 5-3. clientDataJSON・attestationObjectの構築責務

`docs/webauthn-passkey.md` 3-4と同じ方針を踏襲する：CBOR/authenticatorData/attestationObjectのバイト単位の構築とECDSA署名は全てvault-core（Rust）側の責務とし、Android（Kotlin）側では組み立てない。ただし`clientDataJSON`自体の構築元がブラウザ拡張とは異なる点に注意する。

- ブラウザ拡張では`clientDataJSON`をTypeScript側（Service Worker）が`{type, challenge, origin, crossOrigin}`から組み立てていた
- Android Credential Managerでは、`CreatePublicKeyCredentialRequest`/`GetPublicKeyCredentialOption`が`clientDataHash`（システム側で既に計算済みのハッシュ値）を提供するケースと、`requestJson`から`clientDataJSON`をアプリ側で組み立てる必要があるケースの両方がありうる。**Part 4-1の特権アプリ経由（ブラウザ発）では`clientDataHash`をそのまま使い、自前でJSONを組み立てない**（システムが検証済みのoriginを埋め込み済みのため、アプリ側での再構築はかえって整合性リスクを生む）。ネイティブアプリ発（`clientDataHash`が渡されないケース）では、Part 4-2で確定した`rp_id`ベースのoriginを使い`{type, challenge, origin}`形式のJSONをKotlin側で組み立てた上でvault-coreに渡す
- `vault-core`側のAPIシグネチャ（`client_data_json: String`）は変更しない。Android側でどちらの経路でも最終的に文字列化されたclientDataJSONを渡す形に揃える

# Part 6: UI/UXフロー設計

拡張機能の`extension/src/popup/screens/webauthn/`（`CreateConfirm.tsx`, `SelectCredential.tsx`, `UnlockRitual.tsx`）に相当する画面群を、Android Activity + Jetpack Composeで実装する。

## 6-1. Createフロー画面

新設: `PasskeyCreateActivity`（`android/app/src/main/java/net/meshpeak/kura/credential/`配下、`AutofillUnlockActivity`と同様`exported=false`, `launchMode=singleTask`で宣言）

| 画面状態 | 対応するComposable | 拡張機能側の対応画面 |
|---|---|---|
| ロック中 → 認証要求 | `PasskeyUnlockScreen`（既存`AutofillAuthScreen`のロジックを再利用） | `UnlockRitual.tsx` |
| 紐付け先エントリ選択（1件一致は提案、複数件は選択、0件は新規作成） | `PasskeyCreateConfirmScreen` | `CreateConfirm.tsx` |
| 既に登録済み（`exclude_credential_ids`一致） | エラー表示、閉じるとキャンセル扱いで呼び出し元に返す | `{kind:'error', reason:'already_registered'}` |

紐付け先エントリの判定ロジック（1件一致→提案、複数件→選択、0件→新規`login`エントリ作成）は`webauthn-passkey.md` 3-7の表をそのまま踏襲する。

## 6-2. Getフロー画面

新設: `PasskeyGetActivity`（同様の宣言）

Query（Begin）フェーズで`CredentialEntry`を複数返している場合、システム標準UIが既に候補選択の役割を担っているため、`PasskeyGetActivity`自体は「選択された1件について認証してassertionを返すだけ」のシンプルな画面になる（拡張機能の`SelectCredential.tsx`のような候補一覧UIをAndroid側で独自に持つ必要はない。これはシステム標準ボトムシートが候補一覧表示を代替するため）。

| 画面状態 | 対応するComposable |
|---|---|
| ロック中 → 認証要求（`AuthenticationAction`経由で遷移） | `PasskeyUnlockScreen`（6-1と共通） |
| 認証済み → assertion生成中のローディング | 数百ms程度で完了する想定のため簡易スピナーで十分 |

## 6-3. 既存コンポーネントの再利用

- `BiometricHelper`（`Context`非依存で`Cipher`取得可能）と`FragmentActivity`ベースの`BiometricPrompt`表示は`AutofillUnlockActivity`と全く同じ形で再利用する
- `PasskeyField`（`EntryDetailScreen.kt`の読み取り専用表示コンポーネント）はそのまま維持し、Create完了後の遷移先やGet候補選択の見た目の参考にする（`private_key`を画面に一切出さない設計方針、`docs/webauthn-passkey.md`と同じ思想）

# Part 7: 設定画面統合

kuraアプリの設定画面に、Credential Managerの「パスキーサービス」設定へのショートカットを追加する。

```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
    val intent = Intent(Settings.ACTION_CREDENTIAL_PROVIDER)
    startActivity(intent)
} else {
    // API34未満: 機能自体が使えない旨を案内し、ボタン自体を非表示にする
}
```

現在の有効化状態表示は`androidx.credentials.CredentialManager`の`isEnabledProvider`相当のAPIで取得する（Autofillの`AutofillManager.hasEnabledAutofillServices()`、`docs/android-autofillservice.md` 3-3と対になる導線）。

# Part 8: セキュリティ上の注意点

1. **秘密鍵はFFI境界を一切越えない。** ブラウザ拡張と同じ原則をJNI境界にもそのまま適用する。JNI関数が返すのは候補一覧（秘密鍵を含まない）・attestationObject・signatureのみ。
2. **Origin検証の起点はシステムが検証したもののみを信頼する。** ブラウザ発は`CallingAppInfo.getOrigin(allowlist)`の戻り値、ネイティブアプリ発は署名検証済みの`packageName`のみを起点にする。リクエストJSON内の`origin`/`rpId`フィールドをアプリ側で無条件に信用しない（システムAPIが提供する`CallingAppInfo`経由の値と突き合わせる）。
3. **`PackageDomainMap`によるドメイン紐付けの限界を利用者に説明可能な形にしておく。** Digital Asset Linksのような暗号学的証明ではなく手動キュレーションであるため、`package_domains.json`への追加は既存のオートフィル用マッピングと同じ慎重さ（誤登録防止のレビュー）で運用する（Part 4-2）。
4. **PendingIntentは`FLAG_MUTABLE`必須、`FLAG_ONE_SHOT`は使用しない。** ユーザーが選択画面から戻って再選択する可能性があるため（Android公式ガイダンス通り）。
5. **ロック中のQuery応答からの情報漏洩は許容範囲を明記する。** Part 3-3の通り、「vaultが現在ロックされているか」はAuthenticationActionの提示から推測されうるが、「ロック中のvaultが特定RP向けのPasskeyを持っているか」はアンロックしない限り秘匿される。この非対称性はブラウザ拡張版と同じ設計判断であり、vaultのロック状態自体は既存のAutofillサービスでも同様に観測されうる情報（`docs/webauthn-passkey.md` Part 4-3の議論と同じ理由）である。
6. **タイムアウト・キャンセル処理。** `CancellationSignal`が`onBeginCreateCredentialRequest`/`onBeginGetCredentialRequest`に渡されるため、これを尊重して処理を中断できるようにする。Selectionフェーズ（Activity）がユーザー操作待ちのままバックグラウンドに置かれた場合の扱いは、既存`AutofillUnlockActivity`のライフサイクル処理を参考にする。

# Part 9: 未実装・将来対応予定

> **未実装（将来対応予定）**
>
> - パスワードクレデンシャル（`BeginGetPasswordOption`/`BeginCreatePasswordCredentialRequest`）への対応。将来的にAutofillServiceとCredentialProviderServiceの重複領域をどう整理するかは別途検討する
> - Conditional Mediation相当の挙動チューニング（システム標準UIの候補提示順序・表示内容の最適化）
> - `PackageDomainMap`を介さない、より厳格なネイティブアプリ向けドメイン所有権検証（Digital Asset Links相当の仕組みの採用検討）
> - 複数vault対応時のCredential Provider側の切り替えUI（現状は他機能と同様、固定vault IDを前提とする）
