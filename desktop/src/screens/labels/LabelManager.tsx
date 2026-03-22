import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { Label } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState } from '../../components/layout/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Plus, Trash2 } from 'lucide-react'

export default function LabelManager() {
  const navigate = useNavigate()
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

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
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }
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
        await commands.pushVault(JSON.stringify(s3Config))
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

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="ラベル管理" />

      <div className="max-w-2xl mx-auto p-6">
        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* 新規ラベル作成 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>新規ラベル</CardTitle>
          </CardHeader>
          <CardContent>
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
                className="gap-2"
              >
                <Plus size={18} />
                {creating ? '作成中...' : '作成'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ラベル一覧 */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">ラベル一覧</h2>

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
                  <Badge variant="primary">{label.name}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteLabelClick(label.id)}
                    className="text-danger hover:text-danger gap-1"
                  >
                    <Trash2 size={16} />
                    削除
                  </Button>
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
