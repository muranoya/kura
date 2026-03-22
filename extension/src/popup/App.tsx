import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Welcome from './screens/onboarding/Welcome'
import StorageSetup from './screens/onboarding/StorageSetup'
import MasterPassword from './screens/onboarding/MasterPassword'
import RecoveryKey from './screens/onboarding/RecoveryKey'
import Lock from './screens/auth/Lock'
import Recovery from './screens/auth/Recovery'
import EntryList from './screens/entries/EntryList'
import EntryDetail from './screens/entries/EntryDetail'
import EntryEdit from './screens/entries/EntryEdit'
import EntryCreate from './screens/entries/EntryCreate'
import Trash from './screens/entries/Trash'
import SyncStatus from './screens/sync/SyncStatus'
import ConflictResolver from './screens/sync/ConflictResolver'
import LabelManager from './screens/labels/LabelManager'
import Settings from './screens/settings/Settings'

type AppState = 'loading' | 'onboarding' | 'locked' | 'unlocked'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')

  useEffect(() => {
    const checkVaultState = async () => {
      // chrome.storage.local から vaultBytes の存在確認
      const result = await new Promise<{ vaultBytes?: string }>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(['vaultBytes'], resolve)
        } else {
          resolve({})
        }
      })

      if (!result.vaultBytes) {
        setAppState('onboarding')
        return
      }

      // Service Worker に IS_UNLOCKED メッセージを送信
      const isUnlocked = await new Promise<boolean>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage(
            { type: 'IS_UNLOCKED' },
            (response: any) => {
              resolve(response?.unlocked ?? false)
            }
          )
        } else {
          resolve(false)
        }
      })

      setAppState(isUnlocked ? 'unlocked' : 'locked')
    }

    checkVaultState()
  }, [])

  if (appState === 'loading') {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
  }

  return (
    <HashRouter>
      <Routes>
        {/* Onboarding */}
        {appState === 'onboarding' && (
          <>
            <Route path="/" element={<Welcome />} />
            <Route path="/onb/storage" element={<StorageSetup />} />
            <Route path="/onb/password" element={<MasterPassword />} />
            <Route path="/onb/recovery" element={<RecoveryKey />} />
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
          <>
            <Route path="/entries" element={<EntryList />} />
            <Route path="/entries/create" element={<EntryCreate />} />
            <Route path="/entries/:id" element={<EntryDetail />} />
            <Route path="/entries/:id/edit" element={<EntryEdit />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/sync" element={<SyncStatus />} />
            <Route path="/sync/conflict-resolver" element={<ConflictResolver />} />
            <Route path="/labels" element={<LabelManager />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/entries" replace />} />
          </>
        )}
      </Routes>
    </HashRouter>
  )
}
