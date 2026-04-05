<!-- doc-status: implemented -->
# 1Password 1puxインポート設計書

## 1. 概要

1Password のエクスポート形式である `.1pux` ファイルを kura にインポートする機能。対象プラットフォームはデスクトップ（Tauri）と Android。ブラウザ拡張機能（WASM）は対象外とする。

### 1pux形式の構造

`.1pux` ファイルは ZIP アーカイブであり、以下の構造を持つ:

```
export.1pux (ZIP)
├── export.data          # メインJSON
└── files/               # 添付ファイル（Documentタイプ等）
    └── {uuid}__{filename}
```

`export.data` の JSON 階層:

```json
{
  "accounts": [{
    "attrs": { "accountName": "...", "email": "..." },
    "vaults": [{
      "attrs": { "uuid": "...", "name": "Vault Name" },
      "items": [{
        "uuid": "...",
        "favIndex": 1,
        "createdAt": 1234567890,
        "updatedAt": 1234567890,
        "categoryUuid": "001",
        "overview": {
          "title": "Item Title",
          "url": "https://example.com",
          "urls": [{ "url": "https://example.com" }],
          "tags": ["tag1", "tag2"]
        },
        "details": {
          "loginFields": [
            { "designation": "username", "value": "user@example.com" },
            { "designation": "password", "value": "secret123" }
          ],
          "notesPlain": "Notes text",
          "sections": [{
            "title": "Section Name",
            "fields": [{
              "title": "Field Name",
              "value": { "string": "field value" }
            }]
          }],
          "passwordHistory": [...]
        }
      }]
    }]
  }]
}
```

## 2. データフロー

将来 Bitwarden / KeePass 等の他形式も同パターンで追加できる構成とする。

```
[1pux ファイル (ZIP)]
       │
       ▼  (1) parser.rs: ZIP展開 + JSONデシリアライズ
[Vec<ParsedItem>]
       │
       ▼  (2) mapper.rs + mod.rs: タイプマッピング + 重複検出
[ImportPreview]   ← UI表示用。各アイテムのマッピング先・重複候補・デフォルトアクション
       │
       ▼  (3) UI: ユーザーにプレビュー表示、アクション選択
[Vec<(source_id, ImportAction)>]
       │
       ▼  (4) mod.rs: エントリ作成実行
[ImportResult]    ← 成功数・スキップ数・エラー詳細
```

## 3. タイプマッピング

### 直接マッピング（自動変換）

| categoryUuid | 1Password タイプ | kura EntryType | マッピング方法 |
|---|---|---|---|
| 001 | Login | Login | `loginFields` から username/password、`overview.url` → url |
| 002 | Credit Card | CreditCard | sections から cardholder/number/expiry/cvv/pin |
| 004 | Secure Note | SecureNote | `details.notesPlain` → content |
| 005 | Password | Password | `loginFields` または sections から password |
| 100 | Software License | SoftwareLicense | sections から license_key |
| 101 | Bank Account | Bank | sections から bank_name/account_holder/account_number 等 |
| 105 | SSH Key | SshKey | sections から private_key |

### 間接マッピング（フォールバック）

以下のタイプは kura に対応する EntryType が存在しない。デフォルトでは SecureNote として取り込む。

| categoryUuid | 1Password タイプ | デフォルト変換先 | 備考 |
|---|---|---|---|
| 003 | Identity | SecureNote | 名前・住所・電話番号等を custom_fields に個別保存 |
| 006 | Document | SecureNote | 添付ファイルはインポート不可。ファイル名を notes に記録 |
| 107 | API Credential | Login | URL + key/secret を username/password にマッピング可 |
| 102 | Database | Login | server → url, username/password はそのまま |
| 104 | Email Account | Login | email → username, server → url |
| 112 | Server | Login | hostname → url, username/password はそのまま |
| 114 | Wireless Router | Login | SSID → name, password はそのまま |
| 111 | Social Security Number | Password | SSN を password フィールドに格納 |
| 108 | Crypto Wallet | SecureNote | ウォレットアドレス・シード等を custom_fields に保存 |
| 103 | Driver License | SecureNote | 全フィールドを custom_fields に保存 |
| 113 | Medical Record | SecureNote | 全フィールドを custom_fields に保存 |
| 106 | Membership | SecureNote | 会員番号等を custom_fields に保存 |
| 109 | Outdoor License | SecureNote | 全フィールドを custom_fields に保存 |
| 110 | Passport | SecureNote | パスポート番号等を custom_fields に保存 |
| 115 | Reward Program | SecureNote | 会員番号等を custom_fields に保存 |

### ユーザー選択可能なアクション

間接マッピング対象のアイテムについて、ユーザーは **タイプ単位** でデフォルトアクションを選択できる。さらに個別アイテムごとにオーバーライドも可能。

| アクション | 説明 |
|---|---|
| SecureNote として取り込む | 全フィールドを content + custom_fields に保存（デフォルト） |
| Login + custom_fields として取り込む | username/password 相当があれば Login に、残りは custom_fields |
| スキップ | 取り込まない |

## 4. データ保存戦略

### フィールドの保存先ルール

1. **typed_value**: マッピング先 EntryType で定義されたフィールドにマッピングできるもののみ
2. **custom_fields**: typed_value に入らない全フィールド（名前と値のペアを保持）
3. **notes**: `details.notesPlain` の内容
4. **tags → labels**: 1Password のタグを kura のラベルに変換。既存ラベルと名前が一致すればそれを使い、なければ新規作成

### sections フィールドの型判別

1Password の sections 内フィールドは `value` オブジェクトのキーで型が判別できる:

| value のキー | 意味 | kura での保存先 |
|---|---|---|
| `string` | テキスト | custom_field (Text) |
| `concealed` | パスワード | custom_field (Password) |
| `email` | メールアドレス | custom_field (Email) |
| `url` | URL | custom_field (Url) |
| `phone` | 電話番号 | custom_field (Phone) |
| `totp` | TOTP URI | custom_field (Totp) |
| `date` | 日付（Unix秒） | custom_field (Text) に日付文字列変換 |
| `monthYear` | 月年（整数） | custom_field (Text) に変換 |
| `address` | 住所オブジェクト | custom_field (Text) にフラット化 |

### SecureNote フォールバック時のコンテンツ形式

対応タイプがないアイテムを SecureNote として取り込む場合の `content`:

```
[1Password: Identity]

--- 基本情報 ---
名前: 山田 太郎
メールアドレス: taro@example.com
電話番号: 090-1234-5678

--- 住所 ---
〒100-0001
東京都千代田区...
```

同時に各フィールドを custom_fields にも個別保存して検索性を確保する。

### 添付ファイルの扱い

kura は添付ファイルをサポートしていないため、Document タイプや添付ファイル付きアイテムのファイルはインポートできない。ファイル名を notes に記録し、プレビュー画面で警告を表示する。

## 5. 重複検出アルゴリズム

### 信頼度レベル

インポートプレビュー生成時に、既存エントリとの重複を検出する。以下の順で判定し、最初にマッチした条件の信頼度を採用する。

**High（高確信）**: 同一 EntryType + 主要フィールド一致

| EntryType | 一致条件 |
|---|---|
| Login / Password | URL正規化後一致 かつ username 一致 |
| CreditCard | カード番号の下4桁一致 かつ cardholder 一致 |
| Bank | 口座番号一致 かつ 支店コード一致 |
| SshKey | 秘密鍵の先頭64文字一致 |
| SoftwareLicense | ライセンスキー一致 |

**Medium（中確信）**:

- エントリ名の正規化後一致（小文字化 + 空白トリム）かつ 同一 EntryType
- Login の場合: URL のドメイン部分のみ一致（username は不一致でも可）

**Low（低確信）**:

- エントリ名の正規化後一致のみ（EntryType が異なる場合を含む）

### URL 正規化

```
https://www.example.com/login → example.com
http://example.com:8080/path  → example.com
```

スキーム、`www.` プレフィクス、ポート、パスを除去してドメインのみで比較する。

### 重複検出時のユーザー選択肢

| 選択肢 | 動作 |
|---|---|
| 新規として取り込む | 重複を無視して新しいエントリとして作成 |
| 既存を上書き | 既存エントリの内容をインポートデータで置き換える |
| スキップ | このアイテムをインポートしない |

## 6. UIフロー

### フロー全体

```
設定画面
  │
  ▼ 「1Passwordからインポート」ボタン
ファイル選択ダイアログ（.1pux ファイル）
  │
  ▼ パース + プレビュー生成
インポートプレビュー画面
  │  ・統計サマリー（総数、タイプ別件数、重複件数）
  │  ・マッピング不可タイプのデフォルトアクション設定
  │  ・アイテム一覧（タイプ別グループ化）
  │  ・重複候補のハイライト
  │  ・個別 / 一括操作
  │
  ▼ 「インポート実行」ボタン
プログレス表示
  │
  ▼
結果サマリー画面
  ・取り込み成功: N件
  ・スキップ: N件
  ・上書き: N件
  ・エラー: N件（詳細展開可能）
  ・新規作成ラベル: N件
```

