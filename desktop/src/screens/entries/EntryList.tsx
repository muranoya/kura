import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import EntryCard from '../../components/entries/EntryCard'
import EntryDetailContent from '../../components/entries/EntryDetailContent'
import EntryListPanel, { EntryFilterBar } from '../../components/entries/EntryListPanel'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Button } from '../../components/ui/button'
import { useSyncVersion } from '../../contexts/SyncContext'
import { STORAGE_KEYS } from '../../shared/constants'
import { getFromStorage, saveToStorage } from '../../shared/storage'
import type { Entry, EntryRow, EntryType, Label, SortConfig } from '../../shared/types'

const DEFAULT_SORT: SortConfig = { field: 'created_at', order: 'desc' }

// ページ遷移後もスクロール位置を保持するためモジュールレベルで管理
const scrollPositions = new Map<string, number>()

/** エントリリストの内容が実質的に変わったかを判定する */
function entriesChanged(prev: EntryRow[], next: EntryRow[]): boolean {
  if (prev.length !== next.length) return true
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].updatedAt !== next[i].updatedAt || prev[i].isFavorite !== next[i].isFavorite || prev[i].deletedAt !== next[i].deletedAt) return true
  }
  return false
}

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
  const [typeFilterLoaded, setTypeFilterLoaded] = useState(false)
  const [sortConfig, setSortConfig] = useState<SortConfig>(DEFAULT_SORT)
  const [sortLoaded, setSortLoaded] = useState(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollKey = labelId ? `label-${labelId}` : onlyFavorites ? 'favorites' : 'entries'

  // 詳細ペイン用の state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // フィルター設定をストレージから読み込み
  useEffect(() => {
    getFromStorage<EntryType>(STORAGE_KEYS.ENTRY_TYPE_FILTER).then((saved) => {
      if (saved) setSelectedType(saved)
      setTypeFilterLoaded(true)
    })
  }, [])

  // ソート設定をストレージから読み込み
  useEffect(() => {
    getFromStorage<SortConfig>(STORAGE_KEYS.SORT_CONFIG).then((saved) => {
      if (saved) setSortConfig(saved)
      setSortLoaded(true)
    })
  }, [])

  const handleTypeChange = useCallback((type: EntryType | undefined) => {
    setSelectedType(type)
    if (type) {
      saveToStorage(STORAGE_KEYS.ENTRY_TYPE_FILTER, type)
    } else {
      saveToStorage(STORAGE_KEYS.ENTRY_TYPE_FILTER, null)
    }
  }, [])

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config)
    saveToStorage(STORAGE_KEYS.SORT_CONFIG, config)
  }, [])

  const initialLoadDone = useRef(false)

  const loadEntries = useCallback(async () => {
    void syncVersion // trigger reload on sync
    if (!sortLoaded || !typeFilterLoaded) return
    const isInitialLoad = !initialLoadDone.current
    try {
      // 初回のみローディング表示、同期リロード時はバックグラウンドで取得
      if (isInitialLoad) setLoading(true)
      const data = await commands.listEntries({
        onlyFavorites,
        searchQuery: searchQuery || undefined,
        type: selectedType,
        labelId,
        sortField: sortConfig.field,
        sortOrder: sortConfig.order,
      })
      // データが変わった場合のみstateを更新（不要な再描画を防ぐ）
      setEntries((prev: EntryRow[]) => (entriesChanged(prev, data) ? data : prev))
    } catch (err) {
      setError(`アイテム読み込み失敗: ${err}`)
    } finally {
      if (isInitialLoad) {
        setLoading(false)
        initialLoadDone.current = true
      }
    }
  }, [
    onlyFavorites,
    searchQuery,
    selectedType,
    labelId,
    syncVersion,
    sortConfig,
    sortLoaded,
    typeFilterLoaded,
  ])

  useEffect(() => {
    loadEntries().then(() => {
      // エントリ読み込み完了後にスクロール位置を復元
      const saved = scrollPositions.get(scrollKey)
      if (saved != null && scrollRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo(0, saved)
        })
      }
    })
  }, [loadEntries, scrollKey])

  // 選択されたエントリの詳細を読み込み
  useEffect(() => {
    if (!selectedId) {
      setSelectedEntry(null)
      return
    }
    let cancelled = false
    const load = async () => {
      setDetailLoading(true)
      try {
        const [entry, labels] = await Promise.all([
          commands.getEntry(selectedId),
          commands.listLabels(),
        ])
        if (!cancelled) {
          setSelectedEntry(entry)
          setAllLabels(labels)
        }
      } catch (err) {
        console.error('Failed to load entry detail:', err)
        if (!cancelled) {
          setSelectedEntry(null)
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedId])

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

  const saveScrollPosition = () => {
    if (scrollRef.current) {
      scrollPositions.set(scrollKey, scrollRef.current.scrollTop)
    }
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

      // 選択中のエントリの場合、詳細も更新
      if (selectedEntry && selectedEntry.id === id) {
        setSelectedEntry({ ...selectedEntry, isFavorite: !currentFavorite })
      }
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

      setEntries(entries.filter((e) => e.id !== deleteTargetId))

      // 削除したエントリが選択中なら選択解除
      if (selectedId === deleteTargetId) {
        setSelectedId(null)
        setSelectedEntry(null)
      }

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

  const handleDetailDelete = () => {
    if (!selectedId) return
    handleDeleteClick(selectedId)
  }

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 border-b border-border bg-bg-surface shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <h1 className="text-sm font-semibold text-text-primary flex-1">
            {labelName || (onlyFavorites ? 'お気に入り' : 'アイテム一覧')}
          </h1>
          <SyncHeaderActions />
        </div>
        <div className="px-3 pb-2">
          <EntryFilterBar
            selectedType={selectedType}
            onTypeChange={handleTypeChange}
            sortConfig={sortConfig}
            onSortChange={handleSortChange}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onSearchClear={clearSearch}
            actionButton={
              !onlyFavorites && (
                <Button onClick={() => navigate('/entries/create')} size="sm">
                  新規作成
                </Button>
              )
            }
          />
        </div>
      </div>

      {/* 3ペインコンテンツ */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左: アイテムリスト */}
        <div className="w-80 border-r border-border flex flex-col overflow-hidden shrink-0">
          <EntryListPanel
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
            scrollRef={scrollRef}
            renderCard={(entry) => (
              <EntryCard
                variant="normal"
                entry={entry}
                isSelected={selectedId === entry.id}
                onClick={(id) => {
                  saveScrollPosition()
                  setSelectedId(id)
                }}
                onFavorite={handleFavorite}
              />
            )}
          />
        </div>

        {/* 右: 詳細ペイン */}
        <div className="flex-1 overflow-hidden">
          {detailLoading ? (
            <div className="flex items-center justify-center h-full text-text-secondary">
              読み込み中...
            </div>
          ) : selectedEntry ? (
            <EntryDetailContent
              entry={selectedEntry}
              allLabels={allLabels}
              onEdit={() => {
                saveScrollPosition()
                navigate(`/entries/${selectedId}/edit`)
              }}
              onDelete={handleDetailDelete}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-text-secondary">
              アイテムを選択してください
            </div>
          )}
        </div>
      </div>

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
