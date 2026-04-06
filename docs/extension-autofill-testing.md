<!-- doc-status: implemented -->

# ブラウザ拡張機能 オートフィル テスト戦略

オートフィル機能のテストは **ユニットテスト** と **手動テスト環境** の2段構えで行う。

## 1. テスト戦略の概要

| テスト種別 | 守備範囲 | 実行方法 |
|-----------|---------|---------|
| ユニットテスト | 検出・分類・マッチングの**ロジック** | `pnpm test`（CI可能） |
| 手動テスト | ブラウザ上の**実動作**（DOM操作、UI表示、イベント伝播、フレームワーク互換性） | ローカルサーバ + ブラウザで目視確認 |

**ユニットテストの役割**: 純粋なロジック（フィールドスコアリング、フォームタイプ分類、eTLD+1マッチング、メッセージハンドラ）の正確性を保証する。リファクタリングやロジック変更時のリグレッション検知が主目的。

**手動テスト環境の役割**: ユニットテストでカバーできない実際のブラウザ動作を検証する。ドロップダウンの表示位置、キーボード操作、React/Vue等のフレームワーク互換性、分割ログインのページ遷移、Shadow DOM等。UXの品質確認も含む。

## 2. ユニットテスト

### 2.1 テスト基盤

- **フレームワーク**: vitest + jsdom
- **設定ファイル**: `extension/vitest.config.ts`（`vite.config.ts` とは別。CRXJS/WASMプラグインをテスト時に読み込まない）
- **テストファイル配置**: `extension/src/__tests__/*.test.ts`
- **セットアップ**: `extension/src/__tests__/setup.ts`（chrome APIグローバルモック）
- **実行コマンド**: `pnpm test`

### 2.2 テストの書き方

**純粋関数のテスト**（etld, form-detector, field-classifier）:
- 入力データを直接渡し、戻り値を検証する
- DOMやブラウザAPIへの依存がないため、モック不要

**メッセージハンドラのテスト**（background/autofill.ts）:
- `initAutofill(mockVaultApi, mockIsUnlocked)` でモックを注入
- `handleAutofillMessage(message, sender, sendResponse)` を直接呼び出し
- `sendResponse` を `vi.fn()` でキャプチャし、引数を検証

### 2.3 機能追加時のテスト追加ガイドライン

**新しいフォームタイプを追加する場合:**
1. `field-classifier.ts` にシグナル定義を追加 → `field-classifier.test.ts` に `computeScores` のテスト追加
2. `form-detector.ts` に分類ロジックを追加 → `form-detector.test.ts` に `classifyFormType` のテスト追加
3. `background/autofill.ts` にハンドラを追加 → `autofill-handler.test.ts` にメッセージハンドラのテスト追加

**検出ロジックを変更する場合:**

1. 既存テストが全て通ることを確認（リグレッション防止）
2. 変更対象のシナリオに対するテストを追加

**新しいメッセージタイプを追加する場合:**
1. `autofill-handler.test.ts` に新メッセージタイプのテストケースを追加

**eTLD+1リストを更新する場合:**
1. 追加したTLDに対する `etld.test.ts` のテストケースを追加

## 3. 手動テスト環境

### 3.1 概要

テスト用HTMLページ群をローカルサーバで配信し、MinIO（S3互換サーバ）にテスト用vaultを配置する。拡張機能は通常のS3接続フローでMinIOに接続するため、拡張機能側に特殊なテスト用コードは一切不要。

### 3.2 構成

```
extension/test-pages/
  server.ts              # テストページ配信用HTTPサーバ（Node.js）
  index.html             # テストページ一覧（インデックス）
  pages/
    login-standard.html       # 標準ログインフォーム
    login-formless.html       # <form>なしのSPAログイン
    login-split-username.html # 分割ログイン: ユーザー名ページ
    login-split-password.html # 分割ログイン: パスワードページ
    login-react.html          # React controlled inputのログイン
    registration.html         # 新規登録フォーム
    password-change.html      # パスワード変更フォーム
    totp.html                 # TOTP入力フォーム
    credit-card.html          # クレジットカード入力フォーム
    multiple-forms.html       # 同一ページ複数フォーム
    nested-inputs.html        # 深いネスト（4階層）のフォームレス入力
    autocomplete-attrs.html   # HTML5 autocomplete属性バリエーション
    shadow-dom.html           # Web Component内のinput（Open Shadow DOM）
    hidden-fields.html        # visibility: hidden等の非表示フィールド混在
    http-warning.html         # HTTP経由アクセス用（警告バナー確認）

vault-core/tests/generate_test_vault.rs       # テスト用フィクスチャ生成
extension/test-pages/fixtures/vault.json      # 生成された暗号化済みvault
extension/test-pages/fixtures/transfer-config.txt  # 設定転送用暗号化文字列
```

### 3.3 テストデータ（vault.jsonフィクスチャ）

#### 生成方法

vault-coreのAPIを使ったRust統合テストとしてフィクスチャ生成スクリプトを実装する。vault-coreから生成することで、暗号化フォーマットやスキーマの変更に自動的に追従できる。

```bash
# フィクスチャの生成（必要な時だけ実行）
cargo test -p vault_core --test generate_test_vault -- --ignored
```

- `#[ignore]` 属性を付与し、通常の `cargo test` では実行されない
- 出力先: `extension/test-pages/fixtures/vault.json`
- マスターパスワード: `kura-test`（ドキュメントに明記）

#### テストエントリの内容

| エントリ名 | タイプ | URL | 用途 |
|-----------|--------|-----|------|
| Test Login 1 | login | `http://localhost:PORT/*` | 標準ログイン、候補複数表示の確認 |
| Test Login 2 | login | `http://localhost:PORT/*` | 同上（複数候補） |
| TOTP Login | login | `http://localhost:PORT/*` | TOTPカスタムフィールド付き |
| Test Credit Card | credit_card | — | クレジットカードフォーム用 |
| Other Site Login | login | `https://other-site.example.com` | マッチしないエントリ（表示されないことの確認） |

#### メンテナンス方針

- テストエントリの追加・変更は `generate_test_vault.rs` を編集して再生成する
- 生成されたフィクスチャ `vault.json` はgitにコミットする（再生成環境がなくても手動テストを実行可能にするため）
- vault-coreのAPI変更でフィクスチャ生成が壊れた場合、`generate_test_vault.rs` のコンパイルエラーとして検知できる

### 3.4 S3互換ストレージ（MinIO）

拡張機能は `@aws-sdk/client-s3` を使用しており、S3プロトコル（Sigv4署名、XMLレスポンス等）の完全な互換性が必要。自前のモックS3サーバは信頼性・メンテナンスの面でリスクが高いため、MinIOを使用する。

既存の `docker-compose.test.yml` を再利用し、テスト用vaultのシード処理を追加する。

```bash
# MinIO起動 + テスト用vault配置
docker compose -f docker-compose.test.yml up -d --wait minio
docker compose -f docker-compose.test.yml run --rm createbuckets
# vault.jsonフィクスチャをMinIOにアップロード
docker compose -f docker-compose.test.yml run --rm seedvault
```

**拡張機能のS3設定**（初回のみ）:

設定転送機能を使って一括設定する。`just test-manual-autofill` 実行時に表示される転送文字列を、拡張機能のオンボーディング画面「設定を転送」に貼り付け、マスターパスワード `kura-test` を入力する。

転送文字列はフィクスチャ生成時に `extension/test-pages/fixtures/transfer-config.txt` にも保存される。

設定内容:

| 項目 | 値 |
|------|-----|
| Endpoint | `http://localhost:9000` |
| Bucket | `kura-test` |
| Key | `vault.json` |
| Region | `ap-northeast-1` |
| Access Key | `minioadmin` |
| Secret Key | `minioadmin` |
| マスターパスワード | `kura-test` |

### 3.5 開発者ワークフロー

```bash
# 1. 全環境の起動（フィクスチャ生成 + MinIO + テストページサーバ）
just test-manual-autofill

# 2. ブラウザで拡張機能をロードし、S3設定を入力（初回のみ）
#    マスターパスワード: kura-test

# 3. テストページを開いて動作確認
#    http://localhost:3333/

# 4. 終了時
just test-manual-autofill-stop
```

個別に実行する場合:

```bash
# フィクスチャの生成のみ（エントリ変更時）
cargo test -p vault_core --test generate_test_vault -- --ignored

# MinIO + テストデータの起動のみ
docker compose -f docker-compose.test.yml up -d --wait minio
docker compose -f docker-compose.test.yml run --rm createbuckets
docker compose -f docker-compose.test.yml run --rm seedvault

# テストページサーバの起動のみ
cd extension && pnpm test:manual
```

### 3.6 各テストページの検証項目

#### 標準ログインフォーム (`login-standard.html`)
- `<form>` 内に `username` + `password` フィールド
- ドロップダウンがinput直下（4px下）に表示される
- キーボード操作（↑↓、Enter、Escape、Tab）が動作する
- 候補選択で username + password が入力される
- フォーム submit が入力値を正しく送信する

#### フォームレスSPAログイン (`login-formless.html`)
- `<form>` なし、`<div>` 内にinputを配置
- フォームコンテナが3-4階層の親要素探索で検出される
- 入力フィールドが正しく分類される
- JSによるsubmit（fetch/XHR）が入力値を取得できる

#### 分割ログイン (`login-split-username.html` → `login-split-password.html`)
- ユーザー名ページで候補選択 → ユーザー名のみ入力される
- ページ遷移（リンクまたはJS）でパスワードページへ移動
- パスワードページでフォーカス時、ドロップダウンなしに自動入力される
- 5分経過後はpending flowが無効になることを確認

#### React controlled input (`login-react.html`)
- React CDN版を使用したシンプルなログインフォーム
- `onChange` ハンドラが発火し、React stateが入力値を反映する
- フォームバリデーション（必須チェック等）が正常に動作する
- submit時に正しい値が取得できる

#### 新規登録フォーム (`registration.html`)
- username + email + new_password + confirm_password
- REGISTRATION として検出される
- パスワード生成提案（将来機能）の検証ポイント

#### パスワード変更フォーム (`password-change.html`)
- current_password + new_password + confirm_new_password
- PASSWORD_CHANGE として検出される

#### TOTP (`totp.html`)
- `autocomplete="one-time-code"` の単一入力フィールド
- TOTP として検出され、ドロップダウンなしに自動入力される
- 数値のみの入力制限（`inputmode="numeric"`）があっても正しく動作する

#### クレジットカード (`credit-card.html`)
- cc_number + cc_exp + cc_cvc + cc_name の4フィールド
- CREDIT_CARD として検出される
- 全フィールドが正しい順序で入力される（30msディレイ）

#### 同一ページ複数フォーム (`multiple-forms.html`)
- ログインフォームと検索フォームが同一ページに存在
- フォーカスしたフィールドのフォームコンテナのみ検出される
- 検索フォームでは候補が表示されない

#### 深いネスト (`nested-inputs.html`)
- 4階層以上ネストされた`<div>`内のinput
- フォームコンテナ探索で適切な範囲が検出される

#### autocomplete属性バリエーション (`autocomplete-attrs.html`)
- 各種HTML5標準autocomplete値のinputを配置
- `username`, `current-password`, `new-password`, `one-time-code`, `cc-number`, `cc-exp`, `cc-csc`, `cc-name`
- 各フィールドが正しい FieldType に分類される

#### Shadow DOM (`shadow-dom.html`)
- Open Shadow Root内のinputフィールド
- focusイベントがshadow境界を越えてバブルアップする
- ドロップダウンが正しく表示される

#### 非表示フィールド混在 (`hidden-fields.html`)
- `display: none`, `visibility: hidden`, `opacity: 0`, `width: 0` のフィールドが混在
- 非表示フィールドが検出対象から除外される
- 表示フィールドのみが正しく分類される

#### HTTP警告 (`http-warning.html`)
- HTTPプロトコルでアクセス（サーバ側でHTTPポートも提供）
- ドロップダウン上部に「このページは暗号化されていません」警告バナーが表示される
- バナーがドロップダウンのレイアウトを崩さない

### 3.7 手動テストチェックリスト

機能追加・変更後に以下を確認する:

- [ ] 全テストページでドロップダウンが正しく表示される
- [ ] キーボードナビゲーション（↑↓、Enter、Escape、Tab）が動作する
- [ ] 候補選択で正しいフィールドに値が入力される
- [ ] Vault ロック状態でロックUIが表示される
- [ ] ロックUI からポップアップを開ける
- [ ] HTTPページで警告バナーが表示される
- [ ] 分割ログインフローが動作する（ページ遷移をまたいで）
- [ ] TOTPの自動入力が動作する（ドロップダウンなし）
- [ ] クレジットカードの全フィールドが入力される
- [ ] React controlled input で値がstateに反映される
- [ ] 非表示フィールドが無視される
- [ ] 複数フォームのページで正しいフォームのみ検出される

### 3.8 機能追加時のテストページ追加ガイドライン

- **新しいフォームタイプに対応** → 対応するテストページを `pages/` に追加、`index.html` のリストを更新、`generate_test_vault.rs` にテストエントリを追加
- **新しいフレームワーク対応** → フレームワーク固有のテストページを追加（例: `login-vue.html`）
- **エッジケースの修正** → 再現するテストページを追加（既存ページへの追記でも可）
- **新しいUI要素** → 該当するテストページに検証項目を追加
