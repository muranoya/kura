import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MasterPassword from '../screens/onboarding/MasterPassword'
import RecoveryKey from '../screens/onboarding/RecoveryKey'
import StorageSetup from '../screens/onboarding/StorageSetup'
import UnlockExistingVault from '../screens/onboarding/UnlockExistingVault'
import Welcome from '../screens/onboarding/Welcome'

// Mock commands module
vi.mock('../commands', () => ({
  createVault: vi.fn(),
  downloadVault: vi.fn(),
  unlock: vi.fn(),
  getVaultBytes: vi.fn(),
  writeVaultFile: vi.fn(),
  syncVaultIfConfigured: vi.fn(),
  vaultFileExists: vi.fn(),
  isUnlocked: vi.fn(),
  readVaultFile: vi.fn(),
  loadVault: vi.fn(),
  encryptConfig: vi.fn(),
  decryptConfig: vi.fn(),
}))

// Mock storage module
vi.mock('../shared/storage', () => ({
  saveToStorage: vi.fn().mockResolvedValue(undefined),
  getFromStorage: vi.fn().mockResolvedValue(undefined),
  removeFromStorage: vi.fn().mockResolvedValue(undefined),
  clearStorage: vi.fn().mockResolvedValue(undefined),
}))

// Import mocked commands
import * as commands from '../commands'

const mockedCommands = vi.mocked(commands)

// Helper: render onboarding flow with all routes
function renderOnboarding(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/onb/storage" element={<StorageSetup />} />
        <Route path="/onb/password" element={<MasterPassword />} />
        <Route path="/onb/recovery" element={<RecoveryKey />} />
        <Route path="/onb/unlock-existing" element={<UnlockExistingVault />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
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

  it('should navigate to storage setup on start', async () => {
    const user = userEvent.setup()
    renderOnboarding('/')

    await user.click(screen.getByRole('button', { name: '始める' }))

    expect(screen.getByText('ストレージ設定')).toBeInTheDocument()
  })
})

// ============================================================================
// StorageSetup - validation
// ============================================================================

describe('StorageSetup - validation', () => {
  it('should show error when required fields are empty', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await user.click(screen.getByRole('button', { name: '次へ' }))

    expect(screen.getByText('すべての必須フィールドを入力してください')).toBeInTheDocument()
  })

  it('should clear error when user types in a field', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await user.click(screen.getByRole('button', { name: '次へ' }))
    expect(screen.getByText('すべての必須フィールドを入力してください')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/リージョン/), 'us-east-1')
    expect(screen.queryByText('すべての必須フィールドを入力してください')).not.toBeInTheDocument()
  })
})

// ============================================================================
// StorageSetup - S3 connection error
// ============================================================================

describe('StorageSetup - S3 connection', () => {
  async function fillStorageForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/リージョン/), 'us-east-1')
    await user.type(screen.getByLabelText(/バケット/), 'kura-test')
    await user.type(screen.getByLabelText(/アクセスキーID/), 'AKIATEST')
    await user.type(screen.getByLabelText(/シークレットアクセスキー/), 'secret123')
  }

  it('should show error when S3 connection fails', async () => {
    mockedCommands.downloadVault.mockRejectedValueOnce(new Error('Access Denied'))
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await fillStorageForm(user)
    await user.click(screen.getByRole('button', { name: '次へ' }))

    await waitFor(() => {
      expect(screen.getByText(/ストレージへのアクセスに失敗しました/)).toBeInTheDocument()
    })
  })

  it('should navigate to master password when no vault exists on S3', async () => {
    mockedCommands.downloadVault.mockResolvedValueOnce(false)
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await fillStorageForm(user)
    await user.click(screen.getByRole('button', { name: '次へ' }))

    await waitFor(() => {
      expect(screen.getByText('マスターパスワード設定')).toBeInTheDocument()
    })
  })

  it('should navigate to unlock existing vault when vault exists on S3', async () => {
    mockedCommands.downloadVault.mockResolvedValueOnce(true)
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
  it('should show error when passwords are empty', async () => {
    // Button is disabled when fields are empty, so we need to fill them first
    // Actually, the button has: disabled={loading || !password || !confirmPassword}
    // So we can't click it when empty. The validation for empty is handled by disabled state.
    renderOnboarding('/onb/password')

    const createBtn = screen.getByRole('button', { name: 'Vaultを作成' })
    expect(createBtn).toBeDisabled()
  })

  it('should show error when password is shorter than 8 characters', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await user.type(screen.getByLabelText(/^パスワード \*/), 'short')
    await user.type(screen.getByLabelText(/パスワード確認/), 'short')
    await user.click(screen.getByRole('button', { name: 'Vaultを作成' }))

    expect(screen.getByText('パスワードは8文字以上である必要があります')).toBeInTheDocument()
  })

  it('should show error when passwords do not match', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await user.type(screen.getByLabelText(/^パスワード \*/), 'password-one-123')
    await user.type(screen.getByLabelText(/パスワード確認/), 'password-two-456')
    await user.click(screen.getByRole('button', { name: 'Vaultを作成' }))

    expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument()
  })

  it('should show match indicator when passwords match', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await user.type(screen.getByLabelText(/^パスワード \*/), 'test-password-123')
    await user.type(screen.getByLabelText(/パスワード確認/), 'test-password-123')

    expect(screen.getByText('パスワードが一致しています')).toBeInTheDocument()
  })
})

// ============================================================================
// MasterPassword - vault creation
// ============================================================================

describe('MasterPassword - vault creation', () => {
  it('should create vault and navigate to recovery key screen', async () => {
    mockedCommands.createVault.mockResolvedValueOnce('test-recovery-key-abc123')
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await user.type(screen.getByLabelText(/^パスワード \*/), 'test-password-123')
    await user.type(screen.getByLabelText(/パスワード確認/), 'test-password-123')
    await user.click(screen.getByRole('button', { name: 'Vaultを作成' }))

    await waitFor(() => {
      expect(screen.getByText('リカバリーキー')).toBeInTheDocument()
    })
    expect(mockedCommands.createVault).toHaveBeenCalledWith('test-password-123')
  })

  it('should show error when createVault fails', async () => {
    mockedCommands.createVault.mockRejectedValueOnce('Internal error')
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await user.type(screen.getByLabelText(/^パスワード \*/), 'test-password-123')
    await user.type(screen.getByLabelText(/パスワード確認/), 'test-password-123')
    await user.click(screen.getByRole('button', { name: 'Vaultを作成' }))

    await waitFor(() => {
      expect(screen.getByText(/エラー/)).toBeInTheDocument()
    })
  })
})

// ============================================================================
// RecoveryKey
// ============================================================================

describe('RecoveryKey', () => {
  beforeEach(() => {
    sessionStorage.setItem('recoveryKey', 'test-recovery-key-xyz789')
  })

  it('should display the recovery key from session storage', () => {
    renderOnboarding('/onb/recovery')

    expect(screen.getByText('あなたのリカバリーキー')).toBeInTheDocument()
    expect(screen.getByText('test-recovery-key-xyz789')).toBeInTheDocument()
  })

  it('should complete onboarding and save vault file', async () => {
    mockedCommands.getVaultBytes.mockResolvedValueOnce([1, 2, 3])
    mockedCommands.writeVaultFile.mockResolvedValueOnce(undefined)

    // Mock window.location.reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    const user = userEvent.setup()
    renderOnboarding('/onb/recovery')

    await user.click(screen.getByRole('button', { name: '完了' }))

    await waitFor(() => {
      expect(mockedCommands.getVaultBytes).toHaveBeenCalled()
      expect(mockedCommands.writeVaultFile).toHaveBeenCalledWith([1, 2, 3])
    })
    expect(sessionStorage.getItem('recoveryKey')).toBeNull()
  })
})

// ============================================================================
// UnlockExistingVault
// ============================================================================

describe('UnlockExistingVault', () => {
  it('should show error for empty password', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/unlock-existing')

    await user.click(screen.getByRole('button', { name: 'このVaultを使う' }))

    expect(screen.getByText('パスワードを入力してください')).toBeInTheDocument()
  })

  it('should show error for wrong password', async () => {
    mockedCommands.unlock.mockRejectedValueOnce(new Error('Bad password'))
    const user = userEvent.setup()
    renderOnboarding('/onb/unlock-existing')

    await user.type(screen.getByLabelText(/マスターパスワード/), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'このVaultを使う' }))

    await waitFor(() => {
      expect(screen.getByText('パスワードが違います')).toBeInTheDocument()
    })
  })

  it('should unlock vault and save file on correct password', async () => {
    mockedCommands.unlock.mockResolvedValueOnce(undefined)
    mockedCommands.getVaultBytes.mockResolvedValueOnce([4, 5, 6])
    mockedCommands.writeVaultFile.mockResolvedValueOnce(undefined)
    mockedCommands.syncVaultIfConfigured.mockResolvedValueOnce(false)

    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    const user = userEvent.setup()
    renderOnboarding('/onb/unlock-existing')

    await user.type(screen.getByLabelText(/マスターパスワード/), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'このVaultを使う' }))

    await waitFor(() => {
      expect(mockedCommands.unlock).toHaveBeenCalledWith('correct-password')
      expect(mockedCommands.getVaultBytes).toHaveBeenCalled()
      expect(mockedCommands.writeVaultFile).toHaveBeenCalledWith([4, 5, 6])
    })
  })
})

// ============================================================================
// Back navigation
// ============================================================================

describe('Back navigation', () => {
  it('should navigate back from storage setup to welcome', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/storage')

    await user.click(screen.getByRole('button', { name: '戻る' }))

    expect(screen.getByText('kura')).toBeInTheDocument()
  })

  it('should navigate back from master password to storage setup', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/password')

    await user.click(screen.getByRole('button', { name: '戻る' }))

    expect(screen.getByText('ストレージ設定')).toBeInTheDocument()
  })

  it('should navigate back from unlock existing to storage setup', async () => {
    const user = userEvent.setup()
    renderOnboarding('/onb/unlock-existing')

    await user.click(screen.getByRole('button', { name: '戻る' }))

    expect(screen.getByText('ストレージ設定')).toBeInTheDocument()
  })
})

// ============================================================================
// Full flow: Welcome -> StorageSetup -> MasterPassword -> RecoveryKey
// ============================================================================

describe('Full onboarding flow - new vault', () => {
  it('should complete the entire new vault creation flow', async () => {
    mockedCommands.downloadVault.mockResolvedValueOnce(false)
    mockedCommands.createVault.mockResolvedValueOnce('recovery-key-full-flow')
    mockedCommands.getVaultBytes.mockResolvedValueOnce([7, 8, 9])
    mockedCommands.writeVaultFile.mockResolvedValueOnce(undefined)

    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    const user = userEvent.setup()
    renderOnboarding('/')

    // Step 1: Welcome -> Start
    await user.click(screen.getByRole('button', { name: '始める' }))
    expect(screen.getByText('ストレージ設定')).toBeInTheDocument()

    // Step 2: Fill storage form
    await user.type(screen.getByLabelText(/リージョン/), 'us-east-1')
    await user.type(screen.getByLabelText(/バケット/), 'my-vault')
    await user.type(screen.getByLabelText(/アクセスキーID/), 'AKIATEST')
    await user.type(screen.getByLabelText(/シークレットアクセスキー/), 'secret')
    await user.click(screen.getByRole('button', { name: '次へ' }))

    // Step 3: Master password
    await waitFor(() => {
      expect(screen.getByText('マスターパスワード設定')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/^パスワード \*/), 'my-secure-password')
    await user.type(screen.getByLabelText(/パスワード確認/), 'my-secure-password')
    await user.click(screen.getByRole('button', { name: 'Vaultを作成' }))

    // Step 4: Recovery key
    await waitFor(() => {
      expect(screen.getByText('あなたのリカバリーキー')).toBeInTheDocument()
    })
    expect(screen.getByText('recovery-key-full-flow')).toBeInTheDocument()

    // Step 5: Complete
    await user.click(screen.getByRole('button', { name: '完了' }))
    await waitFor(() => {
      expect(mockedCommands.writeVaultFile).toHaveBeenCalledWith([7, 8, 9])
    })
  })
})

describe('Full onboarding flow - existing vault', () => {
  it('should complete the existing vault unlock flow', async () => {
    mockedCommands.downloadVault.mockResolvedValueOnce(true)
    mockedCommands.unlock.mockResolvedValueOnce(undefined)
    mockedCommands.getVaultBytes.mockResolvedValueOnce([10, 11, 12])
    mockedCommands.writeVaultFile.mockResolvedValueOnce(undefined)
    mockedCommands.syncVaultIfConfigured.mockResolvedValueOnce(false)

    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    const user = userEvent.setup()
    renderOnboarding('/')

    // Step 1: Welcome -> Start
    await user.click(screen.getByRole('button', { name: '始める' }))

    // Step 2: Fill storage form
    await user.type(screen.getByLabelText(/リージョン/), 'us-east-1')
    await user.type(screen.getByLabelText(/バケット/), 'my-vault')
    await user.type(screen.getByLabelText(/アクセスキーID/), 'AKIATEST')
    await user.type(screen.getByLabelText(/シークレットアクセスキー/), 'secret')
    await user.click(screen.getByRole('button', { name: '次へ' }))

    // Step 3: Should show unlock existing vault (not master password)
    await waitFor(() => {
      expect(screen.getByText('既存のVaultを使用')).toBeInTheDocument()
    })

    // Step 4: Enter password and unlock
    await user.type(screen.getByLabelText(/マスターパスワード/), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'このVaultを使う' }))

    await waitFor(() => {
      expect(mockedCommands.unlock).toHaveBeenCalledWith('correct-password')
      expect(mockedCommands.writeVaultFile).toHaveBeenCalledWith([10, 11, 12])
    })
  })
})
