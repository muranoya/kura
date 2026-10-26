import { useEffect, useState } from 'react'

export interface UseCurrentTabUrlResult {
  url: string | null
  loading: boolean
}

function isMatchableUrl(url: string | undefined): url is string {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * サイドバーを表示しているウィンドウのアクティブタブのURLを返す。
 * サイドバーはタブを切り替えても開いたままなので、タブの切替・遷移に追従する。
 */
export function useCurrentTabUrl(): UseCurrentTabUrlResult {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // 連続したイベントで古い問い合わせ結果が後から上書きしないよう、最新の要求だけを反映する
    let requestSeq = 0

    const refresh = () => {
      const seq = ++requestSeq
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          if (cancelled || seq !== requestSeq) return
          const tabUrl = tabs[0]?.url
          setUrl(isMatchableUrl(tabUrl) ? tabUrl : null)
        })
        .catch(() => {
          if (cancelled || seq !== requestSeq) return
          setUrl(null)
        })
        .finally(() => {
          if (cancelled) return
          setLoading(false)
        })
    }

    const onUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (changeInfo.url && tab.active) refresh()
    }

    refresh()
    chrome.tabs.onActivated.addListener(refresh)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      cancelled = true
      chrome.tabs.onActivated.removeListener(refresh)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])

  return { url, loading }
}
