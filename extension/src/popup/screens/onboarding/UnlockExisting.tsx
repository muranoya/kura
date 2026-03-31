import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { getFromStorage } from '../../lib/storage'
import { STORAGE_KEYS } from '../../shared/constants'

export default function UnlockExisting() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    downloadVault()
  }, [])

  const downloadVault = async () => {
    setDownloading(true)
    try {
      console.log('[UnlockExisting] Downloading vault from S3...')
      const s3Config = await getFromStorage(STORAGE_KEYS.S3_CONFIG)
      if (!s3Config) {
        throw new Error('S3設定が見つかりません')
      }

      const configStr = JSON.stringify(s3Config)
      const response = await new Promise<{ success?: boolean; error?: string; result?: unknown }>(
        (resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'DOWNLOAD', storageConfig: configStr }, (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(resp)
            }
          })
        },
      )

      if (!response?.success) {
        throw new Error(response?.error || 'ダウンロードに失敗しました')
      }

      console.log('[UnlockExisting] Vault downloaded successfully')
    } catch (err) {
      console.error('[UnlockExisting] Download error:', err)
      setError(`ダウンロードに失敗しました: ${String(err)}`)
    } finally {
      setDownloading(false)
    }
  }

  const handleUnlock = async () => {
    if (!password) {
      setError('パスワードを入力してください')
      return
    }

    setLoading(true)
    setError(null)
    try {
      console.log('[UnlockExisting] Sending UNLOCK message')
      const response = await new Promise<{ success?: boolean; error?: string; result?: unknown }>(
        (resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'UNLOCK', password: password }, (resp) => {
            console.log('[UnlockExisting] UNLOCK response:', resp)
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(resp)
            }
          })
        },
      )

      if (!response?.success) {
        throw new Error(response?.error || 'アンロックに失敗しました')
      }

      console.log('[UnlockExisting] Vault unlocked successfully')
      navigate('/entries')
    } catch (err) {
      console.error('[UnlockExisting] Unlock error:', err)
      setError(`アンロックに失敗しました: ${String(err)}`)
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="既存Vaultをロード" showBackButton={true} />

      <div className="p-4 space-y-4">
        {/* ダウンロード中 */}
        {downloading && (
          <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
            <p className="text-sm text-text-primary">🔄 S3からVaultをダウンロード中...</p>
          </div>
        )}

        {/* エラーメッセージ */}
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">⚠️ {error}</p>
          </div>
        )}

        {/* マスターパスワード入力 */}
        {!downloading && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">マスターパスワード入力</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-3">
              <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
                <p className="text-sm text-text-primary">
                  📌 このVaultで使用されているマスターパスワードを入力してください。
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">
                  マスターパスワード
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !loading) {
                      handleUnlock()
                    }
                  }}
                  placeholder="マスターパスワードを入力してください"
                  className="text-sm"
                  disabled={loading}
                />
              </div>

              <Button
                onClick={handleUnlock}
                disabled={loading || !password}
                className="w-full text-sm"
                size="sm"
              >
                {loading ? 'アンロック中...' : 'アンロック'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
