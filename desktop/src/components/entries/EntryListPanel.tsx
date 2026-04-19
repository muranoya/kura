import { ArrowUpDown, Search, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { EntryRow, EntryType, SortConfig } from '../../shared/types'
import { EmptyState } from '../layout/EmptyState'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

interface EntryListPanelProps {
  // データ
  entries: EntryRow[]
  loading: boolean
  error: string

  // 空状態テキスト
  emptyTitle: string
  emptyDescription: string
  emptyAction?: React.ReactNode

  // カードのレンダリング（差分部分のみ render prop）
  renderCard: (entry: EntryRow) => React.ReactNode

  // スクロールコンテナのref（スクロール位置復元用）
  scrollRef?: React.RefObject<HTMLDivElement>
}

export default function EntryListPanel({
  entries,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  emptyAction,
  renderCard,
  scrollRef,
}: EntryListPanelProps) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* エラーメッセージ */}
      {error && (
        <div className="p-3">
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        </div>
      )}

      {/* スクロールエリア：エントリリスト */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3">
            <EmptyState
              icon="⏳"
              title={t('entries.panel.loadingTitle')}
              description={t('entries.panel.loadingDescription')}
            />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon="🔑"
              title={emptyTitle}
              description={emptyDescription}
              action={emptyAction}
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.id}>{renderCard(entry)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// フィルターバーコンポーネント（EntryList のヘッダー行で使用）

interface EntryFilterBarProps {
  selectedType: EntryType | undefined
  onTypeChange: (type: EntryType | undefined) => void
  sortConfig: SortConfig
  onSortChange: (config: SortConfig) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onSearchClear: () => void
  actionButton?: React.ReactNode
}

export function EntryFilterBar({
  selectedType,
  onTypeChange,
  sortConfig,
  onSortChange,
  searchQuery,
  onSearchChange,
  onSearchClear,
  actionButton,
}: EntryFilterBarProps) {
  const { t } = useTranslation()
  const sortValue = `${sortConfig.field}:${sortConfig.order}`
  const entryTypes = useMemo(
    () => [
      { value: 'all', label: t('filters.all') },
      { value: 'login', label: t('entryTypes.login') },
      { value: 'bank', label: t('entryTypes.bank') },
      { value: 'ssh_key', label: t('entryTypes.ssh_key') },
      { value: 'secure_note', label: t('entryTypes.secure_note') },
      { value: 'credit_card', label: t('entryTypes.credit_card') },
      { value: 'password', label: t('entryTypes.password') },
      { value: 'software_license', label: t('entryTypes.software_license') },
    ],
    [t],
  )
  const sortOptions = useMemo(
    () => [
      { value: 'created_at:desc', label: t('sortOptions.createdDesc') },
      { value: 'created_at:asc', label: t('sortOptions.createdAsc') },
      { value: 'updated_at:desc', label: t('sortOptions.updatedDesc') },
      { value: 'updated_at:asc', label: t('sortOptions.updatedAsc') },
      { value: 'name:asc', label: t('sortOptions.nameAsc') },
      { value: 'name:desc', label: t('sortOptions.nameDesc') },
    ],
    [t],
  )
  return (
    <div className="flex gap-2">
      <Select
        value={selectedType ?? 'all'}
        onValueChange={(value) => onTypeChange(value === 'all' ? undefined : (value as EntryType))}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t('filters.category')} />
        </SelectTrigger>
        <SelectContent>
          {entryTypes.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 検索ボックス */}
      <div className="relative flex-1">
        <Search
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted"
          size={18}
        />
        <input
          type="text"
          placeholder={t('entries.panel.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-10 py-2 rounded-md border border-border bg-bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={onSearchClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            title={t('common.clearSearch')}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 並び替え */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-bg-surface text-text-primary hover:bg-bg-elevated transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
            title={t('filters.sortBy')}
          >
            <ArrowUpDown size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuRadioGroup
            value={sortValue}
            onValueChange={(value) => {
              const [field, order] = value.split(':') as [SortConfig['field'], SortConfig['order']]
              onSortChange({ field, order })
            }}
          >
            {sortOptions.map((opt) => (
              <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                {opt.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* アクションボタン */}
      {actionButton}
    </div>
  )
}
