import * as React from 'react'
import { EntryRow } from '../../shared/types'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { KeyRound, Building2, Terminal, FileText, CreditCard, Star, Trash2, RotateCw } from 'lucide-react'

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
    passkey: 'PassKey',
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
  compact?: boolean
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
    const isCompact = props.compact || false
    const isSelected = props.isSelected || false
    const paddingClass = isCompact ? 'px-3 py-2' : 'p-3'
    const iconSize = isCompact ? 16 : 20
    const iconContainerSize = isCompact ? 'w-7 h-7' : 'w-8 h-8'
    const selectedClass = isSelected ? 'bg-accent-subtle border-l-2 border-accent' : 'hover:border-accent/50'

    return (
      <Card
        className={`${paddingClass} ${selectedClass} transition-colors cursor-pointer group`}
        onClick={() => props.onClick(props.entry.id)}
      >
        <div className="flex items-center justify-between gap-3">
          {/* 左側: アイコン + 名前 */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`flex-shrink-0 ${iconContainerSize} rounded-lg bg-accent/10 flex items-center justify-center text-accent`}>
              {React.cloneElement(getEntryIcon(props.entry.entryType) as React.ReactElement, { size: iconSize })}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className={`${isCompact ? 'text-sm' : 'text-sm'} font-semibold text-text-primary truncate`}>
                {props.entry.name}
              </h3>
              {!isCompact && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="muted" className="text-sm">
                    {getTypeLabel(props.entry.entryType)}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* 右側: アクション */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* お気に入りボタン */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                props.onFavorite(props.entry.id, props.entry.isFavorite)
              }}
              className="p-1.5 rounded-md hover:bg-bg-elevated transition-colors"
              title={props.entry.isFavorite ? 'お気に入い解除' : 'お気に入い'}
            >
              <Star
                size={isCompact ? 14 : 18}
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
          <h3 className="text-sm font-semibold text-text-primary truncate">
            {props.entry.name}
          </h3>
          <p className="text-sm text-text-muted mt-1">
            削除日時: {props.entry.deletedAt ? new Date(props.entry.deletedAt * 1000).toLocaleString('ja-JP') : '-'}
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
