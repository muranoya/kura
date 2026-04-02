import { useCallback, useEffect, useRef, useState } from 'react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import * as commands from './commands'
import ErrorBar from './components/layout/ErrorBar'
import Sidebar from './components/Sidebar'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './shared/constants'
import { getFromStorage } from './shared/storage'
import type { AppSettings } from './shared/types'
import { ErrorProvider, usePushError } from './contexts/ErrorContext'
import { SyncProvider, useNotifySynced } from './contexts/SyncContext'
import Lock from './screens/auth/Lock'
import Recovery from './screens/auth/Recovery'
import EntryCreate from './screens/entries/EntryCreate'
import EntryDetail from './screens/entries/EntryDetail'
import EntryEdit from './screens/entries/EntryEdit'
import EntryList from './screens/entries/EntryList'
import LabelEntries from './screens/entries/LabelEntries'
import PasswordGenerator from './screens/entries/PasswordGenerator'
import Trash from './screens/entries/Trash'
import LabelManager from './screens/labels/LabelManager'
import MasterPassword from './screens/onboarding/MasterPassword'
import RecoveryKey from './screens/onboarding/RecoveryKey'
import StorageSetup from './screens/onboarding/StorageSetup'
import UnlockExistingVault from './screens/onboarding/UnlockExistingVault'
import Welcome from './screens/onboarding/Welcome'
import Settings from './screens/settings/Settings'
import ConflictResolver from './screens/sync/ConflictResolver'

type AppState = 'loading' | 'onboarding' | 'locked' | 'unlocked'

function AppContent() {
  const notifySynced = useNotifySynced()
  const pushError = usePushError()
  const [appState, setAppState] = useState<AppState>('loading')
  const [autolockMinutes, setAutolockMinutes] = useState<number>(DEFAULT_SETTINGS.autolockMinutes)
  const autolockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAutolockSettings = useCallback(async () => {
    try {
      const settings = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
      setAutolockMinutes(settings?.autolockMinutes ?? DEFAULT_SETTINGS.autolockMinutes)
    } catch {
      // デフォルト値を使用
    }
  }, [])

  // 設定変更イベントをリッスン
  useEffect(() => {
    const handler = () => loadAutolockSettings()
    window.addEventListener('settings-changed', handler)
    return () => window.removeEventListener('settings-changed', handler)
  }, [loadAutolockSettings])

  // アンロック時に設定を読み込み
  useEffect(() => {
    if (appState === 'unlocked') {
      loadAutolockSettings()
    }
  }, [appState, loadAutolockSettings])

  // 自動ロックタイマー
  useEffect(() => {
    if (appState !== 'unlocked') return
    if (autolockMinutes === 0) return

    const clearTimer = () => {
      if (autolockTimerRef.current) {
        clearTimeout(autolockTimerRef.current)
        autolockTimerRef.current = null
      }
    }

    const performLock = async () => {
      try {
        const vaultBytes = await commands.lock()
        await commands.writeVaultFile(vaultBytes)
        setAppState('locked')
      } catch (err) {
        console.error('Auto-lock failed:', err)
      }
    }

    const handleBlur = () => {
      clearTimer()
      autolockTimerRef.current = setTimeout(performLock, autolockMinutes * 60 * 1000)
    }

    const handleFocus = () => {
      clearTimer()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleBlur()
      } else {
        handleFocus()
      }
    }

    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimer()
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [appState, autolockMinutes])

  useEffect(() => {
    const initApp = async () => {
      try {
        const exists = await commands.vaultFileExists()
        if (!exists) {
          setAppState('onboarding')
          return
        }

        // Check if already unlocked (e.g., after reload)
        const alreadyUnlocked = await commands.isUnlocked()
        if (alreadyUnlocked) {
          setAppState('unlocked')
          return
        }

        // Load vault from file only if not already unlocked
        const bytes = await commands.readVaultFile()
        if (bytes) {
          await commands.loadVault(bytes, '')
        }

        const unlocked = await commands.isUnlocked()
        setAppState(unlocked ? 'unlocked' : 'locked')
      } catch (error) {
        console.error('Failed to initialize app:', error)
        setAppState('onboarding')
      }
    }

    initApp()
  }, [])

  // Set up periodic sync when unlocked
  useEffect(() => {
    if (appState !== 'unlocked') return

    const timer = setInterval(async () => {
      try {
        const synced = await commands.syncVaultIfConfigured()
        if (synced) {
          notifySynced()
        }
      } catch (e) {
        pushError('同期に失敗しました', 'periodic-sync')
      }
    }, 60_000) // 1 minute

    return () => clearInterval(timer)
  }, [appState, notifySynced, pushError])

  if (appState === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-base">
        <div className="text-center">
          <div className="text-lg text-text-primary">読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <MemoryRouter>
      <Routes>
        {/* Onboarding */}
        {appState === 'onboarding' && (
          <>
            <Route path="/" element={<Welcome />} />
            <Route path="/onb/storage" element={<StorageSetup />} />
            <Route path="/onb/password" element={<MasterPassword />} />
            <Route path="/onb/recovery" element={<RecoveryKey />} />
            <Route path="/onb/unlock-existing" element={<UnlockExistingVault />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}

        {/* Auth */}
        {appState === 'locked' && (
          <>
            <Route path="/auth/lock" element={<Lock />} />
            <Route path="/auth/recovery" element={<Recovery />} />
            <Route path="*" element={<Navigate to="/auth/lock" replace />} />
          </>
        )}

        {/* Main App */}
        {appState === 'unlocked' && (
          <Route
            path="*"
            element={
              <div className="flex h-screen bg-bg-base">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-hidden bg-bg-base">
                  <ErrorBar />
                  <div className="flex-1 overflow-auto">
                  <Routes>
                    <Route path="/entries" element={<EntryList />} />
                    <Route path="/favorites" element={<EntryList onlyFavorites={true} />} />
                    <Route path="/entries/create" element={<EntryCreate />} />
                    <Route path="/entries/:id" element={<EntryDetail />} />
                    <Route path="/entries/:id/edit" element={<EntryEdit />} />
                    <Route path="/password-generator" element={<PasswordGenerator />} />
                    <Route path="/trash" element={<Trash />} />
                    <Route path="/sync/conflict-resolver" element={<ConflictResolver />} />
                    <Route path="/labels" element={<LabelManager />} />
                    <Route path="/labels/:labelId/entries" element={<LabelEntries />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/entries" replace />} />
                  </Routes>
                  </div>
                </div>
              </div>
            }
          />
        )}
      </Routes>
    </MemoryRouter>
  )
}

export default function App() {
  return (
    <ErrorProvider>
      <SyncProvider>
        <AppContent />
      </SyncProvider>
    </ErrorProvider>
  )
}
