import type { EntryRow, EntryType } from '../../shared/types'
import { EmptyState } from '../layout/EmptyState'
import TypeFilterDropdown from '../ui/type-filter-dropdown'

interface EntryListPanelProps {
  // フィルター
  selectedType: EntryType | undefined
  onTypeChange: (type: EntryType | undefined) => void

  // ラベルフィルター
  labels: Array<{ id: string; name: string }>
  selectedLabelId: string | undefined
  onLabelChange: (labelId: string | undefined) => void

  // データ
  entries: EntryRow[]
  loading: boolean
  error: string

  // 空状態テキスト
  emptyTitle: string
  emptyDescription: string

  // カードのレンダリング（差分部分のみ render prop）
  renderCard: (entry: EntryRow) => React.ReactNode
}

const ENTRY_TYPES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'すべての種類' },
  { value: 'login', label: 'ログイン' },
  { value: 'bank', label: '銀行口座' },
  { value: 'ssh_key', label: 'SSH キー' },
  { value: 'secure_note', label: 'セキュアノート' },
  { value: 'credit_card', label: 'クレジットカード' },
]

export default function EntryListPanel({
  selectedType,
  onTypeChange,
  labels,
  selectedLabelId,
  onLabelChange,
  entries,
  loading,
  error,
  emptyTitle,
  emptyDescription,
  renderCard,
}: EntryListPanelProps) {
  const labelOptions = [
    { value: 'all', label: 'すべてのラベル' },
    ...labels.map((l) => ({ value: l.id, label: l.name })),
  ]

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* タイプフィルタードロップダウン */}
      <TypeFilterDropdown
        value={selectedType ?? 'all'}
        onChange={(v) => onTypeChange(v === 'all' ? undefined : (v as EntryType))}
        options={ENTRY_TYPES}
      />

      {/* ラベルフィルタードロップダウン（ラベルが1件以上の場合のみ表示） */}
      {labels.length > 0 && (
        <TypeFilterDropdown
          value={selectedLabelId ?? 'all'}
          onChange={(v) => onLabelChange(v === 'all' ? undefined : v)}
          options={labelOptions}
        />
      )}

      {/* エラーメッセージ */}
      {error && (
        <div className="mb-3 p-3 rounded-md bg-danger/10 border border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* コンテンツ */}
      {loading ? (
        <EmptyState icon="⏳" title="読み込み中..." description="エントリを読み込んでいます" />
      ) : entries.length === 0 ? (
        <EmptyState icon="🔑" title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id}>{renderCard(entry)}</div>
          ))}
        </div>
      )}
    </div>
  )
}
