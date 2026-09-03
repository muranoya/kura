<!-- doc-status: design -->
# カスタムフィールドのオートフィル対応（セレクタベース）

本ドキュメントは未実装の設計書である。実装が進み次第、`docs/extension-autofill.md`（Part 3）に統合し、本ドキュメントの `doc-status` を更新する。

**本機能はパターンDB（[`docs/extension-pattern-db.md`](extension-pattern-db.md)）とは独立した並行の仕組みである。** `extension/patterns/`、`extension/src/content/pattern-detector.ts`、`extension/src/content/pattern-types.ts`、`extension/src/content/field-classifier.ts` には一切変更を加えない。

# Part 1: 背景・要件・スコープ

## 1-1. 課題

現状のブラウザ拡張オートフィル（詳細: [`docs/extension-autofill.md`](extension-autofill.md)）は、`FieldType`（`username` / `password` / `totp` / `cc_number` / `cc_exp` / `cc_cvc` / `cc_name` の7種固定）に分類されたフィールドのみをオートフィル対象にする。この分類は `extension/src/content/field-classifier.ts`（ヒューリスティック）と `extension/src/content/pattern-detector.ts`（パターンDB）の2系統で行われるが、いずれもカスタムフィールドを一切参照しない。

一方で、ログインにusername/password以外の要素を要求するサイトが存在する。例えばAWSのログイン画面では、Account ID or alias / IAM username / password の3組の入力が必要である。username/passwordは既存のログインエントリで賄えるが、Account ID相当の値はカスタムフィールドとして保存する以外になく、それをページ上のDOM要素へ自動入力する手段が現状ない。

## 1-2. 解決方針

カスタムフィールド自体に「ページ上のどのDOM要素にマッチさせるか」を指定する**セレクタ情報**を持たせ、vaultファイルに永続化する、**エントリ固有（per-entry）の仕組み**を新設する。

パターンDB（サイト単位、ビルド時に全ユーザーへ共有バンドルされるリソース）を拡張する案は採用しない。Account ID欄のようなカスタムフィールドの対応関係は個々のユーザーの1エントリにしか関係しない情報であり、これを共有パターンDBに載せるのは責務のスコープが合わない。また、`field-classifier.ts` は「false positiveゼロを最優先し、基本ロジックは狭く保つ」という既存方針（[`docs/extension-pattern-db.md`](extension-pattern-db.md) 1-1節）があり、ユーザー定義で名前も意味も無制限なカスタムフィールドを汎用ヒューリスティックで検出することは、この方針と原理的に相容れない。他に検討した代替案はPart 6を参照。

## 1-3. スコープ

**V1で対応する範囲：**

- 既存の分類フィールド（username/password等）にフォーカスしてドロップダウンから候補エントリを選択した際、そのエントリが持つセレクタ設定済みカスタムフィールドを、検出済みフォームコンテナ内から探して併せて自動入力する。
- カスタムフィールドのセレクタ情報の設定・表示を、Desktop / Android / ブラウザ拡張の3プラットフォームで行える。

**V1で対応しない範囲：**

- セレクタ専用フィールド（例: Account ID欄）自体に直接フォーカスした場合のドロップダウン表示。技術的根拠: `extension/src/content/main.ts` の `handleInputFocus()` は、フォーカスされた要素自体が `form.fields`（`field-classifier`/`pattern-detector` による分類済みフィールド一覧）に含まれていない限り処理を打ち切る（`main.ts:143-150` `const focusedField = form.fields.find((f) => f.element === input)`）。セレクタ専用フィールドはこの分類経路を通らないため、そこにフォーカスしてもドロップダウンは出ない。ユーザーはusername/password欄からオートフィルをトリガーする必要がある。
- `<select>` / `<textarea>` 要素への対応。
- 同一コンテナ内でセレクタが複数要素にマッチした場合のあいまいさ解消。

（いずれも将来課題としてPart 7に記載する）

## 1-4. 用語定義

| 用語 | 意味 |
|------|------|
| セレクタ | カスタムフィールドに付与する、DOM要素とのマッチ条件（タグ名・name属性・id属性・type属性の4項目、各optional） |
| ピッカー | ブラウザ拡張のcontent script上で、ユーザーがページ上のDOM要素をクリックして選択し、セレクタ情報を取得するUI機能 |

# Part 2: データモデル設計（vault-core）

## 2-1. CustomFieldSelector構造体

`vault-core/src/models/entry_data.rs` に新規構造体を追加する。

```rust
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct CustomFieldSelector {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub input_type: Option<String>,
}
```

- JSONキーは `tag` / `name` / `id` / `type` とし、対応するDOM属性名にそのまま合わせる（可読性優先）。Rustの予約語である `type` はフィールド名を `input_type` としつつ `#[serde(rename = "type")]` で永続化上のキー名を保つ。
- 4項目すべてoptional。`skip_serializing_if = "Option::is_none"` によりNoneの項目はJSONに出力しない（vault.jsonの肥大化防止、既存の任意フィールドの流儀に揃える）。
- マッチ意味論: 指定された属性のみAND条件で比較し、未指定の属性はワイルドカードとして扱う（詳細はPart 3-5）。

## 2-2. CustomFieldへのフィールド追加

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CustomField {
    pub id: String,
    pub name: String,
    pub field_type: String,
    pub value: SecretString,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autofill_selector: Option<CustomFieldSelector>,
}
```

現状の `CustomField` はプレーンな `#[derive(Serialize, Deserialize)]`（`deny_unknown_fields` なし）であるため、`#[serde(default)]` を付与するだけで、このフィールドを持たない既存のvault.jsonのデシリアライズはそのまま通る。フィールド名は `autofill_selector`（snake_case永続化）とし、既存の `field_type` と並ぶ命名規則に揃える。

## 2-3. バリデーション方針

「4属性のうち最低1つは値を持つべき」という制約をどこで強制するかについて、以下の方針とする：

- **vault-core層では強制しない。** バリデーションはUI層（popup / desktop / Android各フォーム）の入力チェックで行う。
- 理由: `CustomFieldType`（`Text`/`Password`等）と異なり、これは新規追加のoptional構造体であり、全属性がNoneの状態（意味的には「常にマッチしない」無効な状態）を許容してもデータ破損には繋がらない。また、既存の `api_update_entry` は `field_type` の再検証すら行っていない（後述2-5節）という非対称性が既にコードベースに存在しており、今回新たに厳格なバリデーション層を追加すると、この既存の緩さと整合が取りにくくなる。
- ただし、「4項目すべてNoneのCustomFieldSelectorオブジェクトが渡された場合は `None` 自体に正規化する」程度の軽いサニタイズは、`api_create_entry`/`api_update_entry` のJSON→構造体変換直後に入れることを検討する。

## 2-4. シリアライズ/デシリアライズと後方互換性

`docs/architecture.md`「前方互換性ポリシー」節および本リポジトリのCLAUDE.mdセクション4に定める通り、フィールド追加は`schema_version`のインクリメントを必要としない。今回の `autofill_selector` フィールド追加もこの方針に完全準拠する。

**既知のトレードオフ:** 旧クライアント（`autofill_selector` を知らないバージョン）がこのフィールドを持つエントリを編集・再保存すると、旧クライアント側の構造体にこのフィールドが存在しないため、再シリアライズ時にセレクタ情報が失われる（silent data loss）。これは新規に生まれる問題ではなく、「フィールド追加は旧クライアントには無視されるだけ」という既存ポリシーに内在する一般的な性質である。実害を抑えるため、**Desktop / Android / ブラウザ拡張の3プラットフォームを同一のリリースサイクルで足並みを揃えて対応する**ことを運用上の前提とする（特にAndroid側は後述5-3節の対応が必須の前提条件になる）。

## 2-5. API層（vault-core/src/api/entries.rs）の変更点

`api_create_entry` / `api_update_entry` は `custom_fields_json` をそのまま `Vec<CustomField>` にデシリアライズしているだけであるため、**構造体にフィールドを追加するだけで両APIとも自動的に対応する**。コード変更は不要。

なお、既存の非対称性として、`api_create_entry` は `CustomFieldType::from_str` で `field_type` を検証するが、`api_update_entry` はこの検証を行っていない。今回追加する `autofill_selector` はどちらの経路でも検証なしで通る。

FFIバインディング層（WASM / JNI / Tauriネイティブ）は、いずれもcustom_fieldsをJSON文字列としてそのまま透過的に受け渡すだけの設計であるため、**FFI層自体の変更は不要**である。各プラットフォームのAPI（`api_get_entry` / `api_create_entry` / `api_update_entry`）は既にJSON文字列越しにcustom_fieldsを丸ごと運んでいる。

# Part 3: オートフィル実行フロー（ブラウザ拡張）

## 3-1. 全体フロー

既存の2段階フロー（[`docs/extension-autofill.md`](extension-autofill.md) 2-3.1節「クレデンシャルの最小露出」）を維持したまま、ステップ2でカスタムフィールドの値も併せて返す。

```
[ステップ1: 候補提示] 変更なし
  Content Script --AUTOFILL_GET_CREDENTIALS--> Service Worker
  Service Worker --candidates（パスワード等は含まない）--> Content Script

[ステップ2: 選択されたクレデンシャルの取得]
  Content Script --AUTOFILL_FILL_REQUEST { entryId }--> Service Worker
                                                            │
                                                            ├─ vault復号
                                                            ├─ typed_value（username/password等）を取得（既存）
                                                            └─ custom_fields のうち
                                                               autofill_selector が設定されているものを抽出
  Content Script <--AUTOFILL_FILL_DATA { username, password, customFields }-- Service Worker

[ステップ3: フィールドへの入力]
  Content Script:
    1. 既存どおり username/password（またはCC系）を検出済みフィールドへ入力
    2. customFields の各要素について、selector-matcher（3-5節）で
       検出済みフォームコンテナ内から一致する要素を探し、見つかれば入力
```

セレクタ付きの値がContent Scriptに渡るのは、ステップ2＝ユーザーが候補エントリを明示的に選択した後のみである。これは既存の「候補選択後にのみ機密データを渡す」最小露出ポリシー（[`docs/extension-autofill.md`](extension-autofill.md) 2-3.1節）に完全に沿った拡張であり、新たな露出経路を生まない。

## 3-2. AutofillFillDataの拡張

`extension/src/shared/types.ts`（および同型定義を持つ `desktop/src/shared/types.ts`）に以下を追加する。

```ts
export interface CustomFieldSelector {
  tag?: string
  name?: string
  id?: string
  type?: string
}

export interface AutofillCustomFieldFillEntry {
  selector: CustomFieldSelector
  value: string
}

export interface AutofillFillData {
  username: string | null
  password: string | null
  ccNumber?: string | null
  ccExp?: string | null
  ccCvc?: string | null
  ccName?: string | null
  customFields?: AutofillCustomFieldFillEntry[]
}
```

`customFields` には、**`autofillSelector` が設定されているカスタムフィールドのみ**を含める。セレクタ未設定の値はDOM充填の対象にならないため送らない（不要な機密データの露出を避ける）。

## 3-3. background/autofill.ts: getFillData()の変更

現状の `getFillData()`（`extension/src/background/autofill.ts`）は `raw.custom_fields` を一切参照していない。変更方針:

- `raw.custom_fields`（JSON文字列）をパースし、`autofill_selector` が非nullの要素だけを抽出する。
- 各要素を `{ selector: { tag, name, id, type }, value }` に変換し、`AutofillFillData.customFields` として追加する。
- `entryType === 'credit_card'` の分岐、それ以外（login/password）の分岐の**両方**に `customFields` を付与する（クレジットカードエントリにもカスタムフィールドは存在しうるため）。

## 3-4. content/main.ts: onCandidateSelected()の変更

現状の候補選択後の処理（`onCandidateSelected` 相当）は `form.fields.find((f) => f.type === 'username')` 等で分類済みフィールドのみを充填している。以下を追加する:

1. `fillData.customFields` が存在する場合、各エントリについて `selector-matcher`（3-5節）の `matchSelector(form.container, entry.selector)` を呼ぶ。
2. マッチした要素が見つかり、かつ `isVisible(element)` が真であれば、充填対象配列に追加し `fillFields()` で一括入力する。
3. 分割ログイン（LOGIN_USERNAME / LOGIN_PASSWORD）の早期returnパスでもカスタムフィールド充填を行うかどうかは実装時に判断する。Account ID欄がusername欄と同一画面上に表示されているケースでは、LOGIN_USERNAME段階での充填が自然であるため対応を検討する。

## 3-5. DOM要素マッチングの実装方針（新規モジュール）

新規ファイル `extension/src/content/selector-matcher.ts` を追加する。

**CSSセレクタ文字列を組み立てて `querySelector` する方式は採らない。** 代わりに、候補ノードをタグ名で列挙した上で、各属性をJS側で直接比較する方式を採用する。

理由: name/id属性値に `"`, `'`, `[`, `]`, `\` 等の特殊文字を含むフォーム（フレームワーク生成のname、例: `name="user[account_id]"`）が実在する。単純な文字列結合でCSSセレクタ文字列（例: `` input[name="${name}"] ``）を組み立てると、セレクタ構文が壊れたり、`CSS.escape()` の適用漏れによって意図しないマッチ・例外が発生しうる。属性値そのものをJS側で直接比較する方式であれば、エスケープ処理自体が不要になり、この種のバグの入り込む余地がなくなる。

```ts
export function matchSelector(
  container: HTMLElement,
  selector: CustomFieldSelector,
): HTMLInputElement | null {
  const tag = selector.tag?.toLowerCase() ?? 'input'
  const candidates = container.querySelectorAll<HTMLInputElement>(tag)

  for (const el of candidates) {
    if (selector.name != null && el.getAttribute('name') !== selector.name) continue
    if (selector.id != null && el.getAttribute('id') !== selector.id) continue
    if (selector.type != null && el.getAttribute('type') !== selector.type) continue
    if (!isVisible(el)) continue
    return el
  }
  return null
}
```

- `tag` 未指定時は `input` をデフォルトとする（実用上の大多数のケースをカバーするため）。
- `name` / `id` / `type` は指定されている場合のみAND条件で比較し、未指定属性はワイルドカードとして扱う。
- **マッチ範囲は検出済みフォームコンテナ（`DetectedForm.container`、`form-detector.ts` が返す）内に限定する。** ページ全体を対象にすると、無関係な離れた場所にある同名フィールド（別フォームの隠しフィールド、広告iframe内の要素等）に誤って充填するリスクがあるため。Shadow DOM越えの走査が必要な場合は `form-detector.ts` の既存の再帰収集ロジックと処理を揃える。
- 複数要素がマッチする場合はV1では「最初に見つかった可視要素」を採用する。あいまいさ解消の高度化はPart 7の将来課題とする。
- 充填前には必ず `isVisible()`（`form-detector.ts` の既存関数）でチェックする。

## 3-6. filler.tsの再利用

既存の `fillField(element: HTMLInputElement, value: string)` / `fillFields(entries, delayMs)`（`extension/src/content/filler.ts`）は、ネイティブsetter経由での値設定とフレームワーク互換イベントdispatchを既に実装済みであり、第一引数が `HTMLInputElement` であれば流用可能である。呼び出し側（`main.ts`）で充填対象配列にカスタムフィールド分のエントリを追加し、既存の `fillFields()` に一括で渡す設計とする。新規のfiller関数追加は基本的に不要。

## 3-7. セキュリティ・安全性の考慮事項

[`docs/extension-autofill.md`](extension-autofill.md) 2-3節に定める3つの既存方針それぞれについて、本機能がどう整合するかを述べる。

- **最小露出（2-3.1）**: 3-1節で述べた通り、セレクタ付きの値はステップ2（候補選択後）でのみContent Scriptに渡る。新たな露出経路は生じない。
- **ISOLATED worldによる隔離（2-3.2）**: 属性比較ベースのマッチングもISOLATED world内で行われるため、ページスクリプトによる `Element.prototype` の改ざんの影響を受けない。
- **不可視フォームへの入力防止（2-3.3）**: 3-5節で述べた `isVisible()` の必須チェックに加え、マッチ範囲を検出済みフォームコンテナ内に限定すること自体も、invisible form攻撃や意図しない離れた要素への書き込みを防ぐ追加の防御層として機能する。

# Part 4: ピッカーUI設計（ブラウザ拡張）

## 4-1. popup側カスタムフィールド編集UIの変更

`extension/src/popup/components/entries/EntryForm.tsx` のカスタムフィールド一覧描画部分に、以下を追加する:

- 各カスタムフィールド行に「ページ上の要素を選択」ボタンを追加する（既存のTOTP用QRスキャンボタンと同様の配置パターン）。
- クリックすると4-2節のピッカーフローを開始する。
- 選択結果（tag/name/id/type）が返ってきたら、フォーム状態の該当カスタムフィールドの `autofillSelector` に反映する。
- 設定済みのセレクタがある場合、フィールド行に読み取り専用のサマリ表示（例: `input[name=account_id]` 相当のテキスト）を出す。値そのものではなく識別情報のみの表示であるため機密性の問題はない。
- 「クリア」ボタンでセレクタ設定を未設定に戻せるようにする。

CLAUDE.mdに定める通り、拡張機能のポップアップではRadix UIのPortal系コンポーネントが動作しないため、このUIも自前実装（`extension/src/popup/components/ui/` 配下の既存パターン）に従う。

## 4-2. ピッカー起動〜結果反映のメッセージフロー

```
1. popup: 「ページ上の要素を選択」ボタン押下
   → Service Worker に PICKER_START { entryId?, fieldId } を送信

2. Service Worker: アクティブタブへ chrome.tabs.sendMessage(tabId, { type: 'PICKER_START', fieldId })

3. Content Script: ピッカーモード開始（4-4節）
   - ホバーハイライト → クリックで要素確定
   - tag / name属性 / id属性 / type属性 を読み取る
   → Service Worker に PICKER_RESULT { fieldId, selector } を送信

4. Service Worker: 受け取った結果を一時的に保持する
   → chrome.action.openPopup() でpopupを再起動

5. popup: 再起動時にPICKER_QUERY_RESULTで保留結果の有無を確認し、
   あれば該当フィールドのautofillSelectorにマージする
```

## 4-3. popupのライフサイクル問題と対処方針

**本設計の中で最もリスクが高い技術的検討事項である。**

Chrome拡張のaction popupは、ユーザーがpopup外（対象ページ）をクリックするとフォーカスが外れて自動的に閉じ、そのJSコンテキスト（Reactの状態を含む）は破棄される。ピッカー機能は「ユーザーがpopupの外＝ページ上の要素をクリックする」ことが本質的な操作であるため、素朴な実装では**ピッカー起動と同時にpopupが閉じ、編集中の未保存フォーム状態（新規追加中のエントリ、他のカスタムフィールドの入力内容等）が失われる**。

この制約は本機能固有のものではなく、既存の`extension/src/background/totp-qr-scan.ts`が同じ問題に既に直面し、対処している。`TOTP_QR_APPLY` ハンドラは、popupのフォーム状態を経由せず、**選択結果をService Worker側で直接 `api_update_entry` に永続化する**方式でこの制約を回避している（`entryId` 必須、popup状態を一切参照しない設計。実装を確認済み）。

本機能でも同様の制約を踏まえ、次の2ケースに分けて対応方針を定める:

- **ケースA: 既存エントリの編集画面からピッカーを起動する場合** — TOTP QRスキャンと同じ方式を採用する。ピッカーの選択結果を、popupのフォーム状態を経由せずService Worker側で直接 `api_update_entry` により該当カスタムフィールドへ書き込む。popup再起動後は最新のエントリを再読込するだけでよい。
- **ケースB: エントリ新規作成中（`entryId` がまだ存在しない）にピッカーを起動する場合** — 直接永続化する先が存在しない。以下の2案を検討する:
  1. **（推奨）** ピッカーは「保存後の編集画面でのみ使用可能」とし、新規作成フォームからは呼び出せないようにする。
  2. popup側で編集中のドラフト全体を `chrome.storage.session` に退避してからピッカーを起動し、popup再起動時に復元する。

推奨は案1である。理由: 実装コストとUXの単純さのバランスが取れており、かつTOTP QRスキャン機能も同一の制約（TOTPコード読み取りは既存エントリの編集画面からのみ利用可能）を既に受け入れている、という一貫した既存UXパターンに合致する。案2はPart 7の将来課題とする。

## 4-4. content script側ピッカー実装方針

新規ファイル `extension/src/content/picker.ts` を、既存の手動キャプチャUI（`extension/src/content/capture.ts`）を土台に実装する:

- Shadow DOM hostの作成パターン（`ensureShadowHost()`）をそのまま再利用し、ページCSSとの干渉を防ぐ。
- ホバーハイライトのロジック（`onMouseOver` / `onMouseOut`）をそのまま流用する。
- クリック時、`capture.ts` の役割選択ポップオーバー（`showPopover`）は不要である。ピッカーは要素を選ぶだけで役割選択は不要なため、クリック＝即選択とする。
- 選択確定時に読み取る属性: `element.tagName.toLowerCase()`, `element.getAttribute('name')`, `element.getAttribute('id')`, `element.getAttribute('type')`。`element.id` ではなく `getAttribute('id')` を使うことで、id属性が空文字/未設定であることを明確に区別する。
- Escキーでキャンセルする（`capture.ts` の `onKeydown` と同型）。
- `<input>` 以外（`<select>`, `<textarea>`）はV1では選択不可としてクリックを無視する（Part 7参照）。

## 4-5. 新規メッセージタイプ一覧

`extension/src/shared/messages.ts` に以下を追加する。

```ts
| { type: 'PICKER_START'; fieldId: string; entryId?: string }
| { type: 'PICKER_CANCEL' }
| { type: 'PICKER_RESULT'; fieldId: string; selector: CustomFieldSelector }
| { type: 'PICKER_QUERY_RESULT'; fieldId: string }
```

既存の `AUTOFILL_START_CAPTURE` / `TOTP_QR_START` 系メッセージの設計（popup→SWは `chrome.runtime.sendMessage`、SW→content scriptへの中継は `chrome.tabs.sendMessage`）に倣う。`extension/src/content/messaging.ts` と popup側のコマンド層双方に対応するラッパー関数を追加する。

# Part 5: Desktop / Android側のUI変更方針

## 5-1. Desktop: 手動入力フォーム

`desktop/src/components/entries/EntryForm.tsx` のカスタムフィールド描画部分に、折りたたみ可能な「オートフィル対象を指定」サブセクションを追加する。中身は4つのテキスト入力（タグ名 / name属性 / id属性 / type属性）。Desktopには「今開いているページ」という概念がないため、すべて手動テキスト入力とする。UIパターンは既存のカスタムフィールドタイプ選択UIと同じReact実装で構わない。

## 5-2. Android: 手動入力フォーム

`android/app/src/main/java/net/meshpeak/kura/ui/components/EntryForm.kt` の `CustomFieldEditor` / `CustomFieldsSection` に、Desktop同様の4テキストフィールド入力UIを追加する。

## 5-3. Android: kotlinx.serializationの前方互換性問題への対処（必須の前提条件）

`android/app/src/main/java/net/meshpeak/kura/data/model/Models.kt` の `CustomField` data classに `autofillSelector` を追加する必要がある。**この対応は本機能の実装においてオプションではなく、Android版を安全に動かすための必須の前提条件である。**

背景: Kotlin側で `Json.decodeFromString<List<CustomField>>(...)` を呼んでいる以下4箇所は、いずれもデフォルトのstrict Json（`ignoreUnknownKeys = false`）を使用している。

- `android/app/src/main/java/net/meshpeak/kura/ui/entries/EntryEditScreen.kt`
- `android/app/src/main/java/net/meshpeak/kura/ui/entries/EntryDetailScreen.kt`
- `android/app/src/main/java/net/meshpeak/kura/autofill/AutofillTotpResolveActivity.kt`
- `android/app/src/main/java/net/meshpeak/kura/autofill/FillResponseBuilder.kt`

Rust側 `CustomField` にJSONキー（`autofill_selector`）が追加された時点で、これらの箇所はデコード時に例外を投げ、呼び出し元のtry/catchで空リスト/nullへフォールバックする。**Kotlin側の型定義を同時に更新しないと、Android版だけカスタムフィールドが画面上「全部消えて見える」退行が起きる。** これは `docs/architecture.md` の「古いクライアントでも未知のフィールドを含むvaultを正常にデシリアライズできる」という前方互換性ポリシーに反する、Android実装固有の既存の技術的負債である。

対処方針（2案。実装時にいずれか、または両方を選択する）:

- **案A（推奨）**: `Models.kt` の `CustomField` に `autofillSelector: CustomFieldSelector? = null` を追加する。型が一致すればstrict Jsonでも問題なくデコードできる。
- **案B**: 上記4箇所を `Json { ignoreUnknownKeys = true }` に変更する。コードベース内には既に同パターンの前例（他のJSONデコード箇所）が複数存在する。将来の同種フィールド追加に対する恒久対策として、案Aと並行して採用することが望ましい。

## 5-4. Android: ビルド運用上の注意

Android版のvault-coreは通常のGradleビルドに含まれず、`cargo ndk` による手動ビルドと `.so` の配置が必要である。本機能の実装後、実機での動作確認前にこの手動ビルド手順を忘れないこと。

# Part 6: 検討した代替案

## 6-1. パターンDB拡張案

`extension/patterns/sites/*.json` にカスタムフィールド用のセレクタ定義を追加する案。個人のエントリ固有情報（「どのDOM要素に対応するか」という設定）を全ユーザー共有のビルド時バンドルリソースに含める設計は、個人利用が前提の1エントリ単位の情報とスケールが合わず、かつサイトごとにパターンファイルのPRを送ってメンテナンスする運用コストがper-entry方式より高いため不採用とした。

## 6-2. 名前ベースのあいまいマッチング案

カスタムフィールド名（例:「Account ID」）とDOM要素のlabel/placeholderテキストをあいまい一致させる案。多言語対応・表記ゆれの吸収が困難で誤マッチのリスクが高く、確定的な属性マッチの方がユーザーにとって挙動が予測可能であるため不採用とした。

# Part 7: 将来課題（V1スコープ外）

- セレクタ専用フィールド自体にフォーカスした際のドロップダウン表示。
- `<select>` 要素・`<textarea>` への対応。
- 複数マッチ時のあいまいさ解消（優先順位付け、ユーザーへの確認UI等）。
- Android AutofillServiceでのセレクタベース充填対応。現状Android AutofillServiceはTOTPカスタムフィールドとURL型カスタムフィールド（ドメインマッチ用）のみを参照しており、本機能は対象外（`android/app/src/main/java/net/meshpeak/kura/autofill/FillResponseBuilder.kt` が対象になりうる）。
- ピッカーでの新規作成中エントリの扱い改善（4-3節ケースBの案2の本格実装）。
