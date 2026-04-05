import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Maximize2,
  Pencil,
  Plus,
  Search,

  Star,
  Trash2,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useLocation, useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { STORAGE_KEYS } from '../../../shared/constants'
import { getFromStorage, removeFromStorage, saveToStorage } from '../../../shared/storage'
import type { Entry, EntryRow, EntryType, SortConfig } from '../../../shared/types'
import * as commands from '../../commands'
import EntryCard, { getTypeLabel } from '../../components/entries/EntryCard'
import EntryListPanel from '../../components/entries/EntryListPanel'
import TotpCustomFieldDisplay from '../../components/entries/TotpCustomFieldDisplay'
import { EmptyState } from '../../components/layout/EmptyState'
import { SyncActions } from '../../components/layout/SyncActions'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { LargeTextDialog } from '../../components/ui/large-text-dialog'
import { markdownComponents } from '../../components/ui/markdown-components'

const DEFAULT_SORT: SortConfig = { field: 'created_at', order: 'desc' }

export default function EntryList() {
  const navigate = useNavigate()
  const location = useLocation()
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // フィルター・検索
  const [selectedType, setSelectedType] = useState<EntryType | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLabelId, setSelectedLabelId] = useState<string | undefined>(undefined)
  const [sortConfig, setSortConfig] = useState<SortConfig>(DEFAULT_SORT)
  const [onlyFavorites, setOnlyFavorites] = useState(false)

  // フィルター・ソート設定をストレージから読み込み
  useEffect(() => {
    getFromStorage<SortConfig>(STORAGE_KEYS.SORT_CONFIG).then((saved) => {
      if (saved) setSortConfig(saved)
    })
    getFromStorage<string>(STORAGE_KEYS.SEARCH_QUERY).then((saved) => {
      if (saved) setSearchQuery(saved)
    })
    getFromStorage<EntryType>(STORAGE_KEYS.ENTRY_TYPE_FILTER).then((saved) => {
      if (saved) setSelectedType(saved)
    })
    getFromStorage<string>(STORAGE_KEYS.LABEL_FILTER).then((saved) => {
      if (saved) setSelectedLabelId(saved)
    })
    getFromStorage<boolean>(STORAGE_KEYS.FAVORITES_FILTER).then((saved) => {
      if (saved) setOnlyFavorites(saved)
    })
  }, [])

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    saveToStorage(STORAGE_KEYS.SEARCH_QUERY, query)
  }

  const handleTypeChange = (type: EntryType | undefined) => {
    setSelectedType(type)
    if (type) {
      saveToStorage(STORAGE_KEYS.ENTRY_TYPE_FILTER, type)
    } else {
      removeFromStorage(STORAGE_KEYS.ENTRY_TYPE_FILTER)
    }
  }

  const handleLabelChange = (labelId: string | undefined) => {
    setSelectedLabelId(labelId)
    if (labelId) {
      saveToStorage(STORAGE_KEYS.LABEL_FILTER, labelId)
    } else {
      removeFromStorage(STORAGE_KEYS.LABEL_FILTER)
    }
  }

  const handleFavoritesChange = (enabled: boolean) => {
    setOnlyFavorites(enabled)
    if (enabled) {
      saveToStorage(STORAGE_KEYS.FAVORITES_FILTER, true)
    } else {
      removeFromStorage(STORAGE_KEYS.FAVORITES_FILTER)
    }
  }

  const handleSortChange = (config: SortConfig) => {
    setSortConfig(config)
    saveToStorage(STORAGE_KEYS.SORT_CONFIG, config)
    // ソート変更時にエントリを再読み込み
    loadEntriesWithSort(config)
  }

  const loadEntriesWithSort = async (sort: SortConfig) => {
    setError(null)
    try {
      const result = await commands.listEntries({
        onlyFavorites,
        labelId: selectedLabelId,
        sortField: sort.field,
        sortOrder: sort.order,
      })
      setEntries(result)
      setLoading(false)
    } catch (err) {
      setError(String(err) || 'Failed to load entries')
      setLoading(false)
    }
  }

  // 詳細ペイン — location state から初期選択IDを取得
  const initialSelectedId = (location.state as { selectedId?: string } | null)?.selectedId ?? null
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)

  // ストレージから選択中アイテムIDを復元（location stateがない場合のみ）
  useEffect(() => {
    if (!initialSelectedId) {
      getFromStorage<string>(STORAGE_KEYS.SELECTED_ENTRY_ID).then((saved) => {
        if (saved) setSelectedId(saved)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectEntry = (id: string | null) => {
    setSelectedId(id)
    if (id) {
      saveToStorage(STORAGE_KEYS.SELECTED_ENTRY_ID, id)
    } else {
      removeFromStorage(STORAGE_KEYS.SELECTED_ENTRY_ID)
    }
  }
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [allLabels, setAllLabels] = useState<Array<{ id: string; name: string }>>([])
  const [unmaskedFields, setUnmaskedFields] = useState<Set<string>>(new Set())
  const toggleFieldMask = (key: string) => {
    setUnmaskedFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // location state の selectedId を消費後クリア
  useEffect(() => {
    if (initialSelectedId) {
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [initialSelectedId, navigate, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // マウント時にラベル一覧を取得（フィルターUI用）
  useEffect(() => {
    commands.listLabels().then(setAllLabels).catch(console.error)
  }, [])

  const loadEntries = useCallback(async () => {
    setError(null)
    try {
      const result = await commands.listEntries({
        onlyFavorites,
        labelId: selectedLabelId,
        sortField: sortConfig.field,
        sortOrder: sortConfig.order,
      })
      setEntries(result)
      setLoading(false)
    } catch (err) {
      setError(String(err) || 'Failed to load entries')
      setLoading(false)
    }
  }, [onlyFavorites, selectedLabelId, sortConfig])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // バックグラウンド自動同期の完了を検知してデータを再読み込み
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEYS.LAST_SYNC_TIME]) {
        loadEntries()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [loadEntries])

  // 詳細ペインを読み込み
  useEffect(() => {
    if (!selectedId) {
      setSelectedEntry(null)
      return
    }

    const loadDetail = async () => {
      setSelectedLoading(true)
      try {
        const entry = await commands.getEntry(selectedId)
        setSelectedEntry(entry)
      } catch (err) {
        console.error('Failed to load entry:', err)
      } finally {
        setSelectedLoading(false)
      }
    }

    loadDetail()
  }, [selectedId])

  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => !selectedType || e.entryType === selectedType)
      .filter((e) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [entries, selectedType, searchQuery])

  const handleDelete = async (id: string) => {
    if (confirm('このエントリを削除しますか？')) {
      try {
        await commands.deleteEntry(id)
        setEntries((prev) => prev.filter((e) => e.id !== id))
        if (selectedId === id) {
          handleSelectEntry(null)
        }
      } catch (err) {
        setError(String(err) || 'Failed to delete entry')
      }
    }
  }

  const handleFavorite = async (id: string, currentFavorite: boolean) => {
    try {
      await commands.setFavorite(id, !currentFavorite)
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, isFavorite: !currentFavorite } : e)),
      )
      if (selectedEntry && selectedEntry.id === id) {
        setSelectedEntry((prev: Entry | null) =>
          prev ? { ...prev, isFavorite: !currentFavorite } : prev,
        )
      }
    } catch (err) {
      setError(String(err) || 'Failed to update favorite')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 全幅 sticky ヘッダー（左右ペインにまたがる） */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        {/* 検索ボックス */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted"
            size={14}
          />
          <input
            type="text"
            placeholder="検索..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-border bg-bg-elevated text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              title="検索をクリア"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 新規追加ボタン */}
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate('/entries/create')}
          className="gap-1 text-sm flex-shrink-0"
        >
          <Plus size={14} />
          新規追加
        </Button>

        {/* 同期ボタン */}
        <SyncActions onSyncComplete={loadEntries} />
      </div>

      {/* 左右分割レイアウト */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左ペイン: リスト */}
        <div className="w-60 border-r border-border bg-sidebar flex flex-col">
          {/* エラーメッセージ */}
          {error && (
            <div className="mx-2 mt-2 p-2 rounded-md bg-danger/10 border border-danger/20">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* リストコンテンツ */}
          <EntryListPanel
            onlyFavorites={onlyFavorites}
            onFavoritesChange={handleFavoritesChange}
            selectedType={selectedType}
            onTypeChange={handleTypeChange}
            labels={allLabels}
            selectedLabelId={selectedLabelId}
            onLabelChange={handleLabelChange}
            sortConfig={sortConfig}
            onSortChange={handleSortChange}
            entries={filteredEntries}
            loading={loading}
            error={error ?? ''}
            emptyTitle={onlyFavorites ? 'お気に入りがありません' : 'アイテムがありません'}
            emptyDescription={
              onlyFavorites
                ? 'お気に入りのアイテムをここに表示します'
                : '新しいアイテムを作成してください'
            }
            renderCard={(entry) => (
              <EntryCard
                variant="normal"
                entry={entry}
                isSelected={selectedId === entry.id}
                onClick={(id) => handleSelectEntry(id)}

              />
            )}
          />
        </div>

        {/* 右ペイン: 詳細 */}
        <div className="flex-1 bg-bg-surface overflow-y-auto">
          {selectedId && selectedEntry ? (
            <EntryDetailPane
              entry={selectedEntry}
              allLabels={allLabels}
              loading={selectedLoading}
              unmaskedFields={unmaskedFields}
              onToggleFieldMask={toggleFieldMask}
              onEdit={() => navigate(`/entries/${selectedId}/edit`)}
              onDelete={() => handleDelete(selectedId)}
              onFavorite={() => handleFavorite(selectedId, selectedEntry.isFavorite)}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState title="アイテムを選択してください" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 詳細ペイン用のコンポーネント
interface EntryDetailPaneProps {
  entry: Entry
  allLabels: Array<{ id: string; name: string }>
  loading: boolean
  unmaskedFields: Set<string>
  onToggleFieldMask: (key: string) => void
  onEdit: () => void
  onDelete: () => void
  onFavorite: () => void
}

function PaneFieldDisplay({
  label,
  value,
  isPassword = false,
  isMasked = false,
  isUrl = false,
  onToggleMask,
}: {
  label: string
  value: string | null | undefined
  isPassword?: boolean
  isMasked?: boolean
  isUrl?: boolean
  onToggleMask?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [largeTextOpen, setLargeTextOpen] = useState(false)
  const isEmpty = !value

  const handleClick = () => {
    if (isEmpty) return
    if (isUrl) {
      chrome.tabs.create({ url: value })
      return
    }
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors border-l-2 ${
        isEmpty ? 'opacity-50 border-transparent' : 'cursor-pointer hover:bg-bg-elevated active:bg-bg-elevated/80 border-transparent'
      } ${copied ? '!bg-accent-subtle !border-accent' : ''}`}
      onClick={handleClick}
      role={isEmpty ? undefined : 'button'}
      tabIndex={isEmpty ? undefined : 0}
      onKeyDown={
        isEmpty
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') handleClick()
            }
      }
    >
      <span className="text-xs text-text-secondary w-20 shrink-0 flex items-center gap-1">
        {label}
        {copied && <Check size={10} className="text-success" />}
      </span>
      <span
        className={`text-sm flex-1 break-all ${
          isEmpty
            ? 'text-text-secondary italic'
            : isPassword && isMasked
              ? 'font-mono text-text-primary tracking-wider'
              : 'font-mono text-text-primary'
        }`}
      >
        {isEmpty ? '未設定' : isPassword && isMasked ? '••••••••' : value}
      </span>
      {!isEmpty && isPassword && onToggleMask && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleMask()
          }}
          className="p-0.5 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          {isMasked ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
      {!isEmpty && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setLargeTextOpen(true)
          }}
          className="p-0.5 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          <Maximize2 size={12} />
        </button>
      )}
      {!isEmpty && isUrl && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="p-0.5 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          {copied ? (
            <span className="text-xs text-success">コピーしました</span>
          ) : (
            <Copy size={13} />
          )}
        </button>
      )}
      {!isEmpty && (
        <LargeTextDialog
          open={largeTextOpen}
          onOpenChange={setLargeTextOpen}
          label={label}
          value={value}
        />
      )}
    </div>
  )
}

function PaneSectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 pt-2 pb-0.5 px-0.5">
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        {children}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EntryDetailPane({
  entry,
  allLabels,
  loading,
  unmaskedFields,
  onToggleFieldMask,
  onEdit,
  onDelete,
  onFavorite,
}: EntryDetailPaneProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted">読み込み中...</div>
      </div>
    )
  }

  const v = entry.typedValue as Record<string, string | null>

  return (
    <div className="p-3">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-text-primary truncate">{entry.name}</h2>
          <Badge variant="muted" className="text-[11px] mt-0.5">
            {getTypeLabel(entry.entryType)}
          </Badge>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onFavorite}
            className="p-1 rounded-md hover:bg-bg-elevated transition-colors"
            title={entry.isFavorite ? 'お気に入り解除' : 'お気に入り'}
          >
            <Star
              size={14}
              className={entry.isFavorite ? 'fill-accent text-accent' : 'text-text-muted'}
            />
          </button>
          <Button size="sm" variant="secondary" onClick={onEdit} className="gap-1 text-xs h-7">
            <Pencil size={12} />
            編集
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} className="gap-1 text-xs h-7">
            <Trash2 size={12} />
            削除
          </Button>
        </div>
      </div>

      {/* ラベル */}
      {entry.labels && entry.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {entry.labels.map((labelId: string) => {
            const label = allLabels.find((l) => l.id === labelId)
            return label ? (
              <Badge key={labelId} variant="primary" className="text-xs">
                {label.name}
              </Badge>
            ) : null
          })}
        </div>
      )}

      {/* ログイン情報 */}
      {entry.entryType === 'login' && (
        <>
          <PaneSectionHeading>ログイン情報</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label="ユーザー名" value={v.username} />
            <PaneFieldDisplay
              label="パスワード"
              value={v.password}
              isPassword
              isMasked={!unmaskedFields.has('password')}
              onToggleMask={() => onToggleFieldMask('password')}
            />
            <PaneFieldDisplay label="URL" value={v.url} isUrl={true} />
          </div>
        </>
      )}

      {/* 銀行口座 */}
      {entry.entryType === 'bank' && (
        <>
          <PaneSectionHeading>銀行口座</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label="銀行名" value={v.bank_name} />
            <PaneFieldDisplay label="支店コード" value={v.branch_code} />
            <PaneFieldDisplay label="口座種別" value={v.account_type} />
            <PaneFieldDisplay label="口座名義" value={v.account_holder} />
            <PaneFieldDisplay label="口座番号" value={v.account_number} />
            <PaneFieldDisplay
              label="PIN"
              value={v.pin}
              isPassword
              isMasked={!unmaskedFields.has('bank-pin')}
              onToggleMask={() => onToggleFieldMask('bank-pin')}
            />
          </div>
        </>
      )}

      {/* SSH キー */}
      {entry.entryType === 'ssh_key' && (
        <>
          <PaneSectionHeading>SSH キー</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label="秘密鍵" value={v.private_key} />
          </div>
        </>
      )}

      {/* セキュアノート */}
      {entry.entryType === 'secure_note' && (
        <>
          <PaneSectionHeading>ノート</PaneSectionHeading>
          {v.content ? (
            <div className="p-2 rounded-md bg-bg-elevated border border-border text-text-primary prose prose-invert max-w-none text-xs mt-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {v.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="px-2 py-1.5 text-sm text-text-secondary italic">未設定</div>
          )}
        </>
      )}

      {/* クレジットカード */}
      {entry.entryType === 'credit_card' && (
        <>
          <PaneSectionHeading>クレジットカード</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label="カード名義" value={v.cardholder} />
            <PaneFieldDisplay
              label="カード番号"
              value={v.number}
              isPassword
              isMasked={!unmaskedFields.has('cc-number')}
              onToggleMask={() => onToggleFieldMask('cc-number')}
            />
            <PaneFieldDisplay label="有効期限" value={v.expiry} />
            <PaneFieldDisplay
              label="CVV"
              value={v.cvv}
              isPassword
              isMasked={!unmaskedFields.has('cvv')}
              onToggleMask={() => onToggleFieldMask('cvv')}
            />
            <PaneFieldDisplay
              label="暗証番号"
              value={v.pin}
              isPassword
              isMasked={!unmaskedFields.has('cc-pin')}
              onToggleMask={() => onToggleFieldMask('cc-pin')}
            />
          </div>
        </>
      )}

      {/* パスワード */}
      {entry.entryType === 'password' && (
        <>
          <PaneSectionHeading>パスワード情報</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label="ユーザー名" value={v.username} />
            <PaneFieldDisplay
              label="パスワード"
              value={v.password}
              isPassword
              isMasked={!unmaskedFields.has('password')}
              onToggleMask={() => onToggleFieldMask('password')}
            />
          </div>
        </>
      )}

      {/* ソフトウェアライセンス */}
      {entry.entryType === 'software_license' && (
        <>
          <PaneSectionHeading>ライセンス情報</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label="ライセンスキー" value={v.license_key} />
          </div>
        </>
      )}

      {/* カスタムフィールド */}
      {entry.customFields && entry.customFields.length > 0 && (
        <div className="space-y-0">
          {entry.customFields.map(
            (field: { id: string; name: string; value: string; fieldType: string }) =>
              field.fieldType === 'totp' ? (
                <TotpCustomFieldDisplay key={field.id} label={field.name} value={field.value} />
              ) : (
                <PaneFieldDisplay
                  key={field.id}
                  label={field.name}
                  value={field.value}
                  isPassword={field.fieldType === 'password'}
                  isMasked={field.fieldType === 'password' && !unmaskedFields.has(field.id)}
                  onToggleMask={
                    field.fieldType === 'password' ? () => onToggleFieldMask(field.id) : undefined
                  }
                />
              ),
          )}
        </div>
      )}

      {/* メモ */}
      {entry.notes && (
        <>
          <PaneSectionHeading>メモ</PaneSectionHeading>
          <div className="p-2 rounded-md bg-bg-elevated border border-border text-text-primary text-xs whitespace-pre-wrap break-words mt-0.5">
            {entry.notes}
          </div>
        </>
      )}

      {/* タイムスタンプ */}
      <div className="mt-4 pt-2 border-t border-border space-y-0.5 text-xs text-text-secondary">
        {entry.updatedAt > 0 && <div>更新: {formatTimestamp(entry.updatedAt)}</div>}
        {entry.createdAt > 0 && <div>作成: {formatTimestamp(entry.createdAt)}</div>}
      </div>
    </div>
  )
}
