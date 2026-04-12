# kura

サーバ不要のパスワードマネージャー。あなた自身のS3互換ストレージにvaultを保管します。

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

[English](README.md)

> **注意:** kura は開発初期段階であり、最初の安定版リリースには至っていません。データ形式、API、機能は予告なく変更される可能性があります。ご利用は自己責任でお願いします。

## 特徴

- **サーバ不要** -- 暗号化されたvaultを単一ファイルとしてS3互換ストレージ（AWS S3、Cloudflare R2、MinIOなど）に保存するだけ
- **ゼロ知識暗号化** -- 暗号化・復号はすべてデバイス上で実行。ストレージプロバイダーが平文データを見ることはありません
- **マルチプラットフォーム** -- デスクトップ（Windows、macOS、Linux）、Android、ブラウザ拡張機能（Chrome、Firefox）に対応
- **オフラインファースト** -- オフライン時はローカルキャッシュで動作。接続が回復すると自動的に同期
- **自動コンフリクト解消** -- 複数デバイスで編集してもデータロストの心配なし。タイムスタンプベースのマージで自動解消
- **1Passwordからのインポート** -- 1puxエクスポート形式を使って1Passwordから移行可能

## 対応プラットフォーム

| プラットフォーム | 技術 | 状態 |
|----------------|------|------|
| Windows / Linux | Tauri (Rust + React) | 利用可能 |
| macOS (Apple Silicon) | Tauri (Rust + React) | 利用可能（[インストール手順](#macos-インストール手順)参照） |
| Android | Kotlin + Jetpack Compose | 利用可能 |
| Chrome 拡張機能 | React + WASM | 利用可能 |
| Firefox 拡張機能 | React + WASM | 利用可能 |

すべてのプラットフォームでRust製のコアライブラリ（`vault-core`）を共有しており、暗号化と同期の挙動がどの環境でも同一であることを保証しています。

## セキュリティ

kuraは二層暗号化アーキテクチャを採用しています。

```
マスターパスワード
    |  Argon2idで鍵導出
    v
KEK（Key Encryption Key）
    |
    v
DEK（Data Encryption Key） -- KEKで暗号化し、vaultメタデータに保存
    |
    v
vaultデータをAES-256-GCMで暗号化
```

- **クライアントサイドのみ** -- 暗号化鍵がデバイスの外に出ることはありません。ストレージプロバイダーには暗号化されたデータのみが見えます
- **AES-256-GCM** -- 業界標準の認証付き暗号化でvaultデータを保護
- **Argon2id** -- メモリハードな鍵導出関数でブルートフォース攻撃に対抗
- **リカバリーキー** -- セットアップ時に生成。マスターパスワードを忘れた場合でも、リカバリーキーでvaultのロック解除と新しいマスターパスワードの設定が可能

## 仕組み

```
クライアント（デスクトップ / Android / ブラウザ拡張機能）
  |- 暗号化・復号（すべてクライアントサイド）
  |- ローカルキャッシュ（オフライン対応）
  '- クラウドストレージへの読み書き
            |
      vault.json（単一の暗号化ファイル）
            |
   S3 / Cloudflare R2 / MinIO（ユーザーが選択）
```

共有Rustコア（`vault-core`）は以下にコンパイルされます。
- **ネイティブバイナリ** -- Tauriデスクトップバックエンド用
- **JNIライブラリ** -- Java Native Interfaceを介したAndroid用
- **WebAssembly** -- ブラウザ拡張機能用

これにより、暗号化ロジック・同期アルゴリズム・データ処理がすべてのプラットフォームで同一です。

## macOS インストール手順

> **注意:** kura は Apple Developer Program に加入せず ad-hoc 署名で配布しています。そのため macOS 標準のセキュリティ機構（Gatekeeper）により、初回起動時に「"kura" は壊れているため開けません」と表示されます。これは kura のバイナリが実際に壊れているわけではなく、Apple による公証（Notarization）を受けていないために発生する既知の挙動です。

### 対応アーキテクチャ

macOS 版は **Apple Silicon (M1/M2/M3 など、arm64)** のみ対応しています。Intel Mac には対応していません。

### インストール手順

1. GitHub Releases から `kura-desktop-macos-arm64-<VERSION>.dmg` をダウンロード
2. dmg をダブルクリックでマウントし、`kura.app` を `/Applications` へドラッグ&ドロップ
3. ターミナルで以下を実行し、quarantine 属性を削除

   ```sh
   xattr -cr /Applications/kura.app
   ```

4. Launchpad または Finder から `kura.app` を起動

### この手順は何をしているのか

`xattr -cr` は macOS がインターネット経由のファイルに自動で付ける `com.apple.quarantine` 拡張属性を再帰的に削除するコマンドです。kura は本リポジトリで公開されているオープンソースソフトウェアです。自分でビルドする場合（`just release-desktop-macos`）はこの手順は不要です。

## セットアップ

ビルドやテストの実行方法は `just help` で確認できます。

### AWS S3 のセットアップ

kura 用の IAM ユーザーを作成し、S3 バケットへのアクセス権限を設定します。

#### 1. S3 バケットを作成

```sh
aws s3 mb s3://your-kura-vault-bucket
```

#### 2. IAM ユーザーを作成しアクセスキーを発行

```sh
aws iam create-user --user-name kura
aws iam create-access-key --user-name kura
```

発行された `AccessKeyId` と `SecretAccessKey` をアプリのストレージ設定で使用します。

#### 3. IAM ポリシーを設定

kura が必要とする権限は `s3:GetObject` と `s3:PutObject` のみです。以下のポリシーを作成してユーザーにアタッチします。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::your-kura-vault-bucket/vault.json"
    }
  ]
}
```

```sh
aws iam put-user-policy \
  --user-name kura \
  --policy-name kura-vault-access \
  --policy-document file://policy.json
```

> Cloudflare R2 や MinIO など他の S3 互換ストレージを使う場合は、各サービスのドキュメントに従ってアクセスキーを発行してください。

## ライセンス

[Apache License, Version 2.0](LICENSE) でライセンスされています。
