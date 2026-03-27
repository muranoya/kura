import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import * as commands from '../../commands'
import { Entry, Label, CustomField } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/layout/PageHeader'
import EntryForm from '../../components/entries/EntryForm'

export default function EntryEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState<string | null>(null)
  const [typedValue, setTypedValue] = useState<Record<string, any>>({})
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
          setTypedValue(data.typedValue)
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
    setError('')
    try {
      const typedValueJson = JSON.stringify(typedValue)
      const customFieldsJson = customFields.length > 0
        ? JSON.stringify(customFields.map((f) => ({ id: f.id, name: f.name, field_type: f.fieldType, value: f.value })))
        : undefined
      await commands.updateEntry(id!, name, typedValueJson, notes || undefined, selectedLabelIds, customFieldsJson)
      navigate(`/entries/${id}`)
    } catch (err) {
      setError(`保存失敗: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageHeader title="読み込み中..." showBackButton={true} />
  if (!entry) return <PageHeader title="アイテムが見つかりません" showBackButton={true} />

  return (
    <div className="h-full overflow-y-auto pb-20 flex flex-col">
      <PageHeader
        title="アイテム編集"
        showBackButton={true}
        action={
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="text-sm"
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3">
        {error && <div className="mb-3 p-2 bg-danger/10 text-danger text-sm rounded-md">{error}</div>}
        <EntryForm
          mode="edit"
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
        />
      </div>
    </div>
  )
}
