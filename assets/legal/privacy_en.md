# kura Privacy Policy

Last updated: April 20, 2026

## 1. Overview

kura ("the Software") is a zero-knowledge password manager. Because the Software does not rely on any server operated by the developer, the developer does not collect, store, or transmit any user information.

## 2. Information Not Collected by the Developer

The developer does not collect any information from users, including but not limited to:

- Master passwords
- Password items stored in the vault (logins, notes, custom fields, etc.)
- S3 storage credentials (access keys, secret keys)
- URLs, domains, or content of websites the user visits
- Device information, usage logs, or crash reports
- IP addresses or location data
- Email addresses, names, or any account information

Using the Software requires no registration or account creation with the developer.

## 3. Handling of Information Entered by the User

The following information is entered by the user and is encrypted before being stored in the S3-compatible storage the user has chosen:

- **Master password**: Used only to derive the encryption key. It is never written to storage. It resides in device memory while in use and is zeroized when the vault is locked.
- **Password items in the vault**: Stored in the user's chosen storage only in AES-256-GCM encrypted form.
- **S3 storage configuration (access key / secret key / endpoint, etc.)**: Encrypted with a key derived from the master password and stored locally on the user's device (`browser.storage.local` for the browser extension, Tauri store for desktop, Android Keystore for Android).
- **Recovery key**: Intended to be stored by the user themselves (e.g., printed on paper). It is never stored in plaintext on the device or in storage.

## 4. Encryption Architecture

- **Cipher**: AES-256-GCM (authenticated encryption)
- **Key derivation**: Argon2id (memory-hard)
- **Key hierarchy**: A KEK (Key Encryption Key) derived from the master password encrypts the DEK (Data Encryption Key). The DEK encrypts the vault data.
- **Key custody**: Encryption keys exist only on the user's device. Keys reach storage only in encrypted form.

## 5. Network Communication

The Software communicates only in the following cases:

- Reads and writes to the S3-compatible endpoint the user has explicitly configured
- For browser extensions, communication within the same device via browser-provided APIs

The Software never:

- Communicates with any server operated by the developer
- Sends data to analytics services such as Google Analytics
- Serves ads, collects crash reports, or sends telemetry
- Uploads data to any third-party cloud service
- Transmits the contents of websites the user visits to any external party

## 6. Browser Extension Permissions

The Firefox and Chrome extensions request the following permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Store vault settings and cache in the browser's local storage |
| `alarms` | Timers for the auto-lock feature |
| `clipboardWrite` / `clipboardRead` | Copy passwords to the clipboard and automatically clear them after a configurable delay |
| `tabs` | Look up entries that match the current tab's URL (URL only; browsing history is not collected) |
| `offscreen` (Chrome only) | Run WebAssembly in Manifest V3 |
| `<all_urls>` content script | Detect login forms and auto-fill credentials. The contents of detected forms are never transmitted externally. |

## 7. Cookies and Trackers

The Software does not issue cookies. It contains no scripts or SDKs for analytics, advertising, or tracking.

## 8. Disclosure to Third Parties

Because the developer has no access to user information, no information is disclosed to third parties. The S3-compatible storage service the user selects receives only the encrypted vault file. Use of that storage service is governed by the terms of its respective provider.

## 9. Children's Privacy

The Software is not directed at users under 13. Because the developer does not collect personal information, no specific consent procedure is implemented.

## 10. Data Deletion

- **Vault data**: The user can delete the vault file from S3 storage to permanently remove the encrypted data.
- **Local cache**: Can be removed by uninstalling the Software or via the browser's extension settings.

## 11. Contact

For inquiries about this privacy policy:

- Email: daisuke.muraoka.jp@gmail.com
- GitHub Issues: https://github.com/muranoya/kura/issues

## 12. Changes to This Policy

This policy may be updated from time to time. Material changes will be announced via software updates or through the GitHub repository.

## 13. Governing Law

This policy is governed by the laws of Japan.
