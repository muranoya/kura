import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  WebauthnRitualContext,
  WebauthnRitualContextUpdated,
  WebauthnRitualDecision,
} from '../../../shared/webauthn-messages'
import CreateConfirm from './CreateConfirm'
import SelectCredential from './SelectCredential'
import UnlockRitual from './UnlockRitual'

function getRequestId(): string | null {
  return new URLSearchParams(window.location.search).get('requestId')
}

function sendDecision(decision: WebauthnRitualDecision) {
  chrome.runtime.sendMessage(decision, () => {
    // レスポンスは関知しない（背景側でチェックされる）。lastErrorの読み捨てのみ行う。
    void chrome.runtime.lastError
  })
}

export default function WebauthnRitualApp() {
  const { t } = useTranslation()
  const [requestId] = useState(getRequestId)
  const [context, setContext] = useState<WebauthnRitualContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchContext = useCallback(() => {
    if (!requestId) {
      setError(t('webauthn.ritual.invalidRequest'))
      return
    }
    chrome.runtime.sendMessage(
      { type: 'WEBAUTHN_RITUAL_GET_CONTEXT', requestId },
      (response: { success: boolean; context?: WebauthnRitualContext; error?: string }) => {
        if (chrome.runtime.lastError || !response?.success || !response.context) {
          setError(response?.error || t('webauthn.ritual.invalidRequest'))
          return
        }
        setContext(response.context)
      },
    )
  }, [requestId, t])

  useEffect(fetchContext, [fetchContext])

  // 'locked' context待機中、このウィンドウ以外の経路（メインpopup等）でアンロックされた
  // 場合にも、確認/選択画面へ進めるようcontextを取り直す。
  useEffect(() => {
    if (!requestId) return
    const listener = (message: WebauthnRitualContextUpdated) => {
      if (message?.type === 'WEBAUTHN_RITUAL_CONTEXT_UPDATED' && message.requestId === requestId) {
        fetchContext()
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [requestId, fetchContext])

  const cancel = () => {
    if (!requestId) return
    sendDecision({ type: 'WEBAUTHN_RITUAL_DECISION', requestId, cancelled: true })
    window.close()
  }

  if (!requestId || error) {
    return (
      <div className="p-6 text-sm text-text-secondary bg-bg-base min-h-screen">
        {error || t('webauthn.ritual.invalidRequest')}
      </div>
    )
  }

  if (!context) {
    return (
      <div className="p-6 text-sm text-text-muted bg-bg-base min-h-screen">
        {t('common.loading')}
      </div>
    )
  }

  if (context.kind === 'locked') {
    return <UnlockRitual onUnlocked={fetchContext} onCancel={cancel} />
  }

  if (context.kind === 'error') {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col p-4 gap-3">
        <p className="text-sm text-danger flex-1">{context.message}</p>
        <button
          type="button"
          onClick={cancel}
          className="text-sm text-center py-2 rounded-md border border-border bg-bg-surface hover:border-accent/50 transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
    )
  }

  if (context.kind === 'get') {
    return (
      <SelectCredential
        context={context}
        onConfirm={(credentialId) => {
          sendDecision({
            type: 'WEBAUTHN_RITUAL_DECISION',
            requestId,
            cancelled: false,
            credentialId,
          })
          window.close()
        }}
        onCancel={cancel}
      />
    )
  }

  return (
    <CreateConfirm
      context={context}
      onConfirm={(entryId) => {
        sendDecision({ type: 'WEBAUTHN_RITUAL_DECISION', requestId, cancelled: false, entryId })
        window.close()
      }}
      onCancel={cancel}
    />
  )
}
