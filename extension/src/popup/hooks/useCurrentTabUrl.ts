import { useEffect, useState } from 'react'

export interface UseCurrentTabUrlResult {
  url: string | null
  loading: boolean
}

function isMatchableUrl(url: string | undefined): url is string {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

export function useCurrentTabUrl(): UseCurrentTabUrlResult {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (cancelled) return
        const tabUrl = tabs[0]?.url
        setUrl(isMatchableUrl(tabUrl) ? tabUrl : null)
      })
      .catch(() => {
        if (cancelled) return
        setUrl(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { url, loading }
}
