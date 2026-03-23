import { useEffect, useState, useCallback } from 'react'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { EntryRow } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { EmptyState } from '../../components/layout/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { RotateCw, Trash2 } from 'lucide-react'

export default function Trash() {
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [purgeTargetId, setPurgeTargetId] = useState<string | null>(null)

  useEffect(() => {
    loadTrashEntries()
  }, [])

  const loadTrashEntries = async () => {
    try {
      setLoading(true)
      const data = await commands.listEntries({ includeTrash: true })
      setEntries(data.filter(e => e.deletedAt !== null))
    } catch (err) {
      setError(`ゴミ箱読み込み失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = useCallback(async (id: string) => {
    try {
      await commands.restoreEntry(id)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }
      setEntries(entries.filter(e => e.id !== id))
    } catch (err) {
      setError(`復元失敗: ${err}`)
    }
  }, [entries])

  const handlePurgeConfirmed = useCallback(async () => {
    if (!purgeTargetId) return
    try {
      await commands.purgeEntry(purgeTargetId)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }
      setEntries(entries.filter(e => e.id !== purgeTargetId))
      setPurgeDialogOpen(false)
      setPurgeTargetId(null)
    } catch (err) {
      setError(`完全削除失敗: ${err}`)
    }
  }, [entries, purgeTargetId])

  const handlePurgeClick = (id: string) => {
    setPurgeTargetId(id)
    setPurgeDialogOpen(true)
  }

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary">ゴミ箱</h1>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {error && (
          <div className="mb-3 p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {loading ? (
          <EmptyState icon="⏳" title="読み込み中..." description="ゴミ箱を読み込んでいます" />
        ) : entries.length === 0 ? (
          <EmptyState icon="✓" title="ゴミ箱が空です" description="削除済みエントリはありません" />
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <Card key={entry.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text-primary truncate">{entry.name}</h3>
                    <p className="text-xs text-text-muted mt-1">
                      削除日時: {entry.deletedAt ? new Date(entry.deletedAt * 1000).toLocaleString('ja-JP') : '-'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRestore(entry.id)}
                      className="gap-1"
                    >
                      <RotateCw size={16} />
                      復元
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handlePurgeClick(entry.id)}
                      className="gap-1"
                    >
                      <Trash2 size={16} />
                      削除
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 完全削除確認ダイアログ */}
      <ConfirmDialog
        open={purgeDialogOpen}
        title="完全に削除"
        description="このアイテムは完全に削除されます。この操作は取り消せません。"
        confirmText="削除"
        cancelText="キャンセル"
        isDangerous={true}
        onConfirm={handlePurgeConfirmed}
        onCancel={() => {
          setPurgeDialogOpen(false)
          setPurgeTargetId(null)
        }}
      />
    </div>
  )
}
