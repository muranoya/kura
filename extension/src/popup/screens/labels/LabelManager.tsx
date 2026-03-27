import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { EmptyState } from '../../components/layout/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import * as commands from '../../commands'

export default function LabelManager() {
  const navigate = useNavigate()
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([])
  const [newLabelName, setNewLabelName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [selectedDeleteId, setSelectedDeleteId] = useState<string | null>(null)

  useEffect(() => {
    loadLabels()
  }, [])

  const loadLabels = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await commands.listLabels()
      setLabels(result)
    } catch (err) {
      setError(String(err) || 'ラベルの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) {
      setError('ラベル名を入力してください')
      return
    }

    setCreating(true)
    setError('')
    try {
      const newLabelId = await commands.createLabel(newLabelName)
      setLabels([...labels, { id: newLabelId, name: newLabelName }])
      setNewLabelName('')
    } catch (err) {
      setError(String(err) || 'ラベルの作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id)
    setEditingName(currentName)
  }

  const saveEdit = async (id: string) => {
    if (!editingName.trim()) {
      setError('ラベル名を入力してください')
      return
    }

    setError('')
    try {
      await commands.renameLabel(id, editingName)
      setLabels((prev) =>
        prev.map((label) => (label.id === id ? { ...label, name: editingName } : label))
      )
      setEditingId(null)
      setEditingName('')
    } catch (err) {
      setError(String(err) || 'ラベルの更新に失敗しました')
    }
  }

  const openDeleteConfirm = (id: string) => {
    setSelectedDeleteId(id)
    setConfirmDeleteOpen(true)
  }

  const handleDeleteLabel = async () => {
    if (!selectedDeleteId) return

    try {
      await commands.deleteLabel(selectedDeleteId)
      setLabels((prev) => prev.filter((label) => label.id !== selectedDeleteId))
      setConfirmDeleteOpen(false)
      setSelectedDeleteId(null)
    } catch (err) {
      setError(String(err) || '削除に失敗しました')
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader title="ラベル管理" showBackButton={true} />

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* 新規ラベル作成 */}
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm font-medium">新しいラベル</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2 space-y-2">
            <div className="space-y-1">
              <Label htmlFor="new-label-name" className="text-sm">
                ラベル名
              </Label>
              <Input
                id="new-label-name"
                type="text"
                placeholder="ラベル名を入力"
                value={newLabelName}
                onChange={(e) => {
                  setNewLabelName(e.target.value)
                  setError('')
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateLabel()}
                disabled={creating}
                className="text-sm"
              />
            </div>
            <Button
              onClick={handleCreateLabel}
              disabled={creating || !newLabelName.trim()}
              className="w-full text-sm gap-1"
              size="sm"
            >
              <Plus size={14} />
              追加
            </Button>
          </CardContent>
        </Card>

        {/* ラベル一覧 */}
        {loading ? (
          <div className="text-center py-8 text-text-muted text-sm">読み込み中...</div>
        ) : labels.length === 0 ? (
          <EmptyState
            title="ラベルがありません"
            description="新しいラベルを作成してください"
          />
        ) : (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">ラベル一覧</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              {labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center gap-2 p-2 rounded-md border border-border bg-bg-elevated"
                >
                  {editingId === label.id ? (
                    <>
                      <Input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 text-sm"
                        autoFocus
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => saveEdit(label.id)}
                        className="text-sm px-2"
                      >
                        <Check size={12} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingId(null)
                          setEditingName('')
                        }}
                        className="text-sm px-2"
                      >
                        <X size={12} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-text-primary font-medium">
                        {label.name}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => startEdit(label.id, label.name)}
                        className="text-sm px-2"
                      >
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteConfirm(label.id)}
                        className="text-sm px-2"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="ラベル削除"
        description="このラベルを削除します。このラベルで分類されたアイテムのラベルは削除されますが、アイテム自体は削除されません。"
        confirmText="削除"
        isDangerous={true}
        onConfirm={handleDeleteLabel}
        onCancel={() => {
          setConfirmDeleteOpen(false)
          setSelectedDeleteId(null)
        }}
      />
    </div>
  )
}
