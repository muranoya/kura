import { ArrowUpDown, Filter, Star, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EntryRow, EntryType, SortConfig } from '../../../shared/types'
import { EmptyState } from '../layout/EmptyState'
import TypeFilterDropdown from '../ui/type-filter-dropdown'

interface EntryListPanelProps {
  onlyFavorites: boolean
  onFavoritesChange: (enabled: boolean) => void

  selectedType: EntryType | undefined
  onTypeChange: (type: EntryType | undefined) => void

  labels: Array<{ id: string; name: string }>
  selectedLabelId: string | undefined
  onLabelChange: (labelId: string | undefined) => void

  sortConfig: SortConfig
  onSortChange: (config: SortConfig) => void

  entries: EntryRow[]
  loading: boolean
  error: string

  emptyTitle: string
  emptyDescription: string

  prioritySection?: {
    label: string
    entries: EntryRow[]
  }

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

const ENTRY_TYPE_KEYS = [
  'login',
  'bank',
  'ssh_key',
  'secure_note',
  'credit_card',
  'password',
  'software_license',
] as const

const SORT_KEYS: Array<{ value: string; key: string }> = [
  { value: 'created_at:desc', key: 'entries.sort.createdAtDesc' },
  { value: 'created_at:asc', key: 'entries.sort.createdAtAsc' },
  { value: 'updated_at:desc', key: 'entries.sort.updatedAtDesc' },
  { value: 'updated_at:asc', key: 'entries.sort.updatedAtAsc' },
  { value: 'name:asc', key: 'entries.sort.nameAsc' },
  { value: 'name:desc', key: 'entries.sort.nameDesc' },
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
  const { t } = useTranslation()
  const sortValue = `${sortConfig.field}:${sortConfig.order}`

  const sortOptions = SORT_KEYS.map(({ value, key }) => ({ value, label: t(key) }))

  const entryTypeOptions = [
    { value: 'all', label: t('entries.allTypes') },
    ...ENTRY_TYPE_KEYS.map((type) => ({
      value: type,
      label: t(`entries.types.${type}`),
    })),
  ]

  const labelOptions = [
    { value: 'all', label: t('entries.allLabels') },
    ...labels.map((label) => ({ value: label.id, label: label.name })),
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-3 border-b border-border">
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => onFavoritesChange(!onlyFavorites)}
            title={
              onlyFavorites
                ? t('entries.favoritesFilterDisable')
                : t('entries.favoritesFilterEnable')
            }
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
            options={entryTypeOptions}
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
            options={sortOptions}
            iconTrigger={<ArrowUpDown size={16} />}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-3 p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="p-3">
            <EmptyState
              icon="⏳"
              title={t('common.loading')}
              description={t('entries.loadingDescription')}
            />
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
                <SectionHeader label={t('entries.allItemsSection')} />
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
                  {t('entries.noOtherItems')}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
