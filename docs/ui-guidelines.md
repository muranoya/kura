<!-- doc-status: implemented -->
# UI ガイドライン

## 目的

Desktop、ブラウザ拡張、Androidの3プラットフォームで一貫したユーザー体験を提供するための正規UIルールを定義する。

**表示名と文言キー**: 本ドキュメントは構造規約（フィールド順序、セクション構造、表示ルール等）と **文言キー** を正として記述する。日本語表示名は Desktop の `ja.json` 時点のスナップショットであり、表示文言の実体は各プラットフォームの文言ファイルが正となる。文言管理の方針は [## UI 文言](#ui-文言) セクションを参照。

---

## エントリ種別とフィールド順序

vault-core のデータモデル (`vault-core/src/models/entry_data.rs`) を正とする。

| 種別 | フィールド順序 | シークレット |
|------|--------------|-------------|
| login | username → password → url | password |
| bank | bank_name → branch_code → account_type → account_holder → account_number → pin | pin |
| credit_card | cardholder → number → expiry → cvv → pin | number, cvv, pin |
| ssh_key | private_key | private_key |
| secure_note | content | - |
| password | username → password | password |
| software_license | license_key | - |

## フィールド表示名

| フィールドキー | 文言キー | 表示名 (ja スナップショット) |
|--------------|--------|--------|
| username | `fields.username` | ユーザー名 |
| password | `fields.password` | パスワード |
| url | `fields.url` | URL |
| bank_name | `fields.bank_name` | 銀行名 |
| branch_code | `fields.branch_code` | 支店コード |
| account_type | `fields.account_type` | 口座種別 |
| account_holder | `fields.account_holder` | 口座名義 |
| account_number | `fields.account_number` | 口座番号 |
| pin | `fields.pin` | PIN |
| private_key | `fields.private_key` | 秘密鍵 |
| content | `fields.content` | 内容 |
| cardholder | `fields.cardholder` | カード名義 |
| number | `fields.number` | カード番号 |
| expiry | `fields.expiry` | 有効期限 |
| cvv | `fields.cvv` | CVV |
| cc_pin | `fields.cc_pin` | 暗証番号 |
| license_key | `fields.license_key` | ライセンスキー |

## 詳細画面のセクションヘッダー

| エントリ種別 | 文言キー | セクションヘッダー (ja スナップショット) |
|------------|--------|-----------------|
| login | `sections.login` | ログイン情報 |
| bank | `sections.bank` | 銀行口座 |
| credit_card | `sections.credit_card` | クレジットカード |
| ssh_key | `sections.ssh_key` | SSH キー |
| secure_note | `sections.secure_note` | ノート |
| password | `sections.password` | パスワード情報 |
| software_license | `sections.software_license` | ライセンス情報 |

## 詳細画面の表示順序

1. ラベル (割り当て済みの場合)
2. 型固有フィールド (上記セクションヘッダー付き)
3. カスタムフィールド
4. メモ
5. タイムスタンプ (更新日・作成日)

## エントリ種別の表示名とアイコン

| 種別キー | 文言キー | 表示名 (ja スナップショット) |
|---------|--------|--------|
| login | `entryTypes.login` | ログイン |
| bank | `entryTypes.bank` | 銀行口座 |
| ssh_key | `entryTypes.ssh_key` | SSHキー |
| secure_note | `entryTypes.secure_note` | セキュアノート |
| credit_card | `entryTypes.credit_card` | クレジットカード |
| password | `entryTypes.password` | パスワード |
| software_license | `entryTypes.software_license` | ソフトウェアライセンス |
全種別がフィルター選択肢に含まれること。

## エントリカード表示ルール

**構成**: アイコン + 種別バッジ + 名前 (1行、省略) + サブタイトル (1行、省略) + アクション

**サブタイトルロジック** (`vault-core/src/api/entries.rs` 準拠):

| エントリ種別 | サブタイトル |
|------------|------------|
| login | username |
| password | username |
| bank | bank_name |
| credit_card | cardholder |
| その他 | なし |

## シークレットフィールドの振る舞い

- 初期表示: マスク表示 (`••••••••` 固定8文字)
- フィールドごとにトグルで表示/非表示を切り替え
- コピー操作は常に実値をコピー

## フィルターとソート

**フィルター種別** (全種別):
すべて / ログイン / 銀行口座 / SSH キー / セキュアノート / クレジットカード / パスワード / ソフトウェアライセンス

**ソートオプション**:
- 作成日 (新しい順) ← デフォルト
- 作成日 (古い順)
- 更新日 (新しい順)
- 更新日 (古い順)
- 名前 (A → Z)
- 名前 (Z → A)

---

## オンボーディングフロー

```
Welcome → Storage Setup → [分岐]
  → 新規vault: Master Password → Recovery Key → Lock画面
  → 既存vault: Unlock Existing Vault → Lock画面
```

### Welcome画面
- アイコン (Shield または Lock)
- タイトル: "kura"
- タグライン: "サーバ不要、自分一人のためのパスワードマネージャー"
- CTAボタン: "始める"

### Storage Setup画面
フィールド順序 (全プラットフォーム共通):
1. リージョン (必須)
2. バケット (必須)
3. ファイルパス (必須、デフォルト: "vault.json")
4. アクセスキーID (必須)
5. シークレットアクセスキー (必須)
6. エンドポイント (任意)

### Master Password画面
- パスワード入力
- パスワード確認入力
- 一致インジケーター表示
- 最低8文字のバリデーション

### Recovery Key画面
- リカバリーキーをモノスペースフォントで表示
- コピーボタン
- 完了ボタン

---

## 共通UIビヘイビア

| 項目 | ルール |
|------|-------|
| コピーフィードバック | "コピーしました" を 1500ms 表示 |
| 空フィールド表示 | "未設定" イタリック・低透明度 |
| URL フィールド | クリックでブラウザ起動 + コピーボタン |
| タイムスタンプ形式 | `yyyy/MM/dd HH:mm` |
| セキュアノート描画 | Markdown レンダリング |
| 検索デバウンス | 300ms |

---

## UI 文言

各クライアントの UI は **日本語のみ** をサポートする。言語の自動検出や設定画面での言語切り替えは提供しない。

UI 文字列（画面・ラベル・ボタン・メッセージ等の静的テキスト）はコードに直書きせず、各プラットフォームの文言ファイルから識別子キーで参照する。

| プラットフォーム | 文言ファイル |
|----------------|------------|
| Desktop | `desktop/src/i18n/locales/ja.json`（i18next） |
| Extension | `extension/src/popup/i18n/locales/ja.json`（i18next）、`extension/_locales/ja/messages.json`（manifest 用） |
| Android | `android/app/src/main/res/values/strings.xml` |

### 文言ファイルの配置方針

文言ファイルは **各プラットフォームのディレクトリ内で独立管理** する。Desktop / Android / Extension で文言ファイルを共通化しない。

**理由:**

- 文言はコンポーネント単位で必要になるケースが多く、UI構成の進化速度はプラットフォームごとに異なる
- 共通化すると、将来あるプラットフォームのUI構成が変わった際に他プラットフォームの文言構造にも影響が及び、メンテナンス負荷が逆に高まる
- DesktopとExtensionは共にReactベースだが、画面構成・機能範囲が独立しているため、文言の単位も独立させる方が自然である

### キー設計

- **中立な識別子キー方式** を採用する
- キーは日本語の文言そのものではなく、意味を表す識別子とする
- これにより、文言の表記修正でキー変更が連鎖することを避ける
- キーはプラットフォーム単位で閉じる。プラットフォーム間でキー名の整合は取らない

### ユーザー入力データの扱い

vault内に保存されるユーザー入力テキストは **文言ファイルの管理対象外** とする。具体的には以下のようなものだ。

- エントリの `name`（エントリ名）
- ラベルの `name`（ラベル名）
- カスタムフィールドの `name` と `value`
- エントリの `notes`
- `typed_value` 配下のユーザーが入力した値

これらはユーザー固有のデータであり、文言ファイルで扱う性質のものではない。vault復号後の生データをそのまま表示する。
