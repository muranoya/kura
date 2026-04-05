// Service Worker 用 WASM 手動初期化
// vite-plugin-wasm の top-level await を回避するため、
// wasm_bridge_bg.js のバインディングを直接使用し、WASM を fetch で初期化する

import * as bg from '../../wasm/wasm_bridge_bg.js'

// wasm_bridge_bg.js のインポートオブジェクトを構築
function buildImports() {
  const imports: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(bg)) {
    if (key.startsWith('__wbg_') || key.startsWith('__wbindgen_')) {
      imports[key] = value
    }
  }
  return { './wasm_bridge_bg.js': imports }
}

export async function initWasmManual(): Promise<typeof bg> {
  const wasmUrl = chrome.runtime.getURL('wasm/wasm_bridge_bg.wasm')
  const importObject = buildImports()

  const response = await fetch(wasmUrl)
  let instance: WebAssembly.Instance

  if (
    'instantiateStreaming' in WebAssembly &&
    response.headers.get('Content-Type')?.startsWith('application/wasm')
  ) {
    const result = await WebAssembly.instantiateStreaming(response, importObject)
    instance = result.instance
  } else {
    const bytes = await response.arrayBuffer()
    const result = await WebAssembly.instantiate(bytes, importObject)
    instance = result.instance
  }

  bg.__wbg_set_wasm(instance.exports)
  // biome-ignore lint/suspicious/noExplicitAny: WASM exports have dynamic shape
  ;(instance.exports as any).__wbindgen_start()

  return bg
}
