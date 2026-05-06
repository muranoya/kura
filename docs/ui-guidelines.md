<!-- doc-status: implemented -->
# UI ガイドライン

## 目的

Desktop、ブラウザ拡張、Androidの3プラットフォームで一貫したユーザー体験を提供するための正規UIルールを定義する。

**表示名と多言語対応**: 本ドキュメントは構造規約（フィールド順序、セクション構造、表示ルール等）と **翻訳キー** を正として記述する。日本語表示名は Desktop の `ja.json` 時点のスナップショットであり、表示文言の実体は各プラットフォームの翻訳ファイルが正となる。多言語対応の方針は [## 多言語対応](#多言語対応) セクションを参照。

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

| フィールドキー | 翻訳キー | 表示名 (ja スナップショット) |
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

| エントリ種別 | 翻訳キー | セクションヘッダー (ja スナップショット) |
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

| 種別キー | 翻訳キー | 表示名 (ja スナップショット) |
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

## 多言語対応

各クライアントUIで多言語対応を行うにあたり、プラットフォームをまたいで共通して守る原則と対象範囲を定める。具体的なライブラリ選定やキー命名規則、ロード戦略などの実装詳細は各プラットフォームの判断に委ねる。

### スコープ

| 区分 | 対象/対象外 | 内容 |
|------|-----------|------|
| 対象 | ○ | Desktop / Android / Extension の **UI文字列**（画面・ラベル・ボタン・メッセージ等の静的テキスト） |
| 対象外（今回） | × | エラーメッセージ、vault-core 由来の文字列、ログ出力 |
| 対象外（原則） | × | vault内のユーザー入力データ（後述） |

「対象外（今回）」は将来的に対象化する可能性があり、「対象外（原則）」は本質的に翻訳対象にならないものを指す。

### 対応言語

- 初期対応: 日本語・英語の2言語
- 将来の言語追加を妨げない構造で実装する
- 未対応言語の環境では英語にフォールバックする

### 翻訳ファイルの配置方針

翻訳ファイルは **各プラットフォームのディレクトリ内で独立管理** する。Desktop / Android / Extension で翻訳ファイルを共通化しない。

**理由:**

- 翻訳はコンポーネント単位で必要になるケースが多く、UI構成の進化速度はプラットフォームごとに異なる
- 共通化すると、将来あるプラットフォームのUI構成が変わった際に他プラットフォームの翻訳構造にも影響が及び、メンテナンス負荷が逆に高まる
- DesktopとExtensionは共にReactベースだが、画面構成・機能範囲が独立しているため、翻訳単位も独立させる方が自然である

各プラットフォームは自身のリポジトリ配下（`desktop/` / `android/` / `extension/`）で翻訳ファイルを管理する。

### キー設計

- **中立な識別子キー方式** を採用する
- 翻訳ファイルの「原文」は日本語でも英語でもなく、意味を表す識別子キーとする
- これにより、文言の表記修正でキー変更が連鎖することを避ける
- キーはプラットフォーム単位で閉じる。プラットフォーム間でキー名の整合は取らない

### 言語検出と切り替え

| タイミング | 動作 |
|----------|------|
| 起動時 | OS / ブラウザ の言語設定から自動検出 |
| ユーザー設定 | 設定画面で手動指定可能 |
| 優先順位 | 手動設定 > 自動検出 |

手動設定はユーザー単位で永続化する。設定が未指定の場合のみ自動検出を用いる。

### ユーザー入力データの扱い

vault内に保存されるユーザー入力テキストは **翻訳対象外** とする。具体的には以下のようなものだ。

- エントリの `name`（エントリ名）
- ラベルの `name`（ラベル名）
- カスタムフィールドの `name` と `value`
- エントリの `notes`
- `typed_value` 配下のユーザーが入力した値

これらはユーザー固有のデータであり、翻訳の対象となる性質のものではない。vault復号後の生データをそのまま表示する。

### 将来の拡張余地

以下は現在スコープ外だが、将来的に対応する可能性がある。対応する際は本セクションを改定して方針を追記する。

- エラーメッセージおよび vault-core 由来メッセージの多言語化
- 日本語・英語以外の言語追加
- 複数形処理・日付/数値のロケール別書式など、より高度なi18n機能
