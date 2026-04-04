import { ArrowUpDown, Search, X } from 'lucide-react'
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
  // フィルター
  selectedType: EntryType | undefined
  onTypeChange: (type: EntryType | undefined) => void

  // 並び替え
  sortConfig: SortConfig
  onSortChange: (config: SortConfig) => void

  // 検索
  searchQuery: string
  onSearchChange: (query: string) => void
  onSearchClear: () => void

  // データ
  entries: EntryRow[]
  loading: boolean
  error: string

  // 空状態テキスト
  emptyTitle: string
  emptyDescription: string
  emptyAction?: React.ReactNode

  // アクションボタン（フィルターバー右端に表示）
  actionButton?: React.ReactNode

  // カードのレンダリング（差分部分のみ render prop）
  renderCard: (entry: EntryRow) => React.ReactNode

  // スクロールコンテナのref（スクロール位置復元用）
  scrollRef?: React.RefObject<HTMLDivElement>
}

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'created_at:desc', label: '作成日（新しい順）' },
  { value: 'created_at:asc', label: '作成日（古い順）' },
  { value: 'updated_at:desc', label: '更新日（新しい順）' },
  { value: 'updated_at:asc', label: '更新日（古い順）' },
  { value: 'name:asc', label: '名前（A → Z）' },
  { value: 'name:desc', label: '名前（Z → A）' },
]

const ENTRY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'login', label: 'ログイン' },
  { value: 'bank', label: '銀行口座' },
  { value: 'ssh_key', label: 'SSH キー' },
  { value: 'secure_note', label: 'セキュアノート' },
  { value: 'credit_card', label: 'クレジットカード' },
]

export default function EntryListPanel({
  selectedType,
  onTypeChange,
  sortConfig,
  onSortChange,
  searchQuery,
  onSearchChange,
  onSearchClear,
  entries,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  emptyAction,
  actionButton,
  renderCard,
  scrollRef,
}: EntryListPanelProps) {
  const sortValue = `${sortConfig.field}:${sortConfig.order}`
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 固定エリア：フィルターバー + エラーメッセージ */}
      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <Select
            value={selectedType ?? 'all'}
            onValueChange={(value) =>
              onTypeChange(value === 'all' ? undefined : (value as EntryType))
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              {ENTRY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
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
              placeholder="名前、メモ、カスタムフィールド名で検索..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-10 py-2 rounded-md border border-border bg-bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={onSearchClear}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                title="検索をクリア"
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
                title="並び替え"
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
                {SORT_OPTIONS.map((opt) => (
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

        {/* エラーメッセージ */}
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
      </div>

      {/* スクロールエリア：エントリリスト */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <EmptyState icon="⏳" title="読み込み中..." description="エントリを読み込んでいます" />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="🔑"
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id}>{renderCard(entry)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
