import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import EntryForm from '../../components/entries/EntryForm'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import type { CustomField, Label } from '../../shared/types'

export default function EntryCreate() {
  const navigate = useNavigate()
  const [entryType, setEntryType] = useState('login')
  const [name, setName] = useState('')
  const [typedValue, setTypedValue] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<string | null>(null)
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const labels = await commands.listLabels()
        setAllLabels(labels)
      } catch (err) {
        console.error('Failed to load labels:', err)
      }
    }
    load()
  }, [])

  const handleCreate = async () => {
    if (!name) {
      alert('名前を入力してください')
      return
    }

    setLoading(true)
    try {
      const typedValueJson = JSON.stringify(typedValue)
      const customFieldsJson =
        customFields.length > 0
          ? JSON.stringify(
              customFields.map((f) => ({
                id: f.id,
                name: f.name,
                field_type: f.fieldType,
                value: f.value,
              })),
            )
          : undefined
      const id = await commands.createEntry(
        entryType,
        name,
        typedValueJson,
        notes || undefined,
        selectedLabelIds,
        customFieldsJson,
      )
      navigate(`/entries/${id}`)
    } catch (err) {
      alert(`アイテム作成失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <PageHeader
        title="新規アイテム"
        showBackButton={true}
        action={
          <Button size="sm" onClick={handleCreate} disabled={loading || !name} className="text-sm">
            {loading ? '作成中...' : '作成'}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3">
        <EntryForm
          mode="create"
          entryType={entryType}
          onEntryTypeChange={setEntryType}
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
