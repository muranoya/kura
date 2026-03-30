import { useEffect, useState, useCallback } from 'react'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { Label } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/layout/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react'

export default function LabelManager() {
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    loadLabels()
  }, [])

  const loadLabels = async () => {
    try {
      setLoading(true)
      const data = await commands.listLabels()
      setLabels(data)
    } catch (err) {
      setError(`ラベル読み込み失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim()) {
      setError('ラベル名を入力してください')
      return
    }

    setCreating(true)
    try {
      const newLabel = await commands.createLabel(newLabelName)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch(e => console.warn('Sync failed:', e))
      setLabels([...labels, newLabel])
      setNewLabelName('')
      setError('')
    } catch (err) {
      setError(`ラベル作成失敗: ${err}`)
    } finally {
      setCreating(false)
    }
  }, [newLabelName, labels])

  const handleDeleteLabelConfirmed = useCallback(async () => {
    if (!deleteTargetId) return
    try {
      await commands.deleteLabel(deleteTargetId)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVaultAndTrack(JSON.stringify(s3Config))
      }
      setLabels(labels.filter(l => l.id !== deleteTargetId))
      setDeleteDialogOpen(false)
      setDeleteTargetId(null)
    } catch (err) {
      setError(`ラベル削除失敗: ${err}`)
    }
  }, [labels, deleteTargetId])

  const handleDeleteLabelClick = (id: string) => {
    setDeleteTargetId(id)
    setDeleteDialogOpen(true)
  }

  const handleEditStart = (label: Label) => {
    setEditingLabelId(label.id)
    setEditingName(label.name)
  }

  const handleEditCancel = () => {
    setEditingLabelId(null)
    setEditingName('')
  }

  const handleEditSave = useCallback(async () => {
    if (!editingLabelId || !editingName.trim()) {
      setError('ラベル名を入力してください')
      return
    }

    try {
      await commands.renameLabel(editingLabelId, editingName)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVaultAndTrack(JSON.stringify(s3Config))
      }
      setLabels(labels.map(l => l.id === editingLabelId ? { ...l, name: editingName } : l))
      setEditingLabelId(null)
      setEditingName('')
      setError('')
    } catch (err) {
      setError(`ラベル更新失敗: ${err}`)
    }
  }, [editingLabelId, editingName, labels])

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary">ラベル管理</h1>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* エラーメッセージ */}
        {error && (
          <div className="mb-3 p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* 新規ラベル作成 */}
        <Card className="mb-3">
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">新規ラベル</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
            <div className="flex gap-3">
              <Input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="ラベル名を入力"
                disabled={creating}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateLabel()}
              />
              <Button
                onClick={handleCreateLabel}
                disabled={creating || !newLabelName.trim()}
                className="gap-2 whitespace-nowrap"
              >
                <Plus size={18} />
                {creating ? '作成中...' : '作成'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ラベル一覧 */}
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-2">ラベル一覧</h2>

          {loading ? (
            <EmptyState icon="⏳" title="読み込み中..." description="ラベルを読み込んでいます" />
          ) : labels.length === 0 ? (
            <EmptyState icon="🏷" title="ラベルがありません" description="最初のラベルを作成してください" />
          ) : (
            <div className="space-y-2">
              {labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-bg-surface border border-border hover:border-accent/50 transition-colors"
                >
                  {editingLabelId === label.id ? (
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEditSave()
                        } else if (e.key === 'Escape') {
                          handleEditCancel()
                        }
                      }}
                      className="flex-1 mr-2"
                      placeholder="ラベル名"
                    />
                  ) : (
                    <Badge variant="primary">{label.name}</Badge>
                  )}
                  <div className="flex gap-2">
                    {editingLabelId === label.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleEditSave}
                          className="text-success hover:text-success"
                          title="保存"
                        >
                          <Check size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleEditCancel}
                          className="text-text-secondary hover:text-text-primary"
                          title="キャンセル"
                        >
                          <X size={16} />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditStart(label)}
                          className="text-accent hover:text-accent"
                          title="編集"
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLabelClick(label.id)}
                          className="text-danger hover:text-danger"
                          title="削除"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ラベル削除確認ダイアログ */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="ラベルを削除"
        description="このラベルを削除します。エントリへの割り当てのみ削除され、エントリ自体は削除されません。"
        confirmText="削除"
        cancelText="キャンセル"
        isDangerous={true}
        onConfirm={handleDeleteLabelConfirmed}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeleteTargetId(null)
        }}
      />
    </div>
  )
}
