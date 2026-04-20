<!-- doc-status: implemented -->

# Firefox AMO 配信運用手順

Mozilla Add-ons (AMO) への listed 配信および更新手順をまとめる。

## 前提

- AMO 開発者アカウント: https://addons.mozilla.org/developers/
- アドオン ID: `kura-pm@meshpeak.net`
- リポジトリ: https://github.com/muranoya/kura
- 現状は unlisted 運用。初回 listed 提出は AMO ダッシュボードから手動で行う
- API 認証情報: `AMO_API_KEY` / `AMO_API_SECRET`（https://addons.mozilla.org/developers/addon/api/key/ で取得）

## 成果物の種類

| ファイル | 生成レシピ | 用途 |
|---------|-----------|------|
| `extension/kura-extension-firefox.zip` | `just release-extension` | AMO にアップロードする拡張本体 |
| `extension/kura-extension-source-<ver>.zip` | `just source-bundle-extension` | AMO レビュアー向けソースコード提出 |

## 初回 listed 提出手順

### 1. バージョンとコミットを揃える

```bash
echo "0.1.7" > VERSION
node scripts/sync-version.mjs        # 各 Cargo.toml / package.json / manifest に反映
git add -A && git commit -m "release: 0.1.7"
git tag v0.1.7
```

### 2. ビルド

```bash
just release-extension        # kura-extension-firefox.zip を生成
just source-bundle-extension  # kura-extension-source-0.1.7.zip を生成
```

### 3. ローカル検証

- `about:debugging` → 「一時的なアドオンを読み込む」で `extension/dist/manifest.json` を指定
- golden path（ポップアップ開く / vault アンロック / 自動入力 / ロック）を実機で確認
- `kura-extension-firefox.zip` を web-ext validator にかけてエラー 0 を確認
  ```bash
  cd extension && pnpm web-ext lint --source-dir dist
  ```

### 4. AMO ダッシュボードで入力する項目

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

### 5. 権限説明（審査対策）

| permission | 説明 |
|-----------|------|
| `storage` | 暗号化済み vault キャッシュと設定の永続化 |
| `alarms` | オートロックタイマー |
| `clipboardRead` / `clipboardWrite` | パスワードのコピーとクリア |
| `tabs` | アクティブタブの URL 判定（自動入力対象の絞り込み） |
| `offscreen` | MV3 で WASM（vault-core）を実行するためのオフスクリーンドキュメント |
| `<all_urls>` content script | フォーム検出と自動入力 UI の注入 |

### 6. ソースコード提出

「拡張機能ソースコードの提出が必要か」→ **はい**（WASM / バンドル済み JS を含むため）。
`kura-extension-source-<ver>.zip` をアップロードし、ビルド手順を以下のように記載:

```
Requirements: Node.js 22+, pnpm 10+, Rust stable, wasm-pack, just

Build commands:
  1. node scripts/sync-version.mjs
  2. wasm-pack build extension/wasm-bridge --target bundler --out-dir ../wasm
  3. cd extension && pnpm install
  4. pnpm run build:firefox
  5. cd dist && zip -r ../kura-extension-firefox.zip .

The resulting kura-extension-firefox.zip must match the submitted artifact.
```

### 7. listed 切替

AMO では unlisted 版を listed に昇格できないため、**listed 用に新しい version を提出**する必要がある。
提出時のチャンネル選択で「Listed on this site」を選ぶこと。

### 8. 審査待ち → 公開

審査期間は数日〜2週間程度。審査中に修正要請が来た場合は、version を `0.1.8` にインクリメントして再提出する。

## 更新リリース手順（listed 化後）

```bash
echo "0.1.8" > VERSION
node scripts/sync-version.mjs
git add -A && git commit -m "release: 0.1.8"
git tag v0.1.8 && git push --tags

just release-extension
just source-bundle-extension
```

AMO ダッシュボードで「新しいバージョンをアップロード」し、以下を更新:

- Release notes（`fastlane/metadata/android/{en-US,ja}/changelogs/<versionCode>.txt` と同じ文面を流用）
- Source code: 新しい `kura-extension-source-<ver>.zip` を提出

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| `just source-bundle-extension` が警告を出す | 未コミットの変更がある。`git status` で確認して commit または stash |
| `web-ext lint` が `MANIFEST_VERSION_INCOMPATIBLE` | `manifest.firefox.json` の `manifest_version: 3` と Firefox 対象バージョンを確認 |
| AMO が「ソースコードが不完全」とリジェクト | バンドルに `Cargo.lock` / `pnpm-lock.yaml` / `assets/public_suffix_list.dat` が入っているか確認 |
| 署名済み xpi がダウンロードできない | `extension/scripts/sign-or-download-firefox.ts` で既存 version の artifacts を取得可能 |

## 関連ファイル

- `extension/manifest.firefox.json` — Firefox 専用 manifest（`browser_specific_settings.gecko.id` を含む）
- `extension/scripts/source-bundle.ts` — ソース提出用 zip 生成
- `extension/scripts/sign-or-download-firefox.ts` — AMO API v5 での署名取得
- `justfile` — `release-extension` / `source-bundle-extension` / `sign-firefox`
- `assets/store/firefox/` — ストア掲載用アイコンと説明文
- `scripts/sync-version.mjs` — `VERSION` → 各 manifest / Cargo.toml / package.json
