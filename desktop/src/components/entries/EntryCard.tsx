import {
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  Lock,
  RotateCw,
  ScrollText,
  Terminal,
  Trash2,
} from 'lucide-react'
import type { EntryRow } from '../../shared/types'
import { Button } from '../ui/button'

// アイコン取得
const getEntryIcon = (type: string) => {
  switch (type) {
    case 'login':
      return <KeyRound size={20} />
    case 'bank':
      return <Building2 size={20} />
    case 'ssh_key':
      return <Terminal size={20} />
    case 'secure_note':
      return <FileText size={20} />
    case 'credit_card':
      return <CreditCard size={20} />
    case 'password':
      return <Lock size={20} />
    case 'software_license':
      return <ScrollText size={20} />
    default:
      return <KeyRound size={20} />
  }
}

// Normal variant (EntryList用)
interface EntryCardNormalProps {
  variant: 'normal'
  entry: EntryRow
  isSelected?: boolean
  onClick: (id: string) => void
}

// Trash variant (Trash用)
interface EntryCardTrashProps {
  variant: 'trash'
  entry: EntryRow
  onRestore: (id: string) => void
  onPurge: (id: string) => void
}

type EntryCardProps = EntryCardNormalProps | EntryCardTrashProps

export default function EntryCard(props: EntryCardProps) {
  if (props.variant === 'normal') {
    return (
      <button
        type="button"
        className={`w-full text-left px-3 py-2 transition-colors cursor-pointer group ${
          props.isSelected
            ? 'bg-accent-subtle border-l-2 border-l-accent'
            : 'border-l-2 border-l-transparent hover:bg-bg-elevated'
        }`}
        onClick={() => props.onClick(props.entry.id)}
      >
        <div className="flex items-center justify-between gap-3">
          {/* 左側: アイコン + 名前 */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              {getEntryIcon(props.entry.entryType)}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-text-primary truncate">
                {props.entry.name}
              </h3>
              {props.entry.subtitle && (
                <p className="text-xs text-text-muted truncate mt-0.5">{props.entry.subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </button>
    )
  }

  // trash variant
  return (
    <div className="px-3 py-2 border-l-2 border-l-transparent">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary truncate">{props.entry.name}</h3>
          <p className="text-xs text-text-muted mt-1">
            削除日時:{' '}
            {props.entry.deletedAt
              ? new Date(props.entry.deletedAt * 1000).toLocaleString('ja-JP')
              : '-'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => props.onRestore(props.entry.id)}
            className="gap-1"
          >
            <RotateCw size={16} />
            復元
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => props.onPurge(props.entry.id)}
            className="gap-1"
          >
            <Trash2 size={16} />
            削除
          </Button>
        </div>
      </div>
    </div>
  )
}

// ヘルパー関数をエクスポート（他で使う場合）
export { getEntryIcon }
