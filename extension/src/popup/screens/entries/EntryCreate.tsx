import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { CustomField, Label } from '../../../shared/types'
import * as commands from '../../commands'
import EntryForm from '../../components/entries/EntryForm'
import EntryTypeSelectDialog from '../../components/entries/EntryTypeSelectDialog'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'
import { usePushError } from '../../contexts/ErrorContext'

export default function EntryCreate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pushError = usePushError()
  const [showTypeDialog, setShowTypeDialog] = useState(true)
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
      alert(t('entries.create.nameRequired'))
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
      navigate('/entries', { state: { selectedId: id } })
    } catch (err) {
      pushError(t('entries.create.createFailed', { error: String(err) }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <EntryTypeSelectDialog
        open={showTypeDialog}
        onSelect={(type) => {
          setEntryType(type)
          setShowTypeDialog(false)
        }}
        onCancel={() => navigate('/entries')}
      />

      <PageHeader
        title={t('entries.create.title')}
        showBackButton={true}
        action={
          <Button size="sm" onClick={handleCreate} disabled={loading || !name} className="text-sm">
            {loading ? t('entries.create.creating') : t('entries.create.createButton')}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3">
        <EntryForm
          entryType={entryType}
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
            const labelId = await commands.createLabel(name)
            const newLabel: Label = { id: labelId, name }
            setAllLabels((prev) => [...prev, newLabel])
            return newLabel
          }}
        />
      </div>
    </div>
  )
}
