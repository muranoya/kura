<!-- doc-status: implemented -->
# UI ガイドライン

## 目的

Desktop、ブラウザ拡張、Androidの3プラットフォームで一貫したユーザー体験を提供するための正規UIルールを定義する。

**原則**: このドキュメントに記載されたルールは全プラットフォーム共通で適用する。「プラットフォーム許容差異」に明記されていない差異はバグとして扱う。

**表示名と多言語対応**: 本ドキュメントに記載する表示名テーブル（フィールド表示名、セクションヘッダー、エントリ種別の表示名等）は、現状の日本語表示を正として記述する。多言語対応導入後は表示名の実体は各プラットフォームの翻訳ファイルが正となり、本ドキュメントはキー設計と構造規約（フィールド順序、表示ルール等）を示す参照元に位置付ける。多言語対応の方針は [`docs/i18n.md`](./i18n.md) を参照。

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

| フィールドキー | 表示名 |
|--------------|--------|
| username | ユーザー名 |
| password | パスワード |
| url | URL |
| bank_name | 銀行名 |
| branch_code | 支店コード |
| account_type | 口座種別 |
| account_holder | 口座名義 |
| account_number | 口座番号 |
| pin | PIN |
| private_key | 秘密鍵 |
| content | 内容 |
| cardholder | カード名義 |
| number | カード番号 |
| expiry | 有効期限 |
| cvv | CVV |
| license_key | ライセンスキー |

## 詳細画面のセクションヘッダー

| エントリ種別 | セクションヘッダー |
|------------|-----------------|
| login | ログイン情報 |
| bank | 銀行口座 |
| credit_card | クレジットカード |
| ssh_key | SSH キー |
| secure_note | ノート |
| password | パスワード情報 |
| software_license | ライセンス情報 |

## 詳細画面の表示順序

1. ラベル (割り当て済みの場合)
2. 型固有フィールド (上記セクションヘッダー付き)
3. カスタムフィールド
4. メモ
5. タイムスタンプ (更新日・作成日)

## エントリ種別の表示名とアイコン

| 種別キー | 表示名 |
|---------|--------|
| login | ログイン |
| bank | 銀行口座 |
| ssh_key | SSH キー |
| secure_note | セキュアノート |
| credit_card | クレジットカード |
| password | パスワード |
| software_license | ソフトウェアライセンス |
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

