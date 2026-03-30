import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { BottomNav } from './components/BottomNav'
import Welcome from './screens/onboarding/Welcome'
import StorageSetup from './screens/onboarding/StorageSetup'
import MasterPassword from './screens/onboarding/MasterPassword'
import RecoveryKey from './screens/onboarding/RecoveryKey'
import UnlockExistingVault from './screens/onboarding/UnlockExistingVault'
import Lock from './screens/auth/Lock'
import Recovery from './screens/auth/Recovery'
import EntryList from './screens/entries/EntryList'
import EntryDetail from './screens/entries/EntryDetail'
import EntryEdit from './screens/entries/EntryEdit'
import EntryCreate from './screens/entries/EntryCreate'
import PasswordGenerator from './screens/entries/PasswordGenerator'
import Trash from './screens/entries/Trash'
import ConflictResolver from './screens/sync/ConflictResolver'
import LabelManager from './screens/labels/LabelManager'
import Settings from './screens/settings/Settings'

type AppState = 'loading' | 'onboarding' | 'locked' | 'unlocked'

const TAB_ROUTES = ['/entries', '/favorites', '/labels', '/password-generator', '/settings']
const DETAIL_ROUTES = ['/entries/create', '/entries/:id', '/entries/:id/edit', '/trash']

// BottomNav を表示すべきかチェック
function shouldShowBottomNav(pathname: string, appState: AppState): boolean {
  if (appState !== 'unlocked') return false
  // タブルートのみBottomNavを表示
  return TAB_ROUTES.some((route) => route === pathname)
}

function AppContent() {
  const location = useLocation()
  const [appState, setAppState] = useState<AppState>('loading')

  useEffect(() => {
    const checkVaultState = async () => {
      // StorageSetupがfromOnboardingフラグを付けてnavigateした場合、onboarding状態を維持
      if ((location.state as any)?.fromOnboarding === true) {
        console.log('[App] fromOnboarding flag detected, staying in onboarding state')
        setAppState('onboarding')
        return
      }

      // chrome.storage.local から vaultBytes の存在確認
      const result = await new Promise<{ vaultBytes?: string }>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(['vaultBytes'], resolve)
        } else {
          resolve({})
        }
      })

      if (!result.vaultBytes) {
        console.log('[App] No vault found in storage, setting state to onboarding')
        setAppState('onboarding')
        return
      }

      // Service Worker に IS_UNLOCKED メッセージを送信
      console.log('[App] Vault found in storage, checking unlocked state')
      const isUnlocked = await new Promise<boolean>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage(
            { type: 'IS_UNLOCKED' },
            (response: any) => {
              console.log('[App] IS_UNLOCKED response:', response)
              resolve(response?.unlocked ?? false)
            }
          )
        } else {
          resolve(false)
        }
      })

      console.log('[App] Setting appState to:', isUnlocked ? 'unlocked' : 'locked')
      setAppState(isUnlocked ? 'unlocked' : 'locked')
    }

    checkVaultState()
  }, [location.pathname, location.state])

  if (appState === 'loading') {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>読み込み中...</div>
  }

  const showBottomNav = shouldShowBottomNav(location.pathname, appState)

  return (
    <div className="relative w-full" style={{ height: '600px' }}>
      <Routes>
        {/* Onboarding */}
        {appState === 'onboarding' && (
          <>
            <Route path="/" element={<Welcome />} />
            <Route path="/onb/storage" element={<StorageSetup />} />
            <Route path="/onb/unlock-existing" element={<UnlockExistingVault />} />
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
            {/* Tab routes with BottomNav */}
            <Route path="/entries" element={<EntryList />} />
            <Route path="/favorites" element={<EntryList isFavorites />} />
            <Route path="/labels" element={<LabelManager />} />
            <Route path="/password-generator" element={<PasswordGenerator />} />
            <Route path="/settings" element={<Settings />} />

            {/* Detail routes without BottomNav */}
            <Route path="/entries/create" element={<EntryCreate />} />
            <Route path="/entries/:id" element={<EntryDetail />} />
            <Route path="/entries/:id/edit" element={<EntryEdit />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/sync/conflict-resolver" element={<ConflictResolver />} />

            <Route path="*" element={<Navigate to="/entries" replace />} />
          </>
        )}
      </Routes>

      {/* BottomNav */}
      {showBottomNav && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
