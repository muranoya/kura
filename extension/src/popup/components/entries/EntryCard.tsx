import {
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  Lock,
  RotateCw,
  ScrollText,
  Star,
  Terminal,
  Trash2,
} from 'lucide-react'
import * as React from 'react'
import type { EntryRow } from '../../../shared/types'
import { Button } from '../ui/button'
import { Card } from '../ui/card'

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

// タイプラベル取得
const getTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    login: 'ログイン',
    bank: '銀行口座',
    ssh_key: 'SSH キー',
    secure_note: 'セキュアノート',
    credit_card: 'クレジットカード',
    password: 'パスワード',
    software_license: 'ソフトウェアライセンス',
  }
  return labels[type] || type
}

// Normal variant (EntryList用)
interface EntryCardNormalProps {
  variant: 'normal'
  entry: EntryRow
  onClick: (id: string) => void
  onFavorite: (id: string, current: boolean) => void
  isSelected?: boolean
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
    const isSelected = props.isSelected || false
    const selectedClass = isSelected
      ? 'bg-accent-subtle border-l-2 border-accent'
      : 'hover:border-accent/50'

    return (
      <Card
        className={`px-3 py-2 ${selectedClass} transition-colors cursor-pointer group`}
        onClick={() => props.onClick(props.entry.id)}
      >
        <div className="flex items-center justify-between gap-3">
          {/* 左側: アイコン + 名前 */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              {React.cloneElement(
                getEntryIcon(props.entry.entryType) as React.ReactElement<{ size: number }>,
                { size: 16 },
              )}
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

          {/* 右側: アクション */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* お気に入りボタン */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                props.onFavorite(props.entry.id, props.entry.isFavorite)
              }}
              className="p-1.5 rounded-md hover:bg-bg-elevated transition-colors"
              title={props.entry.isFavorite ? 'お気に入い解除' : 'お気に入い'}
            >
              <Star
                size={14}
                className={props.entry.isFavorite ? 'fill-accent text-accent' : 'text-text-muted'}
              />
            </button>
          </div>
        </div>
      </Card>
    )
  }

  // trash variant
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary truncate">{props.entry.name}</h3>
          <p className="text-sm text-text-muted mt-1">
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
    </Card>
  )
}

// ヘルパー関数をエクスポート（他で使う場合）
export { getEntryIcon, getTypeLabel }
