<!-- doc-status: implemented -->

# Firefox AMO 配信運用手順

Mozilla Add-ons (AMO) への listed 配信および更新手順をまとめる。

## 前提

- AMO 開発者アカウント: https://addons.mozilla.org/developers/
- アドオン ID: `kura-pm@meshpeak.net`
- リポジトリ: https://github.com/muranoya/kura
- API 認証情報: `AMO_API_KEY` / `AMO_API_SECRET`（https://addons.mozilla.org/developers/addon/api/key/ で取得）
  - GitHub Secrets に `AMO_API_KEY` / `AMO_API_SECRET` として登録しておくこと

## 成果物の種類

| ファイル | 生成レシピ | 用途 |
|---------|-----------|------|
| `extension/kura-extension-firefox.zip` | `just release-extension` | AMO にアップロードする拡張本体 |
| `extension/kura-extension-source-<ver>.zip` | release workflow が自動生成 | AMO レビュアー向けソースコード（workflow が自動提出） |

Firefox 拡張の署名済み xpi は AMO から直接ダウンロードする。GitHub Releases には含まれない。

## 初回 listed 提出手順

### 1. バージョンとコミットを揃える

```bash
echo "0.1.7" > VERSION
node scripts/sync-version.mjs        # 各 Cargo.toml / package.json / manifest に反映
git add -A && git commit -m "release: 0.1.7"
git tag v0.1.7
git push && git push --tags
```

### 2. ローカル検証

- `about:debugging` → 「一時的なアドオンを読み込む」で `extension/dist/manifest.json` を指定
- golden path（ポップアップ開く / vault アンロック / 自動入力 / ロック）を実機で確認
- `web-ext lint` でエラー 0 を確認:
  ```bash
  just release-extension
  cd extension && pnpm web-ext lint --source-dir dist
  ```

### 3. AMO ダッシュボードで入力する項目

| 項目 | 値 |
|------|------|
| Name | `kura` |
| Summary (英) | `assets/store/firefox/description_en.md` 冒頭の 1 段落 |
| Summary (日) | `assets/store/firefox/description_ja.md` 冒頭の 1 段落 |
| Description (英/日) | 同ファイルの本文 |
| Homepage | `https://github.com/muranoya/kura` |
| Support Email | `daisuke.muraoka.jp@gmail.com` |
| Support Website | `https://github.com/muranoya/kura/issues` |
| Privacy Policy | `https://muranoya.github.io/kura.github.io/privacy-en.html` / `privacy-ja.html` |
| Category | Password Managers |
| License | Apache-2.0 |
| Icon | `assets/store/firefox/icon-512-locked.png` (または `-unlocked`) |
| Screenshots | `assets/store/firefox/screenshots/{ja,en}/*.png`（720×480 以上を 3〜5 枚） |

### 4. 権限説明（審査対策）

| permission | 説明 |
|-----------|------|
| `storage` | 暗号化済み vault キャッシュと設定の永続化 |
| `alarms` | オートロックタイマー |
| `clipboardRead` / `clipboardWrite` | パスワードのコピーとクリア |
| `tabs` | アクティブタブの URL 判定（自動入力対象の絞り込み） |
| `offscreen` | MV3 で WASM（vault-core）を実行するためのオフスクリーンドキュメント |
| `<all_urls>` content script | フォーム検出と自動入力 UI の注入 |

### 5. release workflow を実行

GitHub Actions の release workflow を `components: extension`（または `all`）で実行する。
workflow が以下を自動で行う:

1. `kura-extension-firefox.zip` をビルド
2. `web-ext sign --channel listed` で AMO に提出
3. ソースコード bundle を生成して AMO API 経由で提出

### 6. 審査待ち → 公開

審査期間は数日〜2週間程度。審査中に修正要請が来た場合は、version を `0.1.8` にインクリメントして再提出する（手順 1 からやり直し）。

## 更新リリース手順（listed 化後）

VERSION を上げて release workflow を実行するだけ。

```bash
echo "0.1.8" > VERSION
node scripts/sync-version.mjs
git add -A && git commit -m "release: 0.1.8"
git tag v0.1.8
git push && git push --tags
```

GitHub Actions の release workflow を実行する（`components: all` または `extension`）。
workflow が拡張のビルド・AMO 提出・ソースバンドル提出を自動で行う。

AMO ダッシュボードで以下を手動更新:

- Release notes（`fastlane/metadata/android/{en-US,ja}/changelogs/<versionCode>.txt` と同じ文面を流用）

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| `web-ext sign` が失敗する | `web-ext lint --source-dir dist` でエラーを確認 |
| `web-ext lint` が `MANIFEST_VERSION_INCOMPATIBLE` | `manifest.firefox.json` の `manifest_version: 3` と Firefox 対象バージョンを確認 |
| source bundle アップロードが失敗する | 未コミットの変更がある可能性。`git status` で確認して commit または stash |
| AMO が「ソースコードが不完全」とリジェクト | `Cargo.lock` / `pnpm-lock.yaml` / `assets/public_suffix_list.dat` が source bundle に入っているか確認 |
| ポーリングタイムアウト（version not found） | AMO の応答が遅い。workflow を再実行するか、AMO ダッシュボードで source bundle を手動アップロード |

## 関連ファイル

- `extension/manifest.firefox.json` — Firefox 専用 manifest（`browser_specific_settings.gecko.id` を含む）
- `extension/scripts/sign-or-download-firefox.ts` — AMO への listed 提出とソースバンドルアップロード
- `extension/scripts/source-bundle.ts` — ソース提出用 zip 生成
- `justfile` — `release-extension` / `source-bundle-extension`
- `assets/store/firefox/` — ストア掲載用アイコンと説明文
- `scripts/sync-version.mjs` — `VERSION` → 各 manifest / Cargo.toml / package.json
