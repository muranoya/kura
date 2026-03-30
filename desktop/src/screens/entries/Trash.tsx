import { useEffect, useState, useCallback } from 'react'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { EntryRow, EntryType } from '../../shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import EntryCard from '../../components/entries/EntryCard'
import EntryListPanel from '../../components/entries/EntryListPanel'

export default function Trash() {
  const [allEntries, setAllEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false)
  const [purgeTargetId, setPurgeTargetId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<EntryType | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadTrashEntries()
  }, [])

  const loadTrashEntries = async () => {
    try {
      setLoading(true)
      const data = await commands.listEntries({ includeTrash: true })
      setAllEntries(data.filter(e => e.deletedAt !== null))
    } catch (err) {
      setError(`ゴミ箱読み込み失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const filterEntries = () => {
    let filtered = allEntries

    // 削除済みエントリのみ
    filtered = filtered.filter(e => e.deletedAt !== null)

    // タイプフィルター
    if (selectedType) {
      filtered = filtered.filter(e => e.entryType === selectedType)
    }

    // 検索フィルター（名前で検索）
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(e => e.name.toLowerCase().includes(query))
    }

    return filtered
  }

  const entries = filterEntries()

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
  }

  const clearSearch = () => {
    setSearchQuery('')
  }

  const handleRestore = useCallback(async (id: string) => {
    try {
      await commands.restoreEntry(id)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch(e => console.warn('Sync failed:', e))
      setAllEntries(allEntries.filter(e => e.id !== id))
    } catch (err) {
      setError(`復元失敗: ${err}`)
    }
  }, [allEntries])

  const handlePurgeConfirmed = useCallback(async () => {
    if (!purgeTargetId) return
    try {
      await commands.purgeEntry(purgeTargetId)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVaultAndTrack(JSON.stringify(s3Config))
      }
      setAllEntries(allEntries.filter(e => e.id !== purgeTargetId))
      setPurgeDialogOpen(false)
      setPurgeTargetId(null)
    } catch (err) {
      setError(`完全削除失敗: ${err}`)
    }
  }, [allEntries, purgeTargetId])

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

      <EntryListPanel
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchClear={clearSearch}
        entries={entries}
        loading={loading}
        error={error}
        emptyTitle="ゴミ箱が空です"
        emptyDescription="削除済みエントリはありません"
        renderCard={(entry) => (
          <EntryCard
            variant="trash"
            entry={entry}
            onRestore={handleRestore}
            onPurge={handlePurgeClick}
          />
        )}
      />

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
