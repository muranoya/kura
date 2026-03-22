import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { EntryRow } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState } from '../../components/layout/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { KeyRound, Building2, Terminal, FileText, CreditCard, Star, Plus, Trash2 } from 'lucide-react'

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

export default function EntryList() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  useEffect(() => {
    loadEntries()
  }, [])

  const loadEntries = async () => {
    try {
      setLoading(true)
      const data = await commands.listEntries()
      setEntries(data)
    } catch (err) {
      setError(`エントリ読み込み失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFavorite = async (id: string, currentFavorite: boolean) => {
    try {
      await commands.setFavorite(id, !currentFavorite)

      // Save vault to file and push to S3
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }

      setEntries(entries.map(e =>
        e.id === id ? { ...e, isFavorite: !currentFavorite } : e
      ))
    } catch (err) {
      setError(`お気に入い変更失敗: ${err}`)
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteTargetId) return
    try {
      await commands.deleteEntry(deleteTargetId)

      // Save vault to file and push to S3
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }

      setEntries(entries.filter(e => e.id !== deleteTargetId))
      setDeleteDialogOpen(false)
      setDeleteTargetId(null)
    } catch (err) {
      setError(`削除失敗: ${err}`)
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeleteTargetId(id)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="h-full flex flex-col bg-bg-base">
      <PageHeader
        title="エントリ一覧"
        action={
          <Button
            onClick={() => navigate('/entries/create')}
            className="gap-2"
          >
            <Plus size={18} />
            <span>新規作成</span>
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {loading ? (
          <EmptyState
            icon="⏳"
            title="読み込み中..."
            description="エントリを読み込んでいます"
          />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="🔑"
            title="エントリがありません"
            description="新規作成ボタンからエントリを追加してください"
            action={
              <Button onClick={() => navigate('/entries/create')}>
                最初のエントリを作成
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 max-w-4xl">
            {entries.map((entry) => (
              <Card
                key={entry.id}
                className="p-4 hover:border-accent/50 transition-colors cursor-pointer group"
                onClick={() => navigate(`/entries/${entry.id}`)}
              >
                <div className="flex items-center justify-between gap-4">
                  {/* 左側: アイコン + 名前 */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                      {getEntryIcon(entry.entryType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-text-primary truncate">
                        {entry.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="muted" className="text-xs">
                          {getTypeLabel(entry.entryType)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* 右側: アクション */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* お気に入いボタン */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFavorite(entry.id, entry.isFavorite)
                      }}
                      className="p-2 rounded-md hover:bg-bg-elevated transition-colors"
                      title={entry.isFavorite ? 'お気に入い解除' : 'お気に入い'}
                    >
                      <Star
                        size={18}
                        className={entry.isFavorite ? 'fill-accent text-accent' : 'text-text-muted'}
                      />
                    </button>

                    {/* 削除ボタン */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteClick(entry.id)
                      }}
                      className="text-danger hover:text-danger gap-1"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="アイテムを削除"
        description="このアイテムをゴミ箱に移動します。後から復元できます。"
        confirmText="削除"
        cancelText="キャンセル"
        isDangerous={true}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeleteTargetId(null)
        }}
      />
    </div>
  )
}
