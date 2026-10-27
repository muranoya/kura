<!-- doc-status: implemented -->

# コンフリクト自動解消アルゴリズム（Tombstone + LWW）

## 概要

複数デバイスからの同時編集によるコンフリクトを、ユーザー選択なしに自動解消する仕組み。

Last-Write-Wins（LWW）とtombstone戦略により、以下を実現：
- アイテムの削除は物理削除ではなくtombstone化（`purged_at`フィールド設定）
- 同一IDのアイテムが両方に存在する場合は`updated_at`の新しい方を採用
- 削除状態の優先度により、不可逆削除の上書きを防止

---

## 基本原則

1. **Tombstone化**: アイテムのpurge（完全削除）は、HashMapからの物理削除ではなく`purged_at`タイムスタンプを設定して行う。センシティブデータは空にされる
2. **LWW**: 同一IDのアイテムが両方に存在する場合は`updated_at`が新しい方を採用
3. **新規追加**: 同一IDのアイテムが片方にしかない場合は「新規追加」として扱い、自動取込

---

## コンフリクトケース網羅表

### 定義

- 「存在する」= HashMapにkeyがある（状態問わず）
- 「存在しない」= HashMapにkeyが一切ない（GC済みtombstoneも含む）

### ケース B-1〜B-6: 片側のみ存在

| ケース | ローカル | リモート | 解消方法 |
|--------|---------|---------|---------|
| B-1 | active | 存在しない | **ローカル採用**（ローカル新規追加） |
| B-2 | soft-deleted | 存在しない | **ローカル採用** |
| B-3 | purged | 存在しない | **ローカル採用**（tombstone伝播） |
| B-4 | 存在しない | active | **リモート採用**（リモート新規追加） |
| B-5 | 存在しない | soft-deleted | **リモート採用** |
| B-6 | 存在しない | purged | **リモート採用**（tombstone伝播） |

### ケース C-1〜C-4: 両方active

| ケース | ローカル | リモート | updated_at | 解消方法 |
|--------|---------|---------|-----------|---------|
| C-1 | active | active | ローカルが新しい | **LWW → ローカル採用** |
| C-2 | active | active | リモートが新しい | **LWW → リモート採用** |
| C-3 | active | active | 同じ・内容同じ | 変更なし |
| C-4 | active | active | 同じ・内容違う | **リモート採用**（クロックずれは稀） |

### ケース D-1〜D-18: active/soft-deleted/purgedの混合

#### active vs soft-deleted

| ケース | ローカル | リモート | updated_at | 解消方法 |
|--------|---------|---------|-----------|---------|
| D-1 | active | soft-deleted | ローカルが新しい | **LWW → ローカル（active）採用** |
| D-2 | active | soft-deleted | リモートが新しい | **LWW → リモート（soft-deleted）採用** |
| D-3 | active | soft-deleted | 同じ | **soft-deleted優先** |
| D-4 | soft-deleted | active | ローカルが新しい | **LWW → ローカル（soft-deleted）採用** |
| D-5 | soft-deleted | active | リモートが新しい | **LWW → リモート（active）採用** |
| D-6 | soft-deleted | active | 同じ | **soft-deleted優先** |

#### active vs purged

| ケース | ローカル | リモート | updated_at | 解消方法 |
|--------|---------|---------|-----------|---------|
| D-7 | active | purged | ローカルが新しい | **ローカル（active）採用**（purge後に復元・再編集） |
| D-8 | active | purged | リモートが新しい | **LWW → リモート（purged）採用** |
| D-9 | active | purged | 同じ | **purged優先** |
| D-10 | purged | active | ローカルが新しい | **LWW → ローカル（purged）採用** |
| D-11 | purged | active | リモートが新しい | **リモート（active）採用**（purge後に復元・再編集） |
| D-12 | purged | active | 同じ | **purged優先** |

#### soft-deleted vs purged

| ケース | ローカル | リモート | updated_at | 解消方法 |
|--------|---------|---------|-----------|---------|
| D-13 | soft-deleted（新） | purged（古） | ローカルが新しい | **ローカル（soft-deleted）採用**（後からpurge可能・不可逆操作を優先しない） |
| D-14 | soft-deleted | purged（新） | リモートが新しい | **LWW → purged採用** |
| D-15 | soft-deleted | purged | 同じ | **purged優先** |
| D-16 | purged（新） | soft-deleted | ローカルが新しい | **LWW → purged採用** |
| D-17 | purged（古） | soft-deleted（新） | リモートが新しい | **リモート（soft-deleted）採用**（D-13と同様） |
| D-18 | purged | soft-deleted | 同じ | **purged優先** |

---

## Tie-breaking ルール

`updated_at`が同じで状態が違う場合の優先度：

```
purged > soft-deleted > active
```

削除側を安全側とすることで、誤った復元を防止。

**例外**: D-13/D-17のパターン
- D-13: soft-deleted の方がpurgedより新しい場合 → soft-deletedを優先（後からpurge可能）
- D-17: purged（古） vs soft-deleted（新） → soft-deletedを優先（新しい編集を尊重）

これにより「purge後に復元して再編集」という操作シーケンスが正しく扱われる。

---

## Tombstone のGC（Garbage Collection）

### 目的

purge済みtombstoneは永続保持するとvault.jsonが肥大化するため、一定期間後に自動削除する。

### 実装

- **保持期間**: `GC_RETENTION_DAYS = 180`日（プログラム定数、vault.jsonには含めない）
- **実行タイミング**: 同期成功後、`auto_merge`内で毎回実行
- **対象**:
  - `purged_at`が180日より前のtombstoneアイテム
  - `deleted_at`が180日より前のtombstoneラベル

### トレードオフ

**許容済み**:
- 180日以上未同期のデバイスでは、GC済みtombstoneに対応するアイテムが「新規追加」として誤って再出現する可能性がある（**false resurrection**）
- サーバなし設計における既知の制限として受け入れる（通常のユースケースでは問題にならない）

---

## マージの対象と secret ブロックの扱い（schema_version 2）

vault.json は index（全エントリの非秘匿値）と、エントリごとの secret ブロックに分かれている（`docs/vault-format-v2.md`）。上記の判定ロジック（B / C / D ケース、tie-breaking、GC）は index の行に対して適用し、secret は一切復号しない。

1. リモートの vault.json から **index だけを復号**する（リモートが schema_version 1 の場合は、同じ DEK で一括復号して v2 の構造に変換してからマージする）
2. index 同士をエントリ単位・ラベル単位にマージする。`auto_merge` はエントリごとに採用した側（`MergeSide::Local` / `MergeSide::Remote`）を返す
3. 各エントリについて、**採用した側の secret ブロックを暗号文のまま使う**。採用した側でブロックが欠けていれば、もう一方の同じ `secret_rev` のブロックを使う。index 行の `secret_rev` は secret の AAD に含まれるため、行と secret の組み合わせを取り違えても復号失敗（破損エントリ）として検出できる
4. GC で削除されたエントリ、purged エントリ、index に行がない孤立ブロックの secret は削除する
5. トップレベルの未知フィールド（新しいクライアントが追加したもの）はリモートの値で置き換える。このクライアントは書き換えないので、ローカルの値は古い複製にすぎないため
6. `meta`（ラップ済み DEK・Argon2 パラメータ）は master / recovery のスロットごとに `*_updated_at` による LWW でマージする（時刻が同じなら暗号文の比較で決める）。別の端末でのマスターパスワード変更等を、古いセッションの端末が巻き戻さないようにするため。平文の meta は改ざんできるので、リモートの index にある `meta_digest` と一致するスロットだけを採用する（`docs/vault-format-v2.md` 7章）
7. index を再暗号化して Conditional Write で push する

- 2 台で同じエントリを同時に編集した場合でも、`secret_rev` はランダム値なので両者の secret は区別され、採用した側の index 行と secret が組のまま残る
- secret ブロックが欠けている・復号できないエントリは、vault 全体のエラーにはせずそのエントリだけを破損として扱い、暗号文はそのまま保持して書き戻す（`VaultError::CorruptedEntry`）

実装: `vault-core/src/sync/mod.rs`（`auto_merge`）、`vault-core/src/vault/state.rs`（`UnlockedVault::merge_remote`）

---

## 実装上の注意

### Labelの削除

ラベルは「ゴミ箱なし」設計。削除 = 即tombstoneとなり、`deleted_at`フィールドを設定。

### Orphaned Label Refs

同期時に、削除済みラベルへの参照をエントリから除去する（`cleanup_orphaned_label_refs`）。

### Conditional Write再試行

Conditional Write（If-Match）で412エラー（データレース検出）が返った場合、上記のマージロジックをリトライする（回数上限あり）。
