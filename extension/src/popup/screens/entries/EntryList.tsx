import { Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import EntryCard, { getTypeLabel } from '../../components/entries/EntryCard'
import EntryListPanel from '../../components/entries/EntryListPanel'
import { EmptyState } from '../../components/layout/EmptyState'
import { SyncActions } from '../../components/layout/SyncActions'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import type { Entry, EntryRow, EntryType } from '../../shared/types'

interface EntryListProps {
  isFavorites?: boolean
}

export default function EntryList({ isFavorites = false }: EntryListProps) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // フィルター・検索
  const [selectedType, setSelectedType] = useState<EntryType | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLabelId, setSelectedLabelId] = useState<string | undefined>(undefined)

  // 詳細ペイン
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [allLabels, setAllLabels] = useState<Array<{ id: string; name: string }>>([])
  const [passwordMasked, setPasswordMasked] = useState(true)

  // マウント時にラベル一覧を取得（フィルターUI用）
  useEffect(() => {
    commands.listLabels().then(setAllLabels).catch(console.error)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadEntries is stable
  useEffect(() => {
    loadEntries()
  }, [isFavorites, selectedLabelId])

  // 詳細ペインを読み込み
  useEffect(() => {
    if (!selectedId) {
      setSelectedEntry(null)
      return
    }

    const loadDetail = async () => {
      setSelectedLoading(true)
      try {
        const entry = await commands.getEntry(selectedId)
        setSelectedEntry(entry)
      } catch (err) {
        console.error('Failed to load entry:', err)
      } finally {
        setSelectedLoading(false)
      }
    }

    loadDetail()
  }, [selectedId])

  const loadEntries = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await commands.listEntries({
        onlyFavorites: isFavorites,
        labelId: selectedLabelId,
      })
      setEntries(result)
    } catch (err) {
      setError(String(err) || 'Failed to load entries')
    } finally {
      setLoading(false)
    }
  }

  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => !selectedType || e.entryType === selectedType)
      .filter((e) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [entries, selectedType, searchQuery])

  const handleDelete = async (id: string) => {
    if (confirm('このエントリを削除しますか？')) {
      try {
        await commands.deleteEntry(id)
        setEntries((prev) => prev.filter((e) => e.id !== id))
        if (selectedId === id) {
          setSelectedId(null)
        }
      } catch (err) {
        setError(String(err) || 'Failed to delete entry')
      }
    }
  }

  const handleFavorite = async (id: string, currentFavorite: boolean) => {
    try {
      await commands.setFavorite(id, !currentFavorite)
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, isFavorite: !currentFavorite } : e)),
      )
      if (selectedEntry && selectedEntry.id === id) {
        setSelectedEntry((prev) => (prev ? { ...prev, isFavorite: !currentFavorite } : prev))
      }
    } catch (err) {
      setError(String(err) || 'Failed to update favorite')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 全幅 sticky ヘッダー（左右ペインにまたがる） */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary whitespace-nowrap">
          {isFavorites ? 'お気に入り' : 'アイテム'}
        </h1>

        {/* 検索ボックス */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted"
            size={14}
          />
          <input
            type="text"
            placeholder="検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-border bg-bg-elevated text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              title="検索をクリア"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 新規追加ボタン */}
        {!isFavorites && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/entries/create')}
            className="gap-1 text-sm flex-shrink-0"
          >
            <Plus size={14} />
            新規追加
          </Button>
        )}

        {/* 同期ボタン */}
        <SyncActions />
      </div>

      {/* 左右分割レイアウト */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左ペイン: リスト */}
        <div className="w-60 border-r border-border bg-sidebar flex flex-col">
          {/* エラーメッセージ */}
          {error && (
            <div className="mx-2 mt-2 p-2 rounded-md bg-danger/10 border border-danger/20">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* リストコンテンツ */}
          <EntryListPanel
            selectedType={selectedType}
            onTypeChange={setSelectedType}
            labels={allLabels}
            selectedLabelId={selectedLabelId}
            onLabelChange={setSelectedLabelId}
            entries={filteredEntries}
            loading={loading}
            error={error ?? ''}
            emptyTitle={isFavorites ? 'お気に入りがありません' : 'アイテムがありません'}
            emptyDescription={
              isFavorites
                ? 'お気に入りのアイテムをここに表示します'
                : '新しいアイテムを作成してください'
            }
            renderCard={(entry) => (
              <EntryCard
                variant="normal"
                entry={entry}
                compact
                isSelected={selectedId === entry.id}
                onClick={(id) => setSelectedId(id)}
                onFavorite={handleFavorite}
              />
            )}
          />
        </div>

        {/* 右ペイン: 詳細 */}
        <div className="flex-1 bg-base overflow-y-auto pb-20">
          {selectedId && selectedEntry ? (
            <EntryDetailPane
              entry={selectedEntry}
              allLabels={allLabels}
              loading={selectedLoading}
              passwordMasked={passwordMasked}
              onToggleMask={() => setPasswordMasked(!passwordMasked)}
              onEdit={() => navigate(`/entries/${selectedId}/edit`)}
              onDelete={() => handleDelete(selectedId)}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState title="アイテムを選択してください" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 詳細ペイン用のコンポーネント
interface EntryDetailPaneProps {
  entry: Entry
  allLabels: Array<{ id: string; name: string }>
  loading: boolean
  passwordMasked: boolean
  onToggleMask: () => void
  onEdit: () => void
  onDelete: () => void
}

function EntryDetailPane({
  entry,
  allLabels,
  loading,
  passwordMasked,
  onToggleMask,
  onEdit,
  onDelete,
}: EntryDetailPaneProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted">読み込み中...</div>
      </div>
    )
  }

  const FieldDisplay = ({
    label,
    value,
    isPassword = false,
    isMasked = false,
  }: {
    label: string
    value: string
    isPassword?: boolean
    isMasked?: boolean
  }) => (
    <div className="py-3 border-b border-border/50">
      <p className="text-sm font-semibold text-text-muted uppercase mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <code className="text-sm text-text-primary font-mono break-all flex-1">
          {isPassword && isMasked ? '••••••••' : value}
        </code>
        {isPassword && (
          <button
            type="button"
            onClick={onToggleMask}
            className="p-1.5 rounded hover:bg-bg-elevated transition-colors flex-shrink-0"
            title={isMasked ? '表示' : '非表示'}
          >
            {isMasked ? '👁️' : '🙈'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
          className="p-1.5 rounded hover:bg-bg-elevated transition-colors flex-shrink-0 text-accent hover:text-accent-hover"
          title="コピー"
        >
          📋
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4">
      {/* ヘッダー */}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-lg font-bold text-text-primary truncate flex-1">{entry.name}</h2>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="secondary" onClick={onEdit} className="gap-1.5 text-sm">
              <Pencil size={14} />
              編集
            </Button>
            <Button size="sm" variant="destructive" onClick={onDelete} className="gap-1.5 text-sm">
              <Trash2 size={14} />
              削除
            </Button>
          </div>
        </div>
        <Badge variant="muted" className="text-sm">
          {getTypeLabel(entry.entryType)}
        </Badge>
      </div>

      {/* タイプ別フィールド */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          {entry.entryType === 'login' && (
            <>
              {(entry.typedValue as Record<string, string>).url && (
                <FieldDisplay
                  label="URL"
                  value={(entry.typedValue as Record<string, string>).url}
                />
              )}
              {(entry.typedValue as Record<string, string>).username && (
                <FieldDisplay
                  label="ユーザー名"
                  value={(entry.typedValue as Record<string, string>).username}
                />
              )}
              {(entry.typedValue as Record<string, string>).password && (
                <FieldDisplay
                  label="パスワード"
                  value={(entry.typedValue as Record<string, string>).password}
                  isPassword
                  isMasked={passwordMasked}
                />
              )}
              {(entry.typedValue as Record<string, string>).totp && (
                <FieldDisplay
                  label="TOTP"
                  value={(entry.typedValue as Record<string, string>).totp}
                />
              )}
            </>
          )}

          {entry.entryType === 'bank' && (
            <>
              {(entry.typedValue as Record<string, string>).bank_name && (
                <FieldDisplay
                  label="銀行名"
                  value={(entry.typedValue as Record<string, string>).bank_name}
                />
              )}
              {(entry.typedValue as Record<string, string>).account_number && (
                <FieldDisplay
                  label="口座番号"
                  value={(entry.typedValue as Record<string, string>).account_number}
                />
              )}
              {(entry.typedValue as Record<string, string>).pin && (
                <FieldDisplay
                  label="PIN"
                  value={(entry.typedValue as Record<string, string>).pin}
                  isPassword
                  isMasked={passwordMasked}
                />
              )}
            </>
          )}

          {entry.entryType === 'ssh_key' && (
            <>
              {(entry.typedValue as Record<string, string>).private_key && (
                <FieldDisplay
                  label="秘密鍵"
                  value={(entry.typedValue as Record<string, string>).private_key}
                  isPassword
                  isMasked={passwordMasked}
                />
              )}
              {(entry.typedValue as Record<string, string>).passphrase && (
                <FieldDisplay
                  label="パスフレーズ"
                  value={(entry.typedValue as Record<string, string>).passphrase}
                  isPassword
                  isMasked={passwordMasked}
                />
              )}
            </>
          )}

          {entry.entryType === 'credit_card' && (
            <>
              {(entry.typedValue as Record<string, string>).cardholder && (
                <FieldDisplay
                  label="カード名義人"
                  value={(entry.typedValue as Record<string, string>).cardholder}
                />
              )}
              {(entry.typedValue as Record<string, string>).number && (
                <FieldDisplay
                  label="カード番号"
                  value={(entry.typedValue as Record<string, string>).number}
                />
              )}
              {(entry.typedValue as Record<string, string>).expiry && (
                <FieldDisplay
                  label="有効期限"
                  value={(entry.typedValue as Record<string, string>).expiry}
                />
              )}
              {(entry.typedValue as Record<string, string>).cvv && (
                <FieldDisplay
                  label="CVV"
                  value={(entry.typedValue as Record<string, string>).cvv}
                  isPassword
                  isMasked={passwordMasked}
                />
              )}
            </>
          )}

          {entry.entryType === 'secure_note' && (
            <div className="py-3">
              <p className="text-sm font-semibold text-text-muted uppercase mb-2">コンテンツ</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap">
                {(entry.typedValue as Record<string, string>).content}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* カスタムフィールド */}
      {entry.customFields && entry.customFields.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">カスタムフィールド</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entry.customFields.map((field) => (
              <FieldDisplay
                key={field.id}
                label={field.name}
                value={field.value}
                isPassword={field.fieldType === 'password'}
                isMasked={passwordMasked}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* メモ */}
      {entry.notes && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">メモ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{entry.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ラベル */}
      {entry.labels && entry.labels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ラベル</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {entry.labels.map((labelId) => {
                const label = allLabels.find((l) => l.id === labelId)
                return label ? (
                  <Badge key={labelId} variant="secondary">
                    {label.name}
                  </Badge>
                ) : null
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
