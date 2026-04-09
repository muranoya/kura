import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import ErrorBar from './components/layout/ErrorBar'
import { ErrorProvider } from './contexts/ErrorContext'
import Lock from './screens/auth/Lock'
import Recovery from './screens/auth/Recovery'
import EntryCreate from './screens/entries/EntryCreate'
import EntryEdit from './screens/entries/EntryEdit'
import EntryList from './screens/entries/EntryList'
import PasswordGenerator from './screens/entries/PasswordGenerator'
import Trash from './screens/entries/Trash'
import LabelManager from './screens/labels/LabelManager'
import MasterPassword from './screens/onboarding/MasterPassword'
import RecoveryKey from './screens/onboarding/RecoveryKey'
import StorageSetup from './screens/onboarding/StorageSetup'
import UnlockExistingVault from './screens/onboarding/UnlockExistingVault'
import Welcome from './screens/onboarding/Welcome'
import DevMode from './screens/settings/DevMode'
import Settings from './screens/settings/Settings'

type AppState = 'loading' | 'onboarding' | 'locked' | 'unlocked'

const TAB_ROUTES = ['/entries', '/password-generator', '/settings']

// BottomNav を表示すべきかチェック
function shouldShowBottomNav(pathname: string, appState: AppState): boolean {
  if (appState !== 'unlocked') return false
  // タブルートのみBottomNavを表示
  return TAB_ROUTES.some((route) => route === pathname)
}

function AppContent() {
  const location = useLocation()
  const [appState, setAppState] = useState<AppState>('loading')

  // ポップアップの接続を維持し、オートロックタイマーを管理
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'popup' })
    return () => port.disconnect()
  }, [])

  useEffect(() => {
    const checkVaultState = async () => {
      // StorageSetupがfromOnboardingフラグを付けてnavigateした場合、onboarding状態を維持
      if ((location.state as { fromOnboarding?: boolean })?.fromOnboarding === true) {
        setAppState('onboarding')
        return
      }

      // chrome.storage.local から vaultBytes の存在確認
      const result = await new Promise<{ vaultBytes?: string }>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(['vaultBytes'], (result) => resolve(result))
        } else {
          resolve({})
        }
      })

      if (!result.vaultBytes) {
        setAppState('onboarding')
        return
      }

      // Service Worker に IS_UNLOCKED メッセージを送信
      const checkUnlocked = (): Promise<boolean> =>
        new Promise<boolean>((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage(
              { type: 'IS_UNLOCKED' },
              (response: { unlocked?: boolean }) => {
                if (chrome.runtime.lastError) {
                  resolve(false)
                  return
                }
                resolve(response?.unlocked ?? false)
              },
            )
          } else {
            resolve(false)
          }
        })

      let isUnlocked = await checkUnlocked()

      // Event Page がまだセッション復元中の可能性があるため、リトライする
      if (!isUnlocked) {
        await new Promise((r) => setTimeout(r, 100))
        isUnlocked = await checkUnlocked()
      }

      setAppState(isUnlocked ? 'unlocked' : 'locked')
    }

    checkVaultState()
  }, [location.state])

  if (appState === 'loading') {
    return (
      <div className="flex items-center justify-center h-full bg-bg-base">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-accent/10 mb-3">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">kura</h1>
          <p className="text-sm text-text-secondary">Vaultを読み込んでいます...</p>
        </div>
      </div>
    )
  }

  const showBottomNav = shouldShowBottomNav(location.pathname, appState)

  return (
    <div className="relative w-full flex flex-col" style={{ height: '504px' }}>
      <ErrorBar />
      <div className="flex-1 overflow-hidden relative">
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
              <Route path="/labels" element={<LabelManager />} />
              <Route path="/password-generator" element={<PasswordGenerator />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/dev-mode" element={<DevMode />} />

              {/* Detail routes without BottomNav */}
              <Route path="/entries/create" element={<EntryCreate />} />
              <Route path="/entries/:id/edit" element={<EntryEdit />} />
              <Route path="/trash" element={<Trash />} />
              <Route path="*" element={<Navigate to="/entries" replace />} />
            </>
          )}
        </Routes>
      </div>

      {/* BottomNav - コンテンツ領域の外に配置 */}
      {showBottomNav && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <ErrorProvider>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </ErrorProvider>
  )
}
