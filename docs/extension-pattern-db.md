<!-- doc-status: implemented -->
# ブラウザ拡張パターンDB 仕様書

サイト固有のフォーム検出ルールをJSONで管理するシステム。ヒューリスティック検出（参照: [extension-autofill.md](extension-autofill.md)）では対応できないサイトに対して、セレクタベースのフォーム定義を提供する。

## 1. 概要

- 拡張機能にはビルド時の最新パターンDBを同梱する
- 動的更新は行わない
- 各フォーム定義は独立したステップとして動作する（ステートレスモデル）。URL + DOM条件で現在の画面を認識し、フィールドを特定する。

## 1.1 ヒューリスティックとパターンDBの使い分け基準

オートフィルで入力欄が検知できなかった場合、ヒューリスティックを修正すべきかパターンファイルを追加すべきかを以下の基準で判断する。

### 基本原則

判断の軸は **「標準的なHTML属性にフィールド種別を示すシグナルが存在するか」** である。

ヒューリスティックが参照する属性（参照: [extension-autofill.md](extension-autofill.md)）：
`autocomplete`, `type`, `name`, `id`, `aria-label`, `placeholder`, 関連する `<label>` テキスト

### ヒューリスティック修正の対象

上記の標準属性にシグナルが **存在する** が、現在の正規表現やロジックが認識できていない場合。

- 例: `name="user_credential"`, `placeholder="ログインID"`, `aria-label="One-time code"`
- **判定テスト**: HTML属性値を見れば人間がフィールド種別を判断できる → ヒューリスティック修正

### パターンファイル追加の対象

標準属性にシグナルが **存在しない**、またはサイト固有のDOM構造的知識が必要な場合。

- 例: `name` や `id` がビルド時生成のハッシュ値、セマンティック属性の欠如、分割ログインフロー
- **判定テスト**: どのサイトか知らなければ属性だけでフィールド種別を判断できない → パターンファイル

### 誤分類のケース

検知はされたがフィールド種別が誤っている場合：

| 状況 | 対応 |
|------|------|
| サイト固有の誤分類（例: そのサイト独自の "code" フィールドがTOTPと誤判定） | パターンファイルの `skip_fields` で対応 |
| 複数サイトで起きる誤分類 | ヒューリスティックに除外パターンを追加 |

### 基本ロジック（field-classifier）の設計方針

`field-classifier.ts` のシグナル定義（`nameIdPatterns`, `labelPatterns` 等）は、**false positive を最小化するために保守的に設計** されている。

#### False Positive のリスク

オートフィルで false positive が発生すると「誤った入力欄に機密情報を入力する」という致命的なバグになる。

**例：**
- パターン `/member/i` を `nameIdPatterns` に追加した場合、`member_notes`（メモ欄）や `member_count`（会員数表示）のようなフィールドまで username と誤分類される可能性がある
- これらの誤分類を個別に対処するには「サイト別の ignore パターン」が必要になり、設計が複雑化する

#### 相互補完的な設計

基本ロジック（ヒューリスティック）とパターンDB の役割分担：

| 層 | 優先度 | 設計思想 | 対応範囲 |
|---|---|---|---|
| **基本ロジック** | 高い精度重視 | false positive ゼロ、true negative はパターンDB で補完 | 標準的な HTML 属性を持つ大多数のサイト |
| **Pattern DB** | カバレッジ | サイト固有の明示的なセレクター指定で true negative を解消 | 非標準な HTML 構造や属性を持つサイト |

**設計ポリシー：** 基本ロジックを広げることで true negative を減らそうとするのではなく、むしろ基本ロジックは狭く保ち、個別サイトは `patterns/sites/*.json` で対応する。

#### Pattern DB によるカバレッジ確保

基本ロジックで未検出となるサイトは、パターンファイル追加で対応する。

この方針により：
- 基本ロジックは false positive のない安全な実装を維持
- サイト固有の edge case はパターンDB で柔軟に対応
- 複雑な ignore パターンが不要で、全体の保守性が向上

## 2. ファイル構成

```
extension/patterns/
  schema.json              ← JSON Schemaバリデーション定義
  sites/
    accounts.google.com.json
    login.microsoftonline.com.json
    amazon.com.json
    ...
  build/
    patterns.json           ← ビルド時に自動生成されるマージ済みファイル
```

- `sites/`配下にドメインごとのJSONファイルを配置する
- ビルド時にViteプラグイン（またはpre-buildスクリプト）が全ファイルをマージして`build/patterns.json`を生成する
- Content ScriptまたはService Workerが`patterns.json`を読み込む

## 3. サイト固有パターンのスキーマ

スキーマ内の全セレクター値（`selector`, `fallback_selectors`, `element_exists`, `element_not_exists`, `wait_for.selector`, `skip_fields`）はCSSセレクターとして解釈される。

```json
{
  "description": "string (このパターンが必要な理由)",           // Required
  "match": {                                                // Required
    "type": "domain | domain_suffix",                       // Required
    "value": "string",                                      // Required
    "strict_subdomain": false                               // Optional (default: false)
  },
  "disabled": false,                                        // Optional (default: false)
  "forms": [                                                // Optional (省略時: ヒューリスティック検出にフォールバック)
    {
      "id": "string (フォーム識別子、デバッグ・ログ用)",         // Required
      "type": "login | login_username | login_password | totp | credit_card", // Required
      "condition": {                                       // Optional (省略時: 常にtrue)
        "url_path": "string (正規表現)",                    // Optional (省略時: 常にtrue)
        "element_exists": "string (CSSセレクタ)",           // Optional (省略時: 常にtrue)
        "element_not_exists": "string (CSSセレクタ)"        // Optional (省略時: 常にtrue)
      },
      "wait_for": {                                        // Optional (省略時: 待機なし)
        "selector": "string (CSSセレクタ)",                 // Required (wait_for指定時)
        "timeout_ms": 5000                                 // Optional (default: 5000)
      },
      "fields": {                                          // Required
        "<field_name>": {
          "selector": "string (CSSセレクタ)",               // Required
          "fallback_selectors": ["string (CSSセレクタ)"]    // Optional (省略時: フォールバックなし)
        }
      },
      "skip_fields": ["string (CSSセレクタ)"]               // Optional (省略時: 除外なし)
    }
  ]
}
```

**field_name一覧：**

ヒューリスティック検出のフィールドタイプ（参照: [extension-autofill.md](extension-autofill.md)）と対応する。

| field_name | 説明 |
|-----------|------|
| `username` | ユーザー名・メールアドレス |
| `password` | パスワード |
| `totp` | ワンタイムパスワード |
| `cc_number` | クレジットカード番号 |
| `cc_exp` | 有効期限 |
| `cc_cvc` | セキュリティコード |
| `cc_name` | カード名義 |

**`forms`の省略：** `forms` を省略または空配列にした場合、フォーム検出はヒューリスティックにフォールバックする。`match` と `strict_subdomain` は `forms` の有無に関わらず評価されるため、フォーム検出はヒューリスティックで十分だがクレデンシャル照合ルールだけ変更したい場合に、`forms` を省略してマッチルールのみを定義できる。

**conditionの評価ロジック：** 指定された全条件をANDで評価する。`url_path`、`element_exists`、`element_not_exists` のいずれも省略可能で、省略された条件は常に真として扱う。全て省略した場合（`condition` 自体の省略を含む）はmatchさえすれば常に適用される。

**複数フォームのマッチ：** `forms` 配列は先頭から順に評価され、以下を全て満たした **最初の1つのform** が採用される（First-Match-Wins）。後続のformは評価されない。

1. `condition`（`url_path`、`element_exists`、`element_not_exists`）が全て真
2. `wait_for` のセレクタが指定時間内に出現
3. `fields` の全セレクタがDOMに存在し、かつ可視である
4. フォーカス中のinput要素が解決した `fields` のいずれかと一致する

そのため、**より具体的な条件を持つformを配列の先頭に配置すること**。例えば `/login` 専用formと汎用formの両方を定義する場合、`/login` 用を先に書く。

**matchタイプ：**

| タイプ | 値の例 | マッチ対象 |
|--------|--------|-----------|
| `domain` | `"accounts.google.com"` | 指定したホスト名に完全一致 |
| `domain_suffix` | `"amazon.com"` | 指定ドメインおよびそのすべてのサブドメインに一致（`www.amazon.com`, `smile.amazon.com` 等） |

**`strict_subdomain`フラグ：** `true`にすると、オートフィルのクレデンシャル照合がデフォルトのeTLD+1マッチではなく、エントリURLのホスト名との完全一致になる。デフォルトは`false`。

**正規表現マッチは採用しない：** マッチ範囲が人間にも機械にも静的に検証しにくく、悪意あるコントリビューターが過剰に広いパターン（例: `.*\.com`）を紛れ込ませるリスクがある。パスベースの条件分岐が必要な場合は、フォームレベルの `condition.url_path` で代替する。

## 4. パターンの評価順序

ホスト名に対してパターンを1つだけ選択する。評価順は以下:

1. `domain` マッチ（ホスト名の完全一致、大文字小文字を区別しない）
2. `domain_suffix` マッチ（最長のサフィックスを持つパターンを優先）

`domain` マッチが見つかった時点で `domain_suffix` は評価されない。いずれもマッチしない場合はパターンDBを使わず、汎用ヒューリスティックにフォールバックする（これはパターンDBの評価順ではなく、フォールバック動作）。

**重複定義の扱い：** 同一の `(match.type, match.value)` を持つパターンが複数定義された場合は **ビルド時にエラー** として検出され、ビルドが失敗する。値の比較は大文字小文字を正規化した上で行う。異なる `type`（例: `domain` と `domain_suffix` の両方で `"example.com"`）は重複扱いにしない（`domain` が優先されるため挙動が定まる）。

**サフィックスの入れ子：** `amazon.com` と `login.amazon.com` の両方を `domain_suffix` で定義することは正当で、より具体的な `login.amazon.com` が優先される。これは重複ではない。

## 5. ビルド時処理

1. `extension/patterns/sites/`配下の全JSONファイルを読み込む
2. `extension/patterns/schema.json`でバリデーション
3. サイト固有パターンをマージして`build/patterns.json`を生成
4. Content Scriptの静的アセットとしてバンドル
