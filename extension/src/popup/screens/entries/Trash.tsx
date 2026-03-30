import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import EntryCard from '../../components/entries/EntryCard'
import { PageHeader } from '../../components/layout/PageHeader'
import { SyncActions } from '../../components/layout/SyncActions'
import { EmptyState } from '../../components/layout/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import * as commands from '../../commands'
import { EntryRow } from '../../shared/types'

export default function Trash() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false)
  const [selectedPurgeId, setSelectedPurgeId] = useState<string | null>(null)

  useEffect(() => {
    loadTrash()
  }, [])

  const loadTrash = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await commands.listTrash()
      setEntries(result)
    } catch (err) {
      setError(String(err) || 'ゴミ箱の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await commands.restoreEntry(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      setError(String(err) || '復元に失敗しました')
    }
  }

  const handlePurgeConfirm = async () => {
    if (!selectedPurgeId) return

    try {
      await commands.purgeEntry(selectedPurgeId)
      setEntries((prev) => prev.filter((e) => e.id !== selectedPurgeId))
      setConfirmPurgeOpen(false)
      setSelectedPurgeId(null)
    } catch (err) {
      setError(String(err) || '削除に失敗しました')
    }
  }

  const openPurgeConfirm = (id: string) => {
    setSelectedPurgeId(id)
    setConfirmPurgeOpen(true)
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="ゴミ箱" showBackButton={false} action={<SyncActions />} />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-danger/10 text-danger text-sm rounded-md">{error}</div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-text-muted">読み込み中...</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            title="ゴミ箱は空です"
            description="削除したアイテムがここに表示されます"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 p-3 bg-bg-elevated rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{entry.name}</p>
                <p className="text-sm text-text-muted mt-0.5">{entry.entryType}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRestore(entry.id)}
                  className="text-sm gap-1 px-2"
                >
                  <RotateCcw size={12} />
                  復元
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openPurgeConfirm(entry.id)}
                  className="text-sm gap-1 px-2"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmPurgeOpen}
        title="完全削除"
        description="このアイテムを完全に削除します。この操作は取り消せません。よろしいですか？"
        confirmText="削除"
        isDangerous={true}
        onConfirm={handlePurgeConfirm}
        onCancel={() => {
          setConfirmPurgeOpen(false)
          setSelectedPurgeId(null)
        }}
      />
    </div>
  )
}
