# kura

サーバ不要のパスワードマネージャー

## セットアップ

ビルドやテストの実行方法は `just help` で確認できます。

### AWS S3 のセットアップ

kura 用の IAM ユーザーを作成し、S3 バケットへのアクセス権限を設定します。

#### 1. S3 バケットを作成

AWS コンソールまたは CLI でバケットを作成します。

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

