# kura — Firefox Add-ons Store Listing (English)

## Summary (up to 250 characters)

> Password manager with login auto-fill. Your passwords live only in cloud storage you provide (AWS S3, Cloudflare R2, MinIO). We run no server, collect no data, and cannot read your passwords. Fully open source and auditable.

(Approximately 225 characters — fits within AMO's Summary limit.)

---

## Description

**Your passwords are stored only in your own storage — nowhere else.**

kura is a password manager with no developer-operated server. Your encrypted vault is stored as a single file in an S3-compatible storage service of your choice (AWS S3, Cloudflare R2, MinIO, self-hosted, etc.).

## Key features

- **Zero-knowledge encryption** — Encryption and decryption happen entirely on your device. Neither the developer nor your storage provider can see your plaintext data.
- **No server required** — No backend operated by the developer. No account registration. No vendor lock-in.
- **Cross-platform sync** — Share the same vault across desktop (Windows / macOS / Linux), Android, and Chrome / Firefox extensions.
- **Offline-first** — Works with a local cache when offline, syncs automatically when connectivity returns.
- **Automatic conflict resolution** — Edit on multiple devices without data loss. Conflicts are merged automatically using timestamps.
- **Login form auto-fill** — Auto-fills entries matching the current site. URL matching only; browsing history is never collected.
- **Import from 1Password** — Migrate via the 1pux export format.

## Security

- **AES-256-GCM** authenticated encryption
- **Argon2id** memory-hard key derivation
- **Two-layer key hierarchy (KEK / DEK)** — A KEK derived from your master password encrypts the DEK
- **Recovery key** — Generated at setup so you can recover access if you forget your master password
- **Auto-lock** — Locks automatically after a period of inactivity or when moved to the background

## Privacy

- No telemetry, analytics, ads, or crash reporting
- Network traffic goes only to the S3 endpoint you configure
- Open source (Apache License 2.0)

Privacy policy: https://muranoya.github.io/kura.github.io/privacy-en.html

## Who it's for

- You want to manage your own passwords rather than entrust them to someone else
- You're uncomfortable with storing sensitive data on a password manager's servers
- You'd like to try running your own storage for the first time
- You already use AWS / Cloudflare R2 / MinIO and want to leverage it for password management
- You prefer open source, auditable implementations

## About setup

Setting up S3-compatible storage is straightforward by following each provider's documentation. Services like Cloudflare R2 offer generous free tiers, making them affordable for personal use. kura suits both first-time password manager users and those migrating from an existing service to storage they control.

## Supported storage

- AWS S3
- Cloudflare R2
- MinIO (including self-hosted)
- Any S3-compatible service that supports Conditional Write (If-Match)

## Notes

- kura is in early development. Data formats and features may change without notice.
- If you lose both your master password and recovery key, stored data cannot be recovered.
- Storage service fees are the user's responsibility.

## Links

- Source code: https://github.com/muranoya/kura
- Issue tracker: https://github.com/muranoya/kura/issues
- Website: https://muranoya.github.io/kura.github.io/
