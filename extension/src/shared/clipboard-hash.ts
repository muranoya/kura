// クリップボード自動消去で「まだ kura がコピーした値のままか」を判定するためのハッシュ。
// Service Worker はアイドル停止でメモリを失うため、コピーした値はセッションストレージに
// 置く必要がある。平文ではなくこのハッシュだけを置く。

/** SHA-256 の16進表現 */
export async function hashClipboardText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
