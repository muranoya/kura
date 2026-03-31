import { useCallback, useEffect, useState } from 'react'
import { STORAGE_KEYS } from '../../shared/constants'
import { getFromStorage, removeFromStorage, saveToStorage } from '../../shared/storage'
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

export function useOnboardingDraft() {
  const [draft, setDraftState] = useState<OnboardingDraft>(DEFAULT_DRAFT)
  const [draftLoaded, setDraftLoaded] = useState(false)

  // On mount: restore any persisted draft
  useEffect(() => {
    getFromStorage<OnboardingDraft>(STORAGE_KEYS.ONBOARDING_DRAFT).then((saved) => {
      if (saved) {
        setDraftState(saved)
      }
      setDraftLoaded(true)
    })
  }, [])

  // Persist whenever draft values change (but only after initial load)
  useEffect(() => {
    if (!draftLoaded) return
    saveToStorage(STORAGE_KEYS.ONBOARDING_DRAFT, draft)
  }, [draft, draftLoaded])

  const setDraft = useCallback((updates: Partial<OnboardingDraft>) => {
    setDraftState((prev) => ({ ...prev, ...updates }))
  }, [])

  const clearDraft = useCallback(() => {
    return removeFromStorage(STORAGE_KEYS.ONBOARDING_DRAFT)
  }, [])

  return { draft, setDraft, clearDraft, draftLoaded }
}
