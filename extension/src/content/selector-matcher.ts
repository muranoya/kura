// カスタムフィールドのautofillSelectorをページ上のDOM要素にマッチさせる。
// 詳細な設計方針: docs/extension-custom-field-autofill.md 3-5節
//
// CSSセレクタ文字列を組み立てて querySelector する方式は採らない。name/id属性値に
// `"`, `'`, `[`, `]`, `\` 等の特殊文字を含むフォーム（フレームワーク生成のname、
// 例: name="user[account_id]"）が実在し、単純な文字列結合でセレクタ構文を組み立てると
// 壊れたり CSS.escape() の適用漏れで意図しないマッチ・例外が発生しうるため、
// 候補ノードをタグ名で列挙した上で各属性をJS側で直接比較する。

import type { CustomFieldSelector } from '../shared/types'
import { isVisible } from './form-detector'

/**
 * `container` 内から `selector` にマッチする最初の可視要素を探す。
 *
 * - `tag` 未指定時は `input` をデフォルトとする。
 * - `name` / `id` / `type` は指定されている場合のみAND条件で比較し、
 *   未指定属性はワイルドカードとして扱う。
 * - 複数要素がマッチする場合はV1では「最初に見つかった可視要素」を採用する。
 */
export function matchSelector(
  container: HTMLElement,
  selector: CustomFieldSelector,
): HTMLInputElement | null {
  const tag = selector.tag?.toLowerCase() ?? 'input'
  const candidates = container.querySelectorAll<HTMLInputElement>(tag)

  for (const el of candidates) {
    if (selector.name != null && el.getAttribute('name') !== selector.name) continue
    if (selector.id != null && el.getAttribute('id') !== selector.id) continue
    if (selector.type != null && el.getAttribute('type') !== selector.type) continue
    if (!isVisible(el)) continue
    return el
  }
  return null
}
