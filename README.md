# kura

A serverless password manager. Your vault lives in your own S3-compatible storage.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

[日本語](README_ja.md)

> **Note:** kura is in early development and has not yet reached its first stable release. Data formats, APIs, and features may change without notice. Use at your own risk.

## Features

- **No server required** -- Store your encrypted vault as a single file on S3-compatible storage (AWS S3, Cloudflare R2, MinIO, etc.)
- **Zero-knowledge encryption** -- All encryption and decryption happens on your device. Your storage provider never sees your plaintext data.
- **Multi-platform** -- Desktop (Windows, macOS, Linux), Android, and browser extensions (Chrome, Firefox)
- **Offline-first** -- Works with a local cache when you're offline. Syncs automatically when connectivity is restored.
- **Automatic conflict resolution** -- Edit on multiple devices without worrying about data loss. Conflicts are resolved automatically via timestamp-based merge.
- **Import from 1Password** -- Migrate from 1Password using the 1pux export format.

## Supported Platforms

| Platform | Technology | Status |
|----------|-----------|--------|
| Windows / macOS / Linux | Tauri (Rust + React) | Available |
| Android | Kotlin + Jetpack Compose | Available |
| Chrome extension | React + WASM | Available |
| Firefox extension | React + WASM | Available |

All platforms share the same core library (`vault-core`), written in Rust, ensuring consistent encryption and sync behavior everywhere.

## Security

kura uses a two-layer encryption architecture:

```
Master Password
    |  Argon2id key derivation
    v
KEK (Key Encryption Key)
    |
    v
DEK (Data Encryption Key)  -- encrypted by KEK, stored in vault metadata
    |
    v
Vault data encrypted with AES-256-GCM
```

- **Client-side only** -- Encryption keys never leave your device. The storage provider only sees encrypted blobs.
- **AES-256-GCM** -- Industry-standard authenticated encryption for vault data.
- **Argon2id** -- Memory-hard key derivation to resist brute-force attacks.
- **Recovery key** -- Generated during setup. If you forget your master password, the recovery key can unlock your vault and set a new one.

## How It Works

```
Client (Desktop / Android / Browser Extension)
  |- Encryption & decryption (all client-side)
  |- Local cache (offline support)
  '- Read/write to cloud storage
            |
      vault.json (single encrypted file)
            |
   S3 / Cloudflare R2 / MinIO (your choice)
```

The shared Rust core (`vault-core`) compiles to:
- **Native binary** -- for the Tauri desktop backend
- **JNI library** -- for Android via Java Native Interface
- **WebAssembly** -- for browser extensions

This means encryption logic, sync algorithms, and data handling are identical across all platforms.

## Setup

Build and test commands are available via `just help`.

### AWS S3 Setup

Create an IAM user for kura and configure access to your S3 bucket.

#### 1. Create an S3 bucket

```sh
aws s3 mb s3://your-kura-vault-bucket
```

#### 2. Create an IAM user and generate access keys

```sh
aws iam create-user --user-name kura
aws iam create-access-key --user-name kura
```

Use the returned `AccessKeyId` and `SecretAccessKey` in the app's storage settings.

#### 3. Configure the IAM policy

kura only requires `s3:GetObject` and `s3:PutObject` permissions. Create and attach the following policy:

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

> For other S3-compatible storage services like Cloudflare R2 or MinIO, follow each service's documentation to generate access keys.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
