import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as commands from '../../commands'
import EntryForm from '../../components/entries/EntryForm'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Button } from '../../components/ui/button'
import type { CustomField, Entry, Label } from '../../shared/types'

export default function EntryEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState<string | null>(null)
  const [typedValue, setTypedValue] = useState<Record<string, string | null>>({})
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      if (id) {
        try {
          const data = await commands.getEntry(id)
          const labels = await commands.listLabels()
          setEntry(data)
          setName(data.name)
          setNotes(data.notes)
          setTypedValue(data.typedValue as Record<string, string | null>)
          setCustomFields(data.customFields || [])
          setSelectedLabelIds(data.labels || [])
          setAllLabels(labels)
        } catch (err) {
          setError(`アイテム読み込み失敗: ${err}`)
        } finally {
          setLoading(false)
        }
      }
    }
    load()
  }, [id])

  const handleSave = async () => {
    if (!name.trim()) {
      setError('名前を入力してください')
      return
    }

    setSaving(true)
    try {
      const typedValueJson = JSON.stringify(typedValue)
      const customFieldsJson = JSON.stringify(
        customFields.map((f) => ({
          id: f.id,
          name: f.name,
          field_type: f.fieldType,
          value: f.value,
        })),
      )
      await commands.updateEntry(
        id as string,
        name,
        typedValueJson,
        notes || undefined,
        selectedLabelIds,
        customFieldsJson,
      )
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      // S3に同期（バックグラウンド）
      commands.syncVaultIfConfigured().catch((e) => console.warn('Sync failed:', e))
      navigate('/entries', { state: { selectedId: id } })
    } catch (err) {
      setError(`保存失敗: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-text-secondary">
        読み込み中...
      </div>
    )
  if (!entry)
    return (
      <div className="flex items-center justify-center h-screen text-danger">
        アイテムが見つかりません
      </div>
    )

  return (
    <div className="flex flex-col h-screen bg-bg-surface">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">アイテム編集</h1>
        <SyncHeaderActions />
      </div>

      {/* フォーム */}
      <div className="flex-1 overflow-y-auto p-3">
        <EntryForm
          entryType={entry.entryType}
          name={name}
          onNameChange={setName}
          typedValue={typedValue}
          onTypedValueChange={(key, value) => setTypedValue((prev) => ({ ...prev, [key]: value }))}
          notes={notes}
          onNotesChange={setNotes}
          customFields={customFields}
          onCustomFieldsChange={setCustomFields}
          allLabels={allLabels}
          selectedLabelIds={selectedLabelIds}
          onSelectedLabelIdsChange={setSelectedLabelIds}
          onCreateLabel={async (name) => {
            const label = await commands.createLabel(name)
            setAllLabels((prev) => [...prev, label])
            return label
          }}
          error={error}
        />
      </div>

      {/* sticky bottom ボタンバー */}
      <div className="shrink-0 sticky bottom-0 flex justify-end gap-2 px-3 py-2 border-t border-border bg-bg-surface">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/entries', { state: { selectedId: id } })}
        >
          キャンセル
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  )
}
