import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

interface Settings {
  autolockMinutes: number
  clipboardClearSeconds: number
  clipboardAutoClean: boolean
}

export default function Settings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Settings>({
    autolockMinutes: 5,
    clipboardClearSeconds: 30,
    clipboardAutoClean: true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'GET_SETTINGS' },
          (response) => resolve(response)
        )
      })
      if (response?.success && response.settings) {
        setSettings(response.settings)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'SAVE_SETTINGS', settings },
          (response) => resolve(response)
        )
      })

      if (response?.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        alert(response?.error || '設定の保存に失敗しました')
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleLock = async () => {
    try {
      await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'LOCK' },
          (response) => resolve(response)
        )
      })
      navigate('/')
    } catch (err) {
      alert(String(err))
    }
  }

  const handleChangePassword = () => {
    // For now, just lock the vault
    // Full password change UI would be implemented in a separate screen
    handleLock()
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>設定</h2>

      {saved && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.5rem',
            backgroundColor: '#dcfce7',
            color: '#166534',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          ✓ 設定を保存しました
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.875rem', marginBottom: '1rem', fontWeight: 600 }}>
          セキュリティ
        </h3>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            オートロック時間（分）
          </label>
          <input
            type="number"
            min="1"
            value={settings.autolockMinutes}
            onChange={(e) =>
              setSettings({ ...settings, autolockMinutes: parseInt(e.target.value) || 5 })
            }
            style={{ width: '100%' }}
          />
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#666' }}>
            指定した時間操作がない場合にロックされます
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            クリップボード自動クリア（秒）
          </label>
          <input
            type="number"
            min="5"
            value={settings.clipboardClearSeconds}
            onChange={(e) =>
              setSettings({ ...settings, clipboardClearSeconds: parseInt(e.target.value) || 30 })
            }
            style={{ width: '100%' }}
          />
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#666' }}>
            コピー後、指定した秒数でクリップボードがクリアされます
          </p>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={settings.clipboardAutoClean}
            onChange={(e) =>
              setSettings({ ...settings, clipboardAutoClean: e.target.checked })
            }
          />
          <span style={{ fontSize: '0.875rem' }}>クリップボード自動クリアを有効にする</span>
        </label>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.875rem', marginBottom: '1rem', fontWeight: 600 }}>
          セッション
        </h3>

        <button
          onClick={handleLock}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: '#ea580c',
            color: '#fff',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
            marginBottom: '0.5rem',
          }}
        >
          ロック
        </button>

        <button
          onClick={handleChangePassword}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: '#f3f4f6',
            borderRadius: '0.375rem',
            border: '1px solid #e5e7eb',
            cursor: 'pointer',
          }}
        >
          マスターパスワードを変更
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary"
        style={{
          marginTop: '1.5rem',
          width: '100%',
          opacity: saving ? 0.5 : 1,
        }}
      >
        {saving ? '保存中...' : '保存'}
      </button>

      <button
        onClick={() => navigate('/entries')}
        style={{
          marginTop: '0.5rem',
          width: '100%',
          background: 'none',
          color: '#2563eb',
          fontSize: '0.875rem',
          padding: '0.5rem',
        }}
      >
        戻る
      </button>
    </div>
  )
}
