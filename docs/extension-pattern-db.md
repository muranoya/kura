<!-- doc-status: implemented -->
# ブラウザ拡張パターンDB 仕様書

サイト固有のフォーム検出ルールをJSONで管理するシステム。ヒューリスティック検出（参照: [extension-autofill.md](extension-autofill.md)）では対応できないサイトに対して、セレクタベースのフォーム定義を提供する。

## 1. 概要

- 拡張機能にはビルド時の最新パターンDBを同梱する
- 動的更新は行わない（将来的にGitHub Pages経由の定期更新を検討）
- 各フォーム定義は独立したステップとして動作する（ステートレスモデル）。URL + DOM条件で現在の画面を認識し、フィールドを特定する。

## 1.1 ヒューリスティックとパターンDBの使い分け基準

オートフィルで入力欄が検知できなかった場合、ヒューリスティックを修正すべきかパターンファイルを追加すべきかを以下の基準で判断する。

### 基本原則

判断の軸は **「標準的なHTML属性にフィールド種別を示すシグナルが存在するか」** である。

ヒューリスティックが参照する属性（参照: [extension-autofill.md](extension-autofill.md) Section 3-1.1）：
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

### グレーゾーンの扱い

属性にシグナルがあるが、そのパターンが一般的かどうか判断が難しい場合：

- 1つのサイトでのみ確認 → まずパターンファイルで対応
- 3つ以上の異なるドメインで同じ属性パターンが確認された → ヒューリスティックへ昇格を検討

### 判断フロー

```
入力欄が検知できなかった
  │
  ├─ 標準HTML属性にフィールド種別を示すシグナルがある？
  │    ├─ YES → ヒューリスティックの正規表現/ロジックを修正
  │    └─ NO  → パターンファイルを追加
  │
  └─ 検知はされたが誤分類された？
       ├─ そのサイト固有の問題 → パターンファイルの skip_fields で対応
       └─ 複数サイトで再現   → ヒューリスティックに除外パターン追加
```

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
  "description": "string (このパターンが必要な理由)",       // Required
  "match": {                                                // Required
    "type": "domain | domain_suffix",                       // Required
    "value": "string",                                      // Required
    "strict_subdomain": false                               // Optional (default: false)
  },
  "disabled": false,                                        // Optional (default: false)
  "forms": [                                                // Optional (省略時: ヒューリスティック検出にフォールバック)
    {
      "id": "string (フォーム識別子、デバッグ・ログ用)",    // Required
      "type": "login | login_username | login_password | totp | credit_card", // Required
      "condition": {                                        // Optional (省略時: 常にtrue)
        "url_path": "string (正規表現)",                    // Optional (省略時: 常にtrue)
        "element_exists": "string (CSSセレクタ)",           // Optional (省略時: 常にtrue)
        "element_not_exists": "string (CSSセレクタ)"        // Optional (省略時: 常にtrue)
      },
      "wait_for": {                                         // Optional (省略時: 待機なし)
        "selector": "string (CSSセレクタ)",                 // Required (wait_for指定時)
        "timeout_ms": 5000                                  // Optional (default: 5000)
      },
      "fields": {                                           // Required
        "<field_name>": {
          "selector": "string (CSSセレクタ)",               // Required
          "fallback_selectors": ["string (CSSセレクタ)"]    // Optional (省略時: フォールバックなし)
        }
      },
      "skip_fields": ["string (CSSセレクタ)"]              // Optional (省略時: 除外なし)
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

**複数フォームのマッチ：** `forms`配列内で複数のフォームがconditionを満たす場合、conditionを満たし且つ `fields` 内のセレクタが実際にDOMに存在する全フォームが適用される。

**matchタイプの説明：**

| タイプ | 値の例 | マッチ対象 |
|--------|--------|-----------|
| `domain` | `"accounts.google.com"` | 指定したホスト名に完全一致 |
| `domain_suffix` | `"amazon.com"` | 指定ドメインおよびそのすべてのサブドメインに一致（`www.amazon.com`, `smile.amazon.com` 等） |

**`strict_subdomain`フラグ：** `true`にすると、オートフィルのクレデンシャル照合がデフォルトのeTLD+1マッチではなく、エントリURLのホスト名との完全一致になる。デフォルトは`false`。

**正規表現マッチは採用しない：** マッチ範囲が人間にも機械にも静的に検証しにくく、悪意あるコントリビューターが過剰に広いパターン（例: `.*\.com`）を紛れ込ませるリスクがある。パスベースの条件分岐が必要な場合は、フォームレベルの `condition.url_path` で代替する。

## 4. パターンの評価順序

1. `domain`マッチ
2. `domain_suffix`マッチ
3. `default`（汎用ヒューリスティック）

複数のパターンがマッチした場合、より具体的なパターンを優先する。

## 5. ビルド時処理

1. `extension/patterns/sites/`配下の全JSONファイルを読み込む
2. `extension/patterns/schema.json`でバリデーション
3. サイト固有パターンをマージして`build/patterns.json`を生成
4. Content Scriptの静的アセットとしてバンドル

## 6. 具体例

### 6.1 単一画面ログイン

```json
{
  "description": "autocomplete属性が設定されていないため、ヒューリスティック検出がスコア不足で失敗する",
  "match": {
    "type": "domain",
    "value": "example.com"
  },
  "forms": [
    {
      "id": "login",
      "type": "login",
      "fields": {
        "username": { "selector": "#user-input" },
        "password": { "selector": "#pass-input" }
      }
    }
  ]
}
```

### 6.2 分割ログイン（Google）

```json
{
  "description": "分割ログインフロー。各ステップをDOM条件で独立に認識する",
  "match": {
    "type": "domain",
    "value": "accounts.google.com"
  },
  "forms": [
    {
      "id": "username-step",
      "type": "login_username",
      "condition": {
        "element_exists": "#identifierId"
      },
      "fields": {
        "username": { "selector": "#identifierId" }
      }
    },
    {
      "id": "password-step",
      "type": "login_password",
      "condition": {
        "element_exists": "input[type='password'][name='Passwd']"
      },
      "fields": {
        "password": { "selector": "input[type='password'][name='Passwd']" }
      }
    },
    {
      "id": "totp-step",
      "type": "totp",
      "condition": {
        "element_exists": "#totpPin"
      },
      "fields": {
        "totp": { "selector": "#totpPin" }
      }
    }
  ]
}
```

### 6.3 同一URLでの分割ステップ（否定条件の利用）

```json
{
  "description": "同一URL /ap/signin で username → password の2段階。DOM条件で区別する",
  "match": {
    "type": "domain_suffix",
    "value": "amazon.com"
  },
  "forms": [
    {
      "id": "email-step",
      "type": "login_username",
      "condition": {
        "url_path": "^/ap/signin",
        "element_exists": "#ap_email",
        "element_not_exists": "#ap_password"
      },
      "fields": {
        "username": { "selector": "#ap_email" }
      }
    },
    {
      "id": "password-step",
      "type": "login_password",
      "condition": {
        "url_path": "^/ap/signin",
        "element_exists": "#ap_password"
      },
      "fields": {
        "password": { "selector": "#ap_password" }
      }
    }
  ]
}
```

### 6.4 SPA動的レンダリング（wait_forの利用）

```json
{
  "description": "SPAでログインフォームが遅延レンダリングされる",
  "match": {
    "type": "domain",
    "value": "app.example.com"
  },
  "forms": [
    {
      "id": "login",
      "type": "login",
      "condition": {
        "url_path": "^/login"
      },
      "wait_for": {
        "selector": "#login-form",
        "timeout_ms": 5000
      },
      "fields": {
        "username": {
          "selector": "#login-form input[name='email']",
          "fallback_selectors": ["#login-form input[type='email']"]
        },
        "password": {
          "selector": "#login-form input[name='password']"
        }
      }
    }
  ]
}
```

### 6.5 マッチルールのみ（フォーム検出はヒューリスティック）

```json
{
  "description": "サブドメインごとに異なるクレデンシャルを使い分ける。フォーム検出はヒューリスティックで十分",
  "match": {
    "type": "domain_suffix",
    "value": "example.com",
    "strict_subdomain": true
  }
}
```

## 7. 開発者モード（パターンテスト）

> **実装済み**

拡張機能のポップアップ設定画面から開発者モードにアクセスでき、パターン作成・検証を支援する。

**機能：**

- **カスタムパターンの読み込み**：ファイルピッカーで任意の `patterns.json` を読み込み、ビルド済みのパターンDBと差し替えて動作させる。
- **デバッグパネル**：現在のページでのマッチ結果をパネルに表示する。
  - どの `match` タイプ（`domain` / `domain_suffix` / ヒューリスティック）で一致したか
  - 検出されたフィールドとそのシグナルスコア（ヒューリスティックの場合）
  - パターンDBのセレクタが実際のDOMに一致しているか
  - 入力を実行せずにドライランで確認できるモード

**セキュリティ上の注意：** 開発者モードはポップアップの設定画面からのみ有効化できる。通常の利用時は無効であり、カスタムパターンはメモリ上にのみ保持してvaultには保存しない。

**実装:**
- `extension/src/popup/screens/settings/DevMode.tsx` — 開発者モードUI（トグル、パターン読み込み、デバッグパネル）
- `extension/src/shared/dev-mode.ts` — 開発者モード状態管理（`chrome.storage.session`ベース）
- `extension/src/content/dev-mode-bridge.ts` — Content Scriptのパターンオーバーライドとドライラン処理
- `extension/src/content/debug-collector.ts` — デバッグレポート収集（パターンマッチング + ヒューリスティック結果）
