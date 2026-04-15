import { ArrowUpDown, Filter, Star, Tag } from 'lucide-react'
import type { EntryRow, EntryType, SortConfig } from '../../../shared/types'
import { EmptyState } from '../layout/EmptyState'
import TypeFilterDropdown from '../ui/type-filter-dropdown'

interface EntryListPanelProps {
  // お気に入りフィルター
  onlyFavorites: boolean
  onFavoritesChange: (enabled: boolean) => void

  // フィルター
  selectedType: EntryType | undefined
  onTypeChange: (type: EntryType | undefined) => void

  // ラベルフィルター
  labels: Array<{ id: string; name: string }>
  selectedLabelId: string | undefined
  onLabelChange: (labelId: string | undefined) => void

  // 並び替え
  sortConfig: SortConfig
  onSortChange: (config: SortConfig) => void

  // データ
  entries: EntryRow[]
  loading: boolean
  error: string

  // 空状態テキスト
  emptyTitle: string
  emptyDescription: string

  // 優先表示セクション（現在タブのドメインに合致するアイテム等）
  prioritySection?: {
    label: string
    entries: EntryRow[]
  }

  // カードのレンダリング（差分部分のみ render prop）
  renderCard: (entry: EntryRow) => React.ReactNode
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-1.5 pt-2 pb-0.5 px-2">
      <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
        {count !== undefined ? `${label} (${count})` : label}
      </span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
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
  { value: 'all', label: 'すべての種類' },
  { value: 'login', label: 'ログイン' },
  { value: 'bank', label: '銀行口座' },
  { value: 'ssh_key', label: 'SSH キー' },
  { value: 'secure_note', label: 'セキュアノート' },
  { value: 'credit_card', label: 'クレジットカード' },
  { value: 'password', label: 'パスワード' },
  { value: 'software_license', label: 'ソフトウェアライセンス' },
]

export default function EntryListPanel({
  onlyFavorites,
  onFavoritesChange,
  selectedType,
  onTypeChange,
  labels,
  selectedLabelId,
  onLabelChange,
  sortConfig,
  onSortChange,
  entries,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  prioritySection,
  renderCard,
}: EntryListPanelProps) {
  const sortValue = `${sortConfig.field}:${sortConfig.order}`

  const labelOptions = [
    { value: 'all', label: 'すべてのラベル' },
    ...labels.map((l) => ({ value: l.id, label: l.name })),
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* フィルター（固定表示） */}
      <div className="shrink-0 p-3 border-b border-border">
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => onFavoritesChange(!onlyFavorites)}
            title={onlyFavorites ? 'お気に入りフィルター解除' : 'お気に入りのみ表示'}
            className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
              onlyFavorites
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-surface text-text-primary hover:bg-bg-elevated'
            }`}
          >
            <Star size={16} className={onlyFavorites ? 'fill-accent' : ''} />
          </button>

          <TypeFilterDropdown
            value={selectedType ?? 'all'}
            onChange={(v) => onTypeChange(v === 'all' ? undefined : (v as EntryType))}
            options={ENTRY_TYPES}
            iconTrigger={<Filter size={16} />}
          />

          {labels.length > 0 && (
            <TypeFilterDropdown
              value={selectedLabelId ?? 'all'}
              onChange={(v) => onLabelChange(v === 'all' ? undefined : v)}
              options={labelOptions}
              iconTrigger={<Tag size={16} />}
            />
          )}

          <TypeFilterDropdown
            value={sortValue}
            onChange={(v) => {
              const [field, order] = v.split(':') as [SortConfig['field'], SortConfig['order']]
              onSortChange({ field, order })
            }}
            options={SORT_OPTIONS}
            iconTrigger={<ArrowUpDown size={16} />}
          />
        </div>
      </div>

      {/* スクロール可能なリスト */}
      <div className="flex-1 overflow-y-auto">
        {/* エラーメッセージ */}
        {error && (
          <div className="m-3 p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* コンテンツ */}
        {loading ? (
          <div className="p-3">
            <EmptyState icon="⏳" title="読み込み中..." description="エントリを読み込んでいます" />
          </div>
        ) : !prioritySection?.entries.length && entries.length === 0 ? (
          <div className="p-3">
            <EmptyState icon="🔑" title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <>
            {prioritySection && prioritySection.entries.length > 0 && (
              <>
                <SectionHeader
                  label={prioritySection.label}
                  count={prioritySection.entries.length}
                />
                <div className="divide-y divide-border">
                  {prioritySection.entries.map((entry) => (
                    <div key={`priority-${entry.id}`}>{renderCard(entry)}</div>
                  ))}
                </div>
                <SectionHeader label="すべてのアイテム" />
              </>
            )}
            {entries.length > 0 ? (
              <div className="divide-y divide-border">
                {entries.map((entry) => (
                  <div key={entry.id}>{renderCard(entry)}</div>
                ))}
              </div>
            ) : (
              prioritySection &&
              prioritySection.entries.length > 0 && (
                <div className="px-2 py-2 text-xs text-text-secondary italic">
                  他のアイテムはありません
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
