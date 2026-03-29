import { EntryRow, EntryType } from '../../shared/types'
import { EmptyState } from '../layout/EmptyState'
import { Search, X } from 'lucide-react'
import TypeFilterDropdown from '../ui/type-filter-dropdown'

interface EntryListPanelProps {
  // フィルター
  selectedType: EntryType | undefined
  onTypeChange: (type: EntryType | undefined) => void

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

  // カードのレンダリング（差分部分のみ render prop）
  renderCard: (entry: EntryRow) => React.ReactNode

  // ヘッダーアクション（「+」ボタン等）
  headerAction?: React.ReactNode
}

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
  searchQuery,
  onSearchChange,
  onSearchClear,
  entries,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  emptyAction,
  renderCard,
  headerAction,
}: EntryListPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* 検索ボックス + アクション */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted" size={14} />
          <input
            type="text"
            placeholder="検索..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-border bg-bg-surface text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {searchQuery && (
            <button
              onClick={onSearchClear}
              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              title="検索をクリア"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
      </div>

      {/* タイプフィルタードロップダウン */}
      <TypeFilterDropdown
        value={selectedType ?? 'all'}
        onChange={(v) => onTypeChange(v === 'all' ? undefined : (v as EntryType))}
        options={ENTRY_TYPES}
      />

      {/* エラーメッセージ */}
      {error && (
        <div className="mb-3 p-3 rounded-md bg-danger/10 border border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* コンテンツ */}
      {loading ? (
        <EmptyState
          icon="⏳"
          title="読み込み中..."
          description="エントリを読み込んでいます"
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="🔑"
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id}>
              {renderCard(entry)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
