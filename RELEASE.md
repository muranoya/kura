# リリース手順

## 1. バージョン番号を上げる

`VERSION` ファイルを編集してバージョンを更新する。

```
0.1.7  →  0.1.8
```

バージョンは CI 実行時に extension/manifest.json`、`extension/package.json` 等へ自動同期される。

## 2. リリースワークフローをトリガー

GitHub の **Actions → Release → Run workflow** からワークフローを手動実行する。

| 入力 | 値 |
|------|----|
| `components` | `all` |
| `dry_run` | `false`（チェックを外す） |

CI が自動で行うこと：
- デスクトップアプリのビルド（Linux AppImage / `.deb`、macOS DMG、Windows NSIS インストーラー）
- Chrome 拡張 ZIP のビルド → GitHub Release に添付（`kura-chrome-extension-*.zip`）
- Firefox 拡張のビルド → AMO に unlisted（ストア非公開）で提出して署名 → 署名済み xpi を GitHub Release に添付（`kura-firefox-extension-*.xpi`）
- Android APK のビルド
- GitHub Release の作成（全成果物を添付）

## 3. 拡張機能のインストール

拡張機能はストアに公開していないため、GitHub Release の成果物から手動でインストールする。

- **Chrome**: `kura-chrome-extension-*.zip` を展開し、`chrome://extensions` でデベロッパーモードを有効にして「パッケージ化されていない拡張機能を読み込む」から展開先を指定する
- **Firefox**: `kura-firefox-extension-*.xpi` を Firefox にドラッグ&ドロップしてインストールする（unlisted 署名済みのため通常版の Firefox でもインストールできる）

## 必要な GitHub Secrets

| Secret | 用途 |
|--------|------|
| `AMO_API_KEY` | Firefox 拡張の署名 |
| `AMO_API_SECRET` | Firefox 拡張の署名 |
| `KEYSTORE_BASE64` | Android APK 署名 |
| `KEYSTORE_PASSWORD` | Android APK 署名 |
| `KEY_ALIAS` | Android APK 署名 |
| `KEY_PASSWORD` | Android APK 署名 |

`AMO_API_KEY` / `AMO_API_SECRET` が未設定の場合、Firefox の署名ステップは警告を出してスキップされ、署名済み xpi は添付されない（他のビルドは継続）。
`KEYSTORE_BASE64` が未設定の場合、Android APK は署名なしでビルドされる。
