# Security Policy

## Supported Versions

kura is in early development. Only the latest released version receives security updates.

| Version | Supported |
| ------- | --------- |
| Latest release | Yes |
| Older releases | No |

## Reporting a Vulnerability

Please report security vulnerabilities privately through one of the following channels:

1. **GitHub Security Advisories** (preferred): open a private advisory at
   https://github.com/muranoya/kura/security/advisories/new
2. **Email**: daisuke.muraoka.jp@gmail.com

Please include:

- A description of the vulnerability
- Steps to reproduce, or a proof-of-concept
- Affected version(s), platform(s), and component (`vault-core`, extension, desktop, Android)
- Your contact information for follow-up

Please do **not** open a public GitHub Issue for security reports.

### Response expectations

- Acknowledgement within 7 days of receipt
- Initial assessment and expected remediation timeline within 14 days
- Fixes released as patch versions; the advisory is published after users have had a reasonable window to update

### Scope

In scope:

- `vault-core` (Rust library, including cryptography and sync logic)
- Browser extension (Firefox / Chrome) — client-side encryption, content script, background / offscreen contexts
- Desktop app (Tauri backend, S3 integration)
- Android app (JNI, S3 integration)
- Build and release pipelines that affect the integrity of published artifacts

Out of scope:

- Vulnerabilities in third-party S3-compatible storage services
- Issues arising from users running modified or outdated versions
- Social engineering attacks that do not exploit a specific vulnerability in the code
- Loss of data when the user has forgotten both the master password and the recovery key (this is a documented limitation — see the Terms of Use)

### Disclosure Policy

We follow coordinated disclosure. Please do not publicly disclose a vulnerability until a fix has been released. Reporters are credited in the advisory unless anonymity is requested.
