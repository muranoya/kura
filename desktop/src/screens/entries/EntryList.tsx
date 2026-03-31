import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import EntryCard from '../../components/entries/EntryCard'
import EntryListPanel from '../../components/entries/EntryListPanel'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Button } from '../../components/ui/button'
import { useSyncVersion } from '../../contexts/SyncContext'
import type { EntryRow, EntryType } from '../../shared/types'

interface EntryListProps {
  onlyFavorites?: boolean
  labelId?: string
  labelName?: string
}

export default function EntryList({ onlyFavorites = false, labelId, labelName }: EntryListProps) {
  const navigate = useNavigate()
  const syncVersion = useSyncVersion()
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<EntryType | undefined>(undefined)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadEntries = useCallback(async () => {
    void syncVersion // trigger reload on sync
    try {
      setLoading(true)
      console.log(
        'DEBUG: loadEntries called with onlyFavorites=',
        onlyFavorites,
        'searchQuery=',
        searchQuery,
        'selectedType=',
        selectedType,
        'labelId=',
        labelId,
      )
      const data = await commands.listEntries({
        onlyFavorites,
        searchQuery: searchQuery || undefined,
        type: selectedType,
        labelId,
      })
      console.log(
        'DEBUG: received entries count=',
        data.length,
        'filter onlyFavorites=',
        onlyFavorites,
        'searchQuery=',
        searchQuery,
        'type=',
        selectedType,
        'labelId=',
        labelId,
      )
      setEntries(data)
    } catch (err) {
      setError(`アイテム読み込み失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [onlyFavorites, searchQuery, selectedType, labelId, syncVersion])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)

    // Debounceを使ってタイピング中の過剰なAPI呼び出しを防ぐ
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      // loadEntriesはuseEffectで自動的に呼ばれるので、ここでは何もしない
    }, 300)
  }

  const clearSearch = () => {
    setSearchQuery('')
  }

  const handleFavorite = async (id: string, currentFavorite: boolean) => {
    try {
      await commands.setFavorite(id, !currentFavorite)

      // Save vault to file and sync to S3 (background)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch((e) => console.warn('Sync failed:', e))

      const updated = entries.map((e) => (e.id === id ? { ...e, isFavorite: !currentFavorite } : e))
      setEntries(updated)
    } catch (err) {
      setError(`お気に入り変更失敗: ${err}`)
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteTargetId) return
    try {
      await commands.deleteEntry(deleteTargetId)

      // Save vault to file and sync to S3 (background)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch((e) => console.warn('Sync failed:', e))

      // お気に入りビューで削除された場合、リストから削除する
      setEntries(entries.filter((e) => e.id !== deleteTargetId))
      setDeleteDialogOpen(false)
      setDeleteTargetId(null)
    } catch (err) {
      setError(`削除失敗: ${err}`)
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeleteTargetId(id)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">
          {labelName || (onlyFavorites ? 'お気に入り' : 'アイテム一覧')}
        </h1>
        <SyncHeaderActions />
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
        emptyTitle={onlyFavorites ? 'お気に入りがありません' : 'アイテムがありません'}
        emptyDescription={
          onlyFavorites
            ? 'お気に入りに登録したアイテムがここに表示されます'
            : '新規作成ボタンからアイテムを追加してください'
        }
        emptyAction={
          !onlyFavorites && (
            <Button onClick={() => navigate('/entries/create')}>最初のアイテムを作成</Button>
          )
        }
        actionButton={
          !onlyFavorites && (
            <Button onClick={() => navigate('/entries/create')} size="sm">
              新規作成
            </Button>
          )
        }
        renderCard={(entry) => (
          <EntryCard
            variant="normal"
            entry={entry}
            onClick={(id) => navigate(`/entries/${id}`)}
            onFavorite={handleFavorite}
            onDelete={handleDeleteClick}
          />
        )}
      />

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="アイテムを削除"
        description="このアイテムをゴミ箱に移動します。後から復元できます。"
        confirmText="削除"
        cancelText="キャンセル"
        isDangerous={true}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeleteTargetId(null)
        }}
      />
    </div>
  )
}
