import { Check, Edit2, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as commands from '../../commands'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/layout/EmptyState'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Separator } from '../../components/ui/separator'

export default function LabelManager() {
  const { t } = useTranslation()
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([])
  const [newLabelName, setNewLabelName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [selectedDeleteId, setSelectedDeleteId] = useState<string | null>(null)

  const loadLabels = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await commands.listLabels()
      setLabels(result)
    } catch (err) {
      setError(String(err) || t('labels.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadLabels()
  }, [loadLabels])

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) {
      setError(t('labels.nameRequired'))
      return
    }

    setCreating(true)
    setError('')
    try {
      const newLabelId = await commands.createLabel(newLabelName)
      setLabels([...labels, { id: newLabelId, name: newLabelName }])
      setNewLabelName('')
    } catch (err) {
      setError(String(err) || t('labels.createFailed'))
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
      setError(t('labels.nameRequired'))
      return
    }

    setError('')
    try {
      await commands.renameLabel(id, editingName)
      setLabels((prev) =>
        prev.map((label) => (label.id === id ? { ...label, name: editingName } : label)),
      )
      setEditingId(null)
      setEditingName('')
    } catch (err) {
      setError(String(err) || t('labels.updateFailed'))
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
      setError(String(err) || t('labels.deleteFailed'))
    }
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <PageHeader title={t('labels.headerTitle')} showBackButton={true} />

      <div className="p-4">
        {error && (
          <div className="p-3 rounded-md bg-danger/10 border border-danger/20 mb-4">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <section>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
            {t('labels.newLabelSection')}
          </h2>
          <div className="space-y-1">
            <Label htmlFor="new-label-name" className="text-sm">
              {t('labels.newLabelNameLabel')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="new-label-name"
                type="text"
                placeholder={t('labels.newLabelNamePlaceholder')}
                value={newLabelName}
                onChange={(e) => {
                  setNewLabelName(e.target.value)
                  setError('')
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateLabel()}
                disabled={creating}
                className="flex-1 text-sm"
              />
              <Button
                onClick={handleCreateLabel}
                disabled={creating || !newLabelName.trim()}
                className="text-sm gap-1"
                size="sm"
              >
                <Plus size={14} />
                {t('labels.addButton')}
              </Button>
            </div>
          </div>
        </section>

        <Separator className="my-4" />

        {loading ? (
          <div className="text-center py-8 text-text-muted text-sm">{t('common.loading')}</div>
        ) : labels.length === 0 ? (
          <EmptyState title={t('labels.empty')} description={t('labels.emptyDescription')} />
        ) : (
          <section>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1 mb-2">
              {t('labels.listSection')}
            </h2>
            <div className="space-y-2">
              {labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center gap-2 p-2 rounded-md border border-border bg-white"
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
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t('labels.deleteDialogTitle')}
        description={t('labels.deleteDialogDesc')}
        confirmText={t('labels.deleteButton')}
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
