// サイドバー（Chrome: sidePanel / Firefox: sidebarAction）の開閉制御
//
// Chrome と Firefox でAPIが異なるため、ここで差異を吸収する。
// どちらも「ユーザー操作のハンドラ内で同期的に呼ぶ」ことが要求されるため、
// 呼び出し前に await を挟まないこと。

const LOG_PREFIX = '[SW:sidebar]'

const SIDEBAR_PAGE = 'src/popup/index.html'

/** Firefox の sidebarAction API（@types/chrome に定義がないため最小限を宣言） */
interface FirefoxSidebarAction {
  open(): Promise<void>
  toggle(): Promise<void>
}

function getFirefoxSidebarAction(): FirefoxSidebarAction | undefined {
  const g = globalThis as { browser?: { sidebarAction?: FirefoxSidebarAction } }
  return g.browser?.sidebarAction
}

/** ツールバーアイコンのクリックでサイドバーを開閉するよう設定する */
export function initSidebar() {
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => {
      console.error(LOG_PREFIX, 'setPanelBehavior failed:', e)
    })
    return
  }

  const sidebarAction = getFirefoxSidebarAction()
  if (sidebarAction) {
    chrome.action.onClicked.addListener(() => {
      sidebarAction.toggle().catch((e) => console.error(LOG_PREFIX, 'toggle failed:', e))
    })
  }
}

/**
 * Content Script からの要求でサイドバーを開く（ロック中ドロップダウンのクリック時）。
 *
 * Firefox の sidebarAction.open() はメッセージ経由ではユーザー操作扱いにならず
 * 失敗するため、その場合は同じ画面を小さなウィンドウで開いてアンロックを促す。
 */
export function openSidebar(sender: chrome.runtime.MessageSender): Promise<void> {
  if (chrome.sidePanel) {
    const windowId = sender.tab?.windowId
    if (windowId == null) return Promise.reject(new Error('No window for side panel'))
    return chrome.sidePanel.open({ windowId })
  }

  const sidebarAction = getFirefoxSidebarAction()
  const openWindow = () =>
    chrome.windows
      .create({
        url: chrome.runtime.getURL(SIDEBAR_PAGE),
        type: 'popup',
        width: 400,
        height: 640,
        focused: true,
      })
      .then(() => undefined)
  if (!sidebarAction) return openWindow()
  return sidebarAction.open().catch((e) => {
    console.warn(LOG_PREFIX, 'sidebarAction.open failed, falling back to window:', e)
    return openWindow()
  })
}
