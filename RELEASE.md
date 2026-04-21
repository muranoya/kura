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
- Firefox 拡張のビルド → Firefox AMO に自動提出・署名
- Android APK のビルド
- GitHub Release の作成（全成果物を添付）

## 3. Chrome Web Store に手動アップロード

CI は Chrome Web Store への提出を自動化していない。リリースワークフロー完了後に手動で行う。

1. GitHub Release から `kura-chrome-extension-*.zip` をダウンロード
2. [Chrome Web Store デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole) を開く
3. kura 拡張機能（ID: `bkhdjpmpbkaiafemghempeagliblhofc`）の管理画面へ移動
4. **パッケージ** タブ → ZIP をアップロード
5. 更新内容の説明を入力して審査提出

審査には通常数営業日かかる。

## 必要な GitHub Secrets

| Secret | 用途 |
|--------|------|
| `AMO_API_KEY` | Firefox AMO 自動提出 |
| `AMO_API_SECRET` | Firefox AMO 自動提出 |
| `KEYSTORE_BASE64` | Android APK 署名 |
| `KEYSTORE_PASSWORD` | Android APK 署名 |
| `KEY_ALIAS` | Android APK 署名 |
| `KEY_PASSWORD` | Android APK 署名 |

`AMO_API_KEY` / `AMO_API_SECRET` が未設定の場合、Firefox 提出ステップは警告を出してスキップされる（他のビルドは継続）。
`KEYSTORE_BASE64` が未設定の場合、Android APK は署名なしでビルドされる。
