import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  WebauthnRitualContext,
  WebauthnRitualDecision,
} from '../../../shared/webauthn-messages'
import CreateConfirm from './CreateConfirm'
import SelectCredential from './SelectCredential'

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

  useEffect(() => {
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
