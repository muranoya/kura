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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { useLocation, useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { STORAGE_KEYS } from '../../../shared/constants'
import { sendMessage } from '../../../shared/messages'
import { getFromStorage, removeFromStorage, saveToStorage } from '../../../shared/storage'
import type { Entry, EntryRow, EntryType, SortConfig } from '../../../shared/types'
import * as commands from '../../commands'
import EntryCard from '../../components/entries/EntryCard'
import EntryListPanel from '../../components/entries/EntryListPanel'
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

  const initialSelectedId = (location.state as { selectedId?: string } | null)?.selectedId ?? null
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)

  useEffect(() => {
    if (!initialSelectedId) {
      getFromStorage<string>(STORAGE_KEYS.SELECTED_ENTRY_ID).then((saved) => {
        if (saved) setSelectedId(saved)
      })
    }
  }, [initialSelectedId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEYS.LAST_SYNC_TIME]) {
        loadEntries()
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [loadEntries])

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
            window.close()
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
        >
          <Plus size={14} />
          {t('entries.newAddButton')}
        </Button>

        <SyncActions onSyncComplete={loadEntries} />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-60 border-r border-border bg-sidebar flex flex-col">
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

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
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
            <PaneFieldDisplay label={t('entries.fields.username')} value={v.username} />
            <PaneFieldDisplay
              label={t('entries.fields.password')}
              value={v.password}
              isPassword
              isMasked={!unmaskedFields.has('password')}
              onToggleMask={() => onToggleFieldMask('password')}
            />
            <PaneFieldDisplay label={t('entries.fields.url')} value={v.url} isUrl={true} />
          </div>
        </>
      )}

      {entry.entryType === 'bank' && (
        <>
          <PaneSectionHeading>{t('entries.detail.bankInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label={t('entries.fields.bankName')} value={v.bank_name} />
            <PaneFieldDisplay label={t('entries.fields.branchCode')} value={v.branch_code} />
            <PaneFieldDisplay label={t('entries.fields.accountType')} value={v.account_type} />
            <PaneFieldDisplay label={t('entries.fields.accountHolder')} value={v.account_holder} />
            <PaneFieldDisplay label={t('entries.fields.accountNumber')} value={v.account_number} />
            <PaneFieldDisplay
              label={t('entries.fields.pin')}
              value={v.pin}
              isPassword
              isMasked={!unmaskedFields.has('bank-pin')}
              onToggleMask={() => onToggleFieldMask('bank-pin')}
            />
          </div>
        </>
      )}

      {entry.entryType === 'ssh_key' && (
        <>
          <PaneSectionHeading>{t('entries.detail.sshKeyInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label={t('entries.fields.privateKey')} value={v.private_key} />
          </div>
        </>
      )}

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
            <PaneFieldDisplay label={t('entries.fields.cardholder')} value={v.cardholder} />
            <PaneFieldDisplay
              label={t('entries.fields.cardNumber')}
              value={v.number}
              isPassword
              isMasked={!unmaskedFields.has('cc-number')}
              onToggleMask={() => onToggleFieldMask('cc-number')}
            />
            <PaneFieldDisplay label={t('entries.fields.expiry')} value={v.expiry} />
            <PaneFieldDisplay
              label={t('entries.fields.cvv')}
              value={v.cvv}
              isPassword
              isMasked={!unmaskedFields.has('cvv')}
              onToggleMask={() => onToggleFieldMask('cvv')}
            />
            <PaneFieldDisplay
              label={t('entries.fields.ccPin')}
              value={v.pin}
              isPassword
              isMasked={!unmaskedFields.has('cc-pin')}
              onToggleMask={() => onToggleFieldMask('cc-pin')}
            />
          </div>
        </>
      )}

      {entry.entryType === 'password' && (
        <>
          <PaneSectionHeading>{t('entries.detail.passwordInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label={t('entries.fields.username')} value={v.username} />
            <PaneFieldDisplay
              label={t('entries.fields.password')}
              value={v.password}
              isPassword
              isMasked={!unmaskedFields.has('password')}
              onToggleMask={() => onToggleFieldMask('password')}
            />
          </div>
        </>
      )}

      {entry.entryType === 'software_license' && (
        <>
          <PaneSectionHeading>{t('entries.detail.licenseInfo')}</PaneSectionHeading>
          <div className="space-y-0">
            <PaneFieldDisplay label={t('entries.fields.licenseKey')} value={v.license_key} />
          </div>
        </>
      )}

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
