import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/layout/EmptyState'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { useNotifySynced, useSyncVersion } from '../../contexts/SyncContext'
import type { Label } from '../../shared/types'

export default function LabelManager() {
  const { t } = useTranslation()
  const syncVersion = useSyncVersion()
  const notifySynced = useNotifySynced()
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const loadLabels = useCallback(async () => {
    void syncVersion // trigger reload on sync
    try {
      setLoading(true)
      const data = await commands.listLabels()
      setLabels(data)
    } catch (err) {
      setError(t('labels.errorLoad', { error: String(err) }))
    } finally {
      setLoading(false)
    }
  }, [syncVersion, t])

  useEffect(() => {
    loadLabels()
  }, [loadLabels])

  const handleCreateLabel = useCallback(async () => {
    if (!newLabelName.trim()) {
      setError(t('labels.errorRequired'))
      return
    }

    setCreating(true)
    try {
      const newLabel = await commands.createLabel(newLabelName)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch((e) => console.warn('Sync failed:', e))
      setLabels([...labels, newLabel])
      setNewLabelName('')
      setError('')
      notifySynced()
    } catch (err) {
      setError(t('labels.errorCreate', { error: String(err) }))
    } finally {
      setCreating(false)
    }
  }, [newLabelName, labels, notifySynced, t])

  const handleDeleteLabelConfirmed = useCallback(async () => {
    if (!deleteTargetId) return
    try {
      await commands.deleteLabel(deleteTargetId)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch((e) => console.warn('Sync failed:', e))
      setLabels(labels.filter((l) => l.id !== deleteTargetId))
      setDeleteDialogOpen(false)
      setDeleteTargetId(null)
      notifySynced()
    } catch (err) {
      setError(t('labels.errorDelete', { error: String(err) }))
    }
  }, [labels, deleteTargetId, notifySynced, t])

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
      setError(t('labels.errorRequired'))
      return
    }

    try {
      await commands.renameLabel(editingLabelId, editingName)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch((e) => console.warn('Sync failed:', e))
      setLabels(labels.map((l) => (l.id === editingLabelId ? { ...l, name: editingName } : l)))
      setEditingLabelId(null)
      setEditingName('')
      setError('')
      notifySynced()
    } catch (err) {
      setError(t('labels.errorUpdate', { error: String(err) }))
    }
  }, [editingLabelId, editingName, labels, notifySynced, t])

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">{t('labels.title')}</h1>
        <SyncHeaderActions />
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
            <CardTitle className="text-sm font-medium">{t('labels.newCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-2">
            <div className="flex gap-3">
              <Input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder={t('labels.newPlaceholder')}
                disabled={creating}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateLabel()}
              />
              <Button
                onClick={handleCreateLabel}
                disabled={creating || !newLabelName.trim()}
                className="gap-2 whitespace-nowrap"
              >
                <Plus size={18} />
                {creating ? t('common.creating') : t('common.create')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ラベル一覧 */}
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-2">{t('labels.list')}</h2>

          {loading ? (
            <EmptyState
              icon="⏳"
              title={t('labels.loading')}
              description={t('labels.loadingDescription')}
            />
          ) : labels.length === 0 ? (
            <EmptyState
              icon="🏷"
              title={t('labels.emptyTitle')}
              description={t('labels.emptyDescription')}
            />
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
                      placeholder={t('labels.renamePlaceholder')}
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
                          title={t('common.save')}
                        >
                          <Check size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleEditCancel}
                          className="text-text-secondary hover:text-text-primary"
                          title={t('common.cancel')}
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
                          title={t('common.edit')}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLabelClick(label.id)}
                          className="text-danger hover:text-danger"
                          title={t('common.delete')}
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
        title={t('labels.deleteDialog.title')}
        description={t('labels.deleteDialog.description')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
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
