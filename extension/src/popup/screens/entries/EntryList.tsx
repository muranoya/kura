import {
  Check,
  Copy,
  Crosshair,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { useLocation, useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { STORAGE_KEYS } from '../../../shared/constants'
import { sendMessage } from '../../../shared/messages'
import { getFromStorage, removeFromStorage, saveToStorage } from '../../../shared/storage'
import type { CustomField, Entry, EntryRow, EntryType, SortConfig } from '../../../shared/types'
import { isSecretCustomField } from '../../../shared/types'
import * as commands from '../../commands'
import EntryCard from '../../components/entries/EntryCard'
import { formatSelectorSummary } from '../../components/entries/EntryForm'
import EntryListPanel from '../../components/entries/EntryListPanel'
import PasskeyCustomFieldDisplay from '../../components/entries/PasskeyCustomFieldDisplay'
import TotpCustomFieldDisplay from '../../components/entries/TotpCustomFieldDisplay'
import { EmptyState } from '../../components/layout/EmptyState'
import { SyncActions } from '../../components/layout/SyncActions'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { LargeTextDialog } from '../../components/ui/large-text-dialog'
import { markdownComponents } from '../../components/ui/markdown-components'
import { useCurrentTabUrl } from '../../hooks/useCurrentTabUrl'
import { copySensitive } from '../../lib/clipboard'

const DEFAULT_SORT: SortConfig = { field: 'created_at', order: 'desc' }

export default function EntryList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedType, setSelectedType] = useState<EntryType | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLabelId, setSelectedLabelId] = useState<string | undefined>(undefined)
  const [sortConfig, setSortConfig] = useState<SortConfig>(DEFAULT_SORT)
  const [onlyFavorites, setOnlyFavorites] = useState(false)

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
    loadEntriesWithSort(config)
  }

  const loadEntriesWithSort = async (sort: SortConfig) => {
    setError(null)
    try {
      const result = await commands.listEntries({
        onlyFavorites,
        searchQuery: searchQuery || undefined,
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

  // 作成・編集画面から渡された選択。直後に location.state をクリアするため、マウント時の値で固定する
  // （クリアに追従すると、下の復元処理が保存済みの古い選択で上書きしてしまう）
  const [initialSelectedId] = useState<string | null>(
    () => (location.state as { selectedId?: string } | null)?.selectedId ?? null,
  )
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  // 狭いサイドバー（1カラム）で一覧の下に詳細を表示中か。前回の選択の復元では一覧のみで開き、
  // ユーザーが選択したとき・編集画面から戻ったときだけ詳細を表示する
  const [showDetail, setShowDetail] = useState(initialSelectedId !== null)

  useEffect(() => {
    if (initialSelectedId) {
      saveToStorage(STORAGE_KEYS.SELECTED_ENTRY_ID, initialSelectedId)
      return
    }
    getFromStorage<string>(STORAGE_KEYS.SELECTED_ENTRY_ID).then((saved) => {
      // 読み込みを待つ間にユーザーが選択していれば、そちらを優先する
      if (saved) setSelectedId((prev) => prev ?? saved)
    })
  }, [initialSelectedId])

  const listPaneRef = useRef<HTMLDivElement>(null)

  // 1カラム表示では詳細を開くと一覧が縮むため、選択した行が詳細の裏に隠れないようにする
  useEffect(() => {
    if (!showDetail || !selectedId || loading) return
    listPaneRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [showDetail, selectedId, loading])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setShowDetail(false)
    removeFromStorage(STORAGE_KEYS.SELECTED_ENTRY_ID)
  }, [])

  const handleSelectEntry = (id: string | null) => {
    setSelectedId(id)
    setShowDetail(id !== null)
    if (id) {
      saveToStorage(STORAGE_KEYS.SELECTED_ENTRY_ID, id)
    } else {
      removeFromStorage(STORAGE_KEYS.SELECTED_ENTRY_ID)
    }
  }
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [selectedError, setSelectedError] = useState<string | null>(null)
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

  useEffect(() => {
    if (initialSelectedId) {
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [initialSelectedId, navigate, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    commands.listLabels().then(setAllLabels).catch(console.error)
  }, [])

  const loadEntries = useCallback(async () => {
    setError(null)
    try {
      const result = await commands.listEntries({
        onlyFavorites,
        searchQuery: searchQuery || undefined,
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
  }, [onlyFavorites, searchQuery, selectedLabelId, sortConfig])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // 古い問い合わせの結果が、後から選択したエントリの詳細を上書きしないようにする
  const detailRequestSeqRef = useRef(0)

  const loadDetail = useCallback(
    async (id: string, showLoading: boolean) => {
      const seq = ++detailRequestSeqRef.current
      if (showLoading) setSelectedLoading(true)
      try {
        const entry = await commands.getEntry(id)
        if (seq !== detailRequestSeqRef.current) return
        if (entry.deletedAt) {
          // 他のウィンドウや同期でゴミ箱へ移された
          clearSelection()
          return
        }
        setSelectedEntry(entry)
      } catch (err) {
        if (seq !== detailRequestSeqRef.current) return
        console.error('Failed to load entry:', err)
        if (showLoading) {
          // 選んだエントリが破損している等。前のエントリの内容は残さずエラーを表示する
          setSelectedEntry(null)
          setSelectedError(String(err))
        } else {
          // 表示中に完全に削除された等。別のエントリの内容が残らないよう選択を解除する
          clearSelection()
        }
      } finally {
        if (seq === detailRequestSeqRef.current) setSelectedLoading(false)
      }
    },
    [clearSelection],
  )

  useEffect(() => {
    // マスク解除の状態はフィールド種別のキーで持つため、別のエントリへ持ち越さない
    // （サイドバーは開いたままなので、一度の表示で以降のエントリまで平文になってしまう）
    setUnmaskedFields(new Set())
    setSelectedError(null)
    // 前のエントリの内容を、選び直したエントリのものとして表示しない
    setSelectedEntry(null)
    if (!selectedId) {
      detailRequestSeqRef.current++
      return
    }
    loadDetail(selectedId, true)
  }, [selectedId, loadDetail])

  useEffect(() => {
    // サイドバーは開いたままになるため、同期だけでなくSW側での保存（キャプチャ・
    // 他ウィンドウでの編集等）でも一覧と詳細を更新する
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEYS.LAST_SYNC_TIME] || changes[STORAGE_KEYS.VAULT_BYTES]) {
        loadEntries()
        if (selectedId) loadDetail(selectedId, false)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [loadEntries, loadDetail, selectedId])

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => !selectedType || e.entryType === selectedType)
  }, [entries, selectedType])

  const { url: currentTabUrl } = useCurrentTabUrl()
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!currentTabUrl || entries.length === 0) {
      setMatchedIds(new Set())
      return
    }
    let cancelled = false
    commands
      .listEntryIdsForUrl(currentTabUrl)
      .then((ids) => {
        if (!cancelled) setMatchedIds(new Set(ids))
      })
      .catch(() => {
        if (!cancelled) setMatchedIds(new Set())
      })
    return () => {
      cancelled = true
    }
  }, [currentTabUrl, entries])

  const { matchedEntries, otherEntries } = useMemo(() => {
    if (matchedIds.size === 0) {
      return { matchedEntries: [], otherEntries: filteredEntries }
    }
    const matched: EntryRow[] = []
    const other: EntryRow[] = []
    for (const entry of filteredEntries) {
      if (matchedIds.has(entry.id)) matched.push(entry)
      else other.push(entry)
    }
    return { matchedEntries: matched, otherEntries: other }
  }, [filteredEntries, matchedIds])

  const handleDelete = async (id: string) => {
    if (confirm(t('entries.deleteConfirm'))) {
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
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted"
            size={14}
          />
          <input
            type="text"
            placeholder={t('entries.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-border bg-bg-elevated text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              title={t('entries.searchClear')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            sendMessage({ type: 'AUTOFILL_START_CAPTURE' }).catch(() => {})
          }}
          className="gap-1 text-sm flex-shrink-0"
          title={t('entries.captureCredentials')}
        >
          <Crosshair size={14} />
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate('/entries/create')}
          className="gap-1 text-sm flex-shrink-0"
          title={t('entries.newAddButton')}
        >
          <Plus size={14} />
          <span className="hidden twopane:inline">{t('entries.newAddButton')}</span>
        </Button>

        <SyncActions onSyncComplete={loadEntries} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col twopane:flex-row overflow-hidden">
        <div
          ref={listPaneRef}
          className={`w-full min-h-0 flex flex-col twopane:w-60 twopane:flex-none twopane:border-r border-border bg-sidebar ${
            showDetail ? 'basis-2/5 shrink-0' : 'flex-1'
          }`}
        >
          {error && (
            <div className="mx-2 mt-2 p-2 rounded-md bg-danger/10 border border-danger/20">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

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
            entries={otherEntries}
            loading={loading}
            error={error ?? ''}
            emptyTitle={onlyFavorites ? t('entries.emptyFavoritesTitle') : t('entries.emptyTitle')}
            emptyDescription={
              onlyFavorites ? t('entries.emptyFavoritesDescription') : t('entries.emptyDescription')
            }
            prioritySection={
              matchedEntries.length > 0
                ? { label: t('entries.thisSite'), entries: matchedEntries }
                : undefined
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

        <div
          className={`flex-1 min-h-0 bg-bg-surface overflow-y-auto border-t border-border twopane:border-t-0 ${showDetail ? '' : 'hidden twopane:block'}`}
        >
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
              onClose={() => setShowDetail(false)}
            />
          ) : selectedId && selectedError ? (
            <div className="h-full flex flex-col">
              <div className="p-3 twopane:hidden">
                <button
                  type="button"
                  onClick={() => setShowDetail(false)}
                  className="p-1 -ml-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                  title={t('common.close')}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <EmptyState title={t('entries.detailLoadFailed')} description={selectedError} />
              </div>
            </div>
          ) : selectedId && selectedLoading ? null : (
            <div className="h-full flex items-center justify-center">
              <EmptyState title={t('entries.selectEntry')} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface EntryDetailPaneProps {
  entry: Entry
  allLabels: Array<{ id: string; name: string }>
  loading: boolean
  unmaskedFields: Set<string>
  onToggleFieldMask: (key: string) => void
  onEdit: () => void
  onDelete: () => void
  onFavorite: () => void
  /** 1カラム表示時に詳細を閉じる */
  onClose: () => void
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
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [largeTextOpen, setLargeTextOpen] = useState(false)
  const isEmpty = !value

  const handleClick = () => {
    if (isEmpty) return
    if (isUrl) {
      chrome.tabs.create({ url: value })
      return
    }
    copySensitive(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors border-l-2 ${
        isEmpty
          ? 'opacity-50 border-transparent'
          : 'cursor-pointer hover:bg-bg-elevated active:bg-bg-elevated/80 border-transparent'
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
        {isEmpty ? t('common.notSet') : isPassword && isMasked ? '••••••••' : value}
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
            copySensitive(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="p-0.5 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          {copied ? (
            <span className="text-xs text-success">{t('common.copied')}</span>
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
  onClose,
}: EntryDetailPaneProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted">{t('common.loading')}</div>
      </div>
    )
  }

  const v = entry.typedValue as Record<string, string | null>

  // typedValue のうち secretFieldKeys に含まれるもの（vault 内で秘匿値として保存されている
  // フィールド）をマスク表示する。カスタムフィールドの id と衝突しないよう接頭辞を付ける
  const secretKeys = new Set(entry.secretFieldKeys ?? [])
  const typedField = (key: string, label: string, isUrl = false) => {
    const isSecret = secretKeys.has(key)
    const maskKey = `typed:${key}`
    return (
      <PaneFieldDisplay
        label={label}
        value={v[key]}
        isUrl={isUrl}
        isPassword={isSecret}
        isMasked={isSecret && !unmaskedFields.has(maskKey)}
        onToggleMask={isSecret ? () => onToggleFieldMask(maskKey) : undefined}
      />
    )
  }

  const customFields = entry.customFields ?? []
  const publicCustomFields = customFields.filter((f) => !isSecretCustomField(f))
  const secretCustomFields = customFields.filter((f) => isSecretCustomField(f))

  const renderCustomField = (field: CustomField) => {
    const masked = isSecretCustomField(field)
    return (
      <div key={field.id}>
        {field.fieldType === 'totp' ? (
          <TotpCustomFieldDisplay label={field.name} value={field.value} />
        ) : field.fieldType === 'passkey' ? (
          <PasskeyCustomFieldDisplay
            label={t('entries.customFieldTypes.passkey')}
            value={field.value}
          />
        ) : (
          <PaneFieldDisplay
            label={field.name}
            value={field.value}
            isUrl={field.fieldType === 'url' && !masked}
            isPassword={masked}
            isMasked={masked && !unmaskedFields.has(field.id)}
            onToggleMask={masked ? () => onToggleFieldMask(field.id) : undefined}
          />
        )}
        {field.autofillSelector && (
          <div className="flex items-center gap-1.5 pl-2 pb-1 text-[11px] text-text-muted">
            <Crosshair size={11} className="shrink-0" />
            <span className="truncate font-mono">
              {formatSelectorSummary(field.autofillSelector)}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <button
          type="button"
          onClick={onClose}
          className="twopane:hidden p-1 -ml-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
          title={t('common.close')}
        >
          <X size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-text-primary truncate">{entry.name}</h2>
          <Badge variant="muted" className="text-[11px] mt-0.5">
            {t(`entries.types.${entry.entryType}`, { defaultValue: entry.entryType })}
          </Badge>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onFavorite}
            className="p-1 rounded-md hover:bg-bg-elevated transition-colors"
            title={
              entry.isFavorite ? t('entries.actions.unfavorite') : t('entries.actions.favorite')
            }
          >
            <Star
              size={14}
              className={entry.isFavorite ? 'fill-accent text-accent' : 'text-text-muted'}
            />
          </button>
          <Button size="sm" variant="secondary" onClick={onEdit} className="gap-1 text-xs h-7">
            <Pencil size={12} />
            {t('common.edit')}
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} className="gap-1 text-xs h-7">
            <Trash2 size={12} />
            {t('common.delete')}
          </Button>
        </div>
      </div>

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

      {entry.entryType === 'login' && (
        <>
          <PaneSectionHeading>{t('entries.detail.loginInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            {typedField('username', t('entries.fields.username'))}
            {typedField('password', t('entries.fields.password'))}
            {typedField('url', t('entries.fields.url'), true)}
          </div>
        </>
      )}

      {entry.entryType === 'bank' && (
        <>
          <PaneSectionHeading>{t('entries.detail.bankInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            {typedField('bank_name', t('entries.fields.bankName'))}
            {typedField('branch_code', t('entries.fields.branchCode'))}
            {typedField('account_type', t('entries.fields.accountType'))}
            {typedField('account_holder', t('entries.fields.accountHolder'))}
            {typedField('account_number', t('entries.fields.accountNumber'))}
            {typedField('pin', t('entries.fields.pin'))}
          </div>
        </>
      )}

      {entry.entryType === 'ssh_key' && (
        <>
          <PaneSectionHeading>{t('entries.detail.sshKeyInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            {typedField('private_key', t('entries.fields.privateKey'))}
          </div>
        </>
      )}

      {/* セキュアノートは秘匿値として保存されるが、メモと同様にマスクせず表示する */}
      {entry.entryType === 'secure_note' && (
        <>
          <PaneSectionHeading>{t('entries.detail.noteSection')}</PaneSectionHeading>
          {v.content ? (
            <div className="p-2 rounded-md bg-bg-elevated border border-border text-text-primary prose prose-invert max-w-none text-xs mt-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {v.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="px-2 py-1.5 text-sm text-text-secondary italic">
              {t('common.notSet')}
            </div>
          )}
        </>
      )}

      {entry.entryType === 'credit_card' && (
        <>
          <PaneSectionHeading>{t('entries.detail.creditCardInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            {typedField('cardholder', t('entries.fields.cardholder'))}
            {typedField('number', t('entries.fields.cardNumber'))}
            {typedField('expiry', t('entries.fields.expiry'))}
            {typedField('cvv', t('entries.fields.cvv'))}
            {typedField('pin', t('entries.fields.ccPin'))}
          </div>
        </>
      )}

      {entry.entryType === 'password' && (
        <>
          <PaneSectionHeading>{t('entries.detail.passwordInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            {typedField('username', t('entries.fields.username'))}
            {typedField('password', t('entries.fields.password'))}
          </div>
        </>
      )}

      {entry.entryType === 'software_license' && (
        <>
          <PaneSectionHeading>{t('entries.detail.licenseInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            {typedField('license_key', t('entries.fields.licenseKey'))}
          </div>
        </>
      )}

      {publicCustomFields.length > 0 && (
        <>
          <PaneSectionHeading>{t('entries.detail.customFieldsSection')}</PaneSectionHeading>
          <div className="space-y-0">{publicCustomFields.map(renderCustomField)}</div>
        </>
      )}

      {secretCustomFields.length > 0 && (
        <>
          <PaneSectionHeading>{t('entries.detail.secretCustomFieldsSection')}</PaneSectionHeading>
          <div className="space-y-0">{secretCustomFields.map(renderCustomField)}</div>
        </>
      )}

      {entry.notes && (
        <>
          <PaneSectionHeading>{t('entries.detail.notesSection')}</PaneSectionHeading>
          <div className="p-2 rounded-md bg-bg-elevated border border-border text-text-primary text-xs whitespace-pre-wrap break-words mt-0.5">
            {entry.notes}
          </div>
        </>
      )}

      <div className="mt-4 pt-2 border-t border-border space-y-0.5 text-xs text-text-secondary">
        {entry.updatedAt > 0 && (
          <div>
            {t('entries.detail.updatedAt')}: {formatTimestamp(entry.updatedAt)}
          </div>
        )}
        {entry.createdAt > 0 && (
          <div>
            {t('entries.detail.createdAt')}: {formatTimestamp(entry.createdAt)}
          </div>
        )}
      </div>
    </div>
  )
}
