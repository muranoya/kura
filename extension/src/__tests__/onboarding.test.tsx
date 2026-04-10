import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MasterPassword from '../popup/screens/onboarding/MasterPassword'
import RecoveryKey from '../popup/screens/onboarding/RecoveryKey'
import StorageSetup from '../popup/screens/onboarding/StorageSetup'
import UnlockExistingVault from '../popup/screens/onboarding/UnlockExistingVault'
import Welcome from '../popup/screens/onboarding/Welcome'

// Mock useTerms hook (imports .md?raw which doesn't work in jsdom)
vi.mock('../popup/hooks/useTerms', () => ({
  useTerms: () => '# 利用規約\nテスト用の利用規約です。',
}))

// Helper: configure chrome.runtime.sendMessage responses by message type
function mockChromeMessages(handlers: Record<string, (msg: Record<string, unknown>) => unknown>) {
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    (message: unknown, callbackOrOptions?: unknown, maybeCallback?: unknown) => {
      const callback =
        typeof callbackOrOptions === 'function'
          ? (callbackOrOptions as (response: unknown) => void)
          : typeof maybeCallback === 'function'
            ? (maybeCallback as (response: unknown) => void)
            : null
      const msg = message as Record<string, unknown>
      const handler = handlers[msg.type as string]
      const response = handler ? handler(msg) : { success: true }
      if (callback) {
        callback(response)
      }
      return Promise.resolve(response)
    },
  )
}

// Helper: render onboarding flow with all routes
function renderOnboarding(
  initialRoute: string | { pathname: string; state?: unknown } = '/',
) {
  const entries = typeof initialRoute === 'string' ? [initialRoute] : [initialRoute]
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/onb/storage" element={<StorageSetup />} />
        <Route path="/onb/password" element={<MasterPassword />} />
        <Route path="/onb/recovery" element={<RecoveryKey />} />
        <Route path="/onb/unlock-existing" element={<UnlockExistingVault />} />
        <Route path="/entries" element={<div>Entries Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// Helper: fill S3 storage form (waits for draft to load first)
async function fillStorageForm(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getByLabelText(/リージョン/)).toBeInTheDocument()
  })
  await user.type(screen.getByLabelText(/リージョン/), 'us-east-1')
  await user.type(screen.getByLabelText(/バケット/), 'kura-test')
  await user.type(screen.getByLabelText(/アクセスキーID/), 'AKIATEST')
  await user.type(screen.getByLabelText(/シークレットアクセスキー/), 'secret123')
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ============================================================================
// Welcome screen
// ============================================================================

describe('Welcome', () => {
  it('should display app title and start button', () => {
    renderOnboarding('/')
    expect(screen.getByText('kura')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '始める' })).toBeInTheDocument()
  })

  it('should navigate to storage setup when terms agreed and start clicked', async () => {
    const user = userEvent.setup()
    renderOnboarding('/')

    // Start button should be disabled before agreeing to terms
    expect(screen.getByRole('button', { name: '始める' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '始める' }))

    await waitFor(() => {
      expect(screen.getByText('ストレージ設定')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// StorageSetup - validation
// ============================================================================

describe('StorageSetup - validation', () => {
  it('should disable next button when required fields are empty', async () => {
    renderOnboarding('/onb/storage')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '次へ' })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled()
  })

  it('should enable next button when form is filled', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await fillStorageForm(user)

    expect(screen.getByRole('button', { name: '次へ' })).toBeEnabled()
  })
})

// ============================================================================
// StorageSetup - S3 connection
// ============================================================================

describe('StorageSetup - S3 connection', () => {
  it('should show error when S3 connection fails', async () => {
    mockChromeMessages({
      DOWNLOAD_VAULT: () => ({ success: false, error: 'Access Denied' }),
    })
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await fillStorageForm(user)
    await user.click(screen.getByRole('button', { name: '次へ' }))

    await waitFor(() => {
      expect(screen.getByText(/Access Denied/)).toBeInTheDocument()
    })
  })

  it('should navigate to master password when no vault exists', async () => {
    mockChromeMessages({
      DOWNLOAD_VAULT: () => ({ success: true, vaultExists: false }),
    })
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await fillStorageForm(user)
    await user.click(screen.getByRole('button', { name: '次へ' }))

    await waitFor(() => {
      expect(screen.getByText('マスターパスワード設定')).toBeInTheDocument()
    })
  })

  it('should navigate to unlock existing vault when vault exists', async () => {
    mockChromeMessages({
      DOWNLOAD_VAULT: () => ({ success: true, vaultExists: true }),
    })
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await fillStorageForm(user)
    await user.click(screen.getByRole('button', { name: '次へ' }))

    await waitFor(() => {
      expect(screen.getByText('既存のVaultを使用')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// MasterPassword - validation
// ============================================================================

describe('MasterPassword - validation', () => {
  it('should show mismatch indicator when passwords differ', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await waitFor(() => {
      expect(screen.getByLabelText(/マスターパスワード$/)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/マスターパスワード$/), 'password-one')
    await user.type(screen.getByLabelText(/パスワード確認/), 'password-two')

    expect(screen.getByText('一致していません')).toBeInTheDocument()
  })

  it('should show match indicator when passwords match', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await waitFor(() => {
      expect(screen.getByLabelText(/マスターパスワード$/)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/マスターパスワード$/), 'test-password-123')
    await user.type(screen.getByLabelText(/パスワード確認/), 'test-password-123')

    expect(screen.getByText('一致しています')).toBeInTheDocument()
  })
})

// ============================================================================
// MasterPassword - vault creation
// ============================================================================

describe('MasterPassword - vault creation', () => {
  it('should create vault and navigate to recovery key', async () => {
    mockChromeMessages({
      CREATE_VAULT: () => ({ success: true, recoveryKey: 'test-recovery-key-abc123' }),
      UNLOCK: () => ({ success: true }),
    })
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await waitFor(() => {
      expect(screen.getByLabelText(/マスターパスワード$/)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/マスターパスワード$/), 'test-password-123')
    await user.type(screen.getByLabelText(/パスワード確認/), 'test-password-123')
    await user.click(screen.getByRole('button', { name: '作成' }))

    await waitFor(() => {
      expect(screen.getByText('あなたのリカバリーキー')).toBeInTheDocument()
      expect(screen.getByText('test-recovery-key-abc123')).toBeInTheDocument()
    })
  })

  it('should show error when vault creation fails', async () => {
    mockChromeMessages({
      CREATE_VAULT: () => ({ success: false, error: 'Vault作成に失敗しました' }),
    })
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await waitFor(() => {
      expect(screen.getByLabelText(/マスターパスワード$/)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/マスターパスワード$/), 'test-password-123')
    await user.type(screen.getByLabelText(/パスワード確認/), 'test-password-123')
    await user.click(screen.getByRole('button', { name: '作成' }))

    await waitFor(() => {
      expect(screen.getByText(/Vault作成に失敗しました/)).toBeInTheDocument()
    })
  })
})

// ============================================================================
// RecoveryKey
// ============================================================================

describe('RecoveryKey', () => {
  it('should display recovery key from location state', () => {
    renderOnboarding({
      pathname: '/onb/recovery',
      state: { recoveryKey: 'test-recovery-key-xyz789' },
    })

    expect(screen.getByText('あなたのリカバリーキー')).toBeInTheDocument()
    expect(screen.getByText('test-recovery-key-xyz789')).toBeInTheDocument()
  })

  it('should navigate to entries on complete when unlocked', async () => {
    mockChromeMessages({
      IS_UNLOCKED: () => ({ unlocked: true }),
    })
    const user = userEvent.setup()
    renderOnboarding({
      pathname: '/onb/recovery',
      state: { recoveryKey: 'test-key', fromOnboarding: true },
    })

    await user.click(screen.getByRole('button', { name: '完了' }))

    await waitFor(() => {
      expect(screen.getByText('Entries Page')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// UnlockExistingVault
// ============================================================================

describe('UnlockExistingVault', () => {
  it('should show error for empty password submission', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/unlock-existing')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'このVaultを使う' })).toBeInTheDocument()
    })

    // The button is disabled when password is empty, so submit via form
    const passwordInput = screen.getByLabelText(/マスターパスワード/)
    await user.click(passwordInput)
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText(/パスワードを入力してください/)).toBeInTheDocument()
    })
  })

  it('should show error when unlock fails', async () => {
    mockChromeMessages({
      UNLOCK_EXISTING: () => ({ success: false, error: 'パスワードが違います' }),
    })
    const user = userEvent.setup()
    renderOnboarding('/onb/unlock-existing')

    await waitFor(() => {
      expect(screen.getByLabelText(/マスターパスワード/)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/マスターパスワード/), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'このVaultを使う' }))

    await waitFor(() => {
      expect(screen.getByText(/パスワードが違います/)).toBeInTheDocument()
    })
  })

  it('should unlock and navigate to entries on correct password', async () => {
    mockChromeMessages({
      UNLOCK_EXISTING: () => ({ success: true }),
    })
    const user = userEvent.setup()
    renderOnboarding('/onb/unlock-existing')

    await waitFor(() => {
      expect(screen.getByLabelText(/マスターパスワード/)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/マスターパスワード/), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'このVaultを使う' }))

    await waitFor(() => {
      expect(screen.getByText('Entries Page')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// Back navigation
// ============================================================================

describe('Back navigation', () => {
  it('should navigate back from master password to storage setup', async () => {
    const user = userEvent.setup()
    // Render with history so back navigation works
    render(
      <MemoryRouter initialEntries={['/onb/storage', '/onb/password']} initialIndex={1}>
        <Routes>
          <Route path="/onb/storage" element={<StorageSetup />} />
          <Route path="/onb/password" element={<MasterPassword />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('マスターパスワード設定')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '戻る' }))

    await waitFor(() => {
      expect(screen.getByText('ストレージ設定')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// Full flow: new vault creation
// ============================================================================

describe('Full onboarding flow - new vault', () => {
  it('should complete the entire new vault creation flow', async () => {
    mockChromeMessages({
      DOWNLOAD_VAULT: () => ({ success: true, vaultExists: false }),
      CREATE_VAULT: () => ({ success: true, recoveryKey: 'recovery-key-full-flow' }),
      UNLOCK: () => ({ success: true }),
      IS_UNLOCKED: () => ({ unlocked: true }),
    })
    const user = userEvent.setup()
    renderOnboarding('/')

    // Step 1: Welcome -> agree to terms -> start
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '始める' }))
    await waitFor(() => {
      expect(screen.getByText('ストレージ設定')).toBeInTheDocument()
    })

    // Step 2: Fill storage form -> next
    await fillStorageForm(user)
    await user.click(screen.getByRole('button', { name: '次へ' }))

    // Step 3: Master password
    await waitFor(() => {
      expect(screen.getByText('マスターパスワード設定')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/マスターパスワード$/), 'my-secure-password')
    await user.type(screen.getByLabelText(/パスワード確認/), 'my-secure-password')
    await user.click(screen.getByRole('button', { name: '作成' }))

    // Step 4: Recovery key
    await waitFor(() => {
      expect(screen.getByText('あなたのリカバリーキー')).toBeInTheDocument()
    })
    expect(screen.getByText('recovery-key-full-flow')).toBeInTheDocument()

    // Step 5: Complete -> entries
    await user.click(screen.getByRole('button', { name: '完了' }))
    await waitFor(() => {
      expect(screen.getByText('Entries Page')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// Full flow: existing vault unlock
// ============================================================================

describe('Full onboarding flow - existing vault', () => {
  it('should complete the existing vault unlock flow', async () => {
    mockChromeMessages({
      DOWNLOAD_VAULT: () => ({ success: true, vaultExists: true }),
      UNLOCK_EXISTING: () => ({ success: true }),
    })
    const user = userEvent.setup()
    renderOnboarding('/')

    // Step 1: Welcome -> agree to terms -> start
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '始める' }))
    await waitFor(() => {
      expect(screen.getByText('ストレージ設定')).toBeInTheDocument()
    })

    // Step 2: Fill storage form -> next
    await fillStorageForm(user)
    await user.click(screen.getByRole('button', { name: '次へ' }))

    // Step 3: Should show unlock existing vault
    await waitFor(() => {
      expect(screen.getByText('既存のVaultを使用')).toBeInTheDocument()
    })

    // Step 4: Enter password and unlock
    await user.type(screen.getByLabelText(/マスターパスワード/), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'このVaultを使う' }))

    // Step 5: Should navigate to entries
    await waitFor(() => {
      expect(screen.getByText('Entries Page')).toBeInTheDocument()
    })
  })
})
