import { createContext, useCallback, useContext, useState } from 'react'
import type { OnboardingDraft } from '../../shared/types'

const DEFAULT_DRAFT: OnboardingDraft = {
  storageType: 's3',
  endpoint: '',
  bucket: '',
  region: '',
  key: 'vault.json',
  accessKeyId: '',
  secretAccessKey: '',
}

interface OnboardingDraftContextValue {
  draft: OnboardingDraft
  setDraft: (updates: Partial<OnboardingDraft>) => void
}

const OnboardingDraftContext = createContext<OnboardingDraftContextValue>({
  draft: DEFAULT_DRAFT,
  setDraft: () => {},
})

// S3の認証情報を含むためストレージには保存しない。
// オンボーディングのルートを抜けてアンマウントされるとメモリからも消える
export function OnboardingDraftProvider({
  children,
  initialDraft = DEFAULT_DRAFT,
}: {
  children: React.ReactNode
  initialDraft?: OnboardingDraft
}) {
  const [draft, setDraftState] = useState<OnboardingDraft>(initialDraft)

  const setDraft = useCallback((updates: Partial<OnboardingDraft>) => {
    setDraftState((prev) => ({ ...prev, ...updates }))
  }, [])

  return (
    <OnboardingDraftContext.Provider value={{ draft, setDraft }}>
      {children}
    </OnboardingDraftContext.Provider>
  )
}

export function useOnboardingDraft() {
  return useContext(OnboardingDraftContext)
}

export function isOnboardingDraftComplete(draft: OnboardingDraft): boolean {
  return !!(draft.region && draft.bucket && draft.key && draft.accessKeyId && draft.secretAccessKey)
}
