import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { CustomField, Entry, Label } from '../../../shared/types'
import * as commands from '../../commands'
import EntryForm from '../../components/entries/EntryForm'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'

/** camelCase(CustomField[]) → vault-core永続化用のsnake_case JSON文字列 */
function toCustomFieldsJson(customFields: CustomField[]): string {
  return JSON.stringify(
    customFields.map((f) => ({
      id: f.id,
      name: f.name,
      field_type: f.fieldType,
      value: f.value,
      autofill_selector: f.autofillSelector,
    })),
  )
}

export default function EntryEdit() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState<string | null>(null)
  const [typedValue, setTypedValue] = useState<Record<string, string>>({})
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
          setTypedValue(data.typedValue as Record<string, string>)
          setCustomFields(data.customFields || [])
          setSelectedLabelIds(data.labels || [])
          setAllLabels(labels)
        } catch (err) {
          setError(t('entries.edit.loadFailed', { error: String(err) }))
        } finally {
          setLoading(false)
        }
      }
    }
    load()
  }, [id, t])

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('entries.edit.nameRequired'))
      return
    }

    setSaving(true)
    setError('')
    try {
      const typedValueJson = JSON.stringify(typedValue)
      const customFieldsJson = toCustomFieldsJson(customFields)
      if (!id) return
      await commands.updateEntry(
        id,
        name,
        typedValueJson,
        notes ?? undefined,
        selectedLabelIds,
        customFieldsJson,
      )
      navigate('/entries', { state: { selectedId: id } })
    } catch (err) {
      setError(t('entries.edit.saveFailed', { error: String(err) }))
    } finally {
      setSaving(false)
    }
  }

  const handleScanTotpQr = async (fieldId: string) => {
    if (!id) return
    if (!name.trim()) {
      setError(t('entries.edit.nameRequired'))
      throw new Error(t('entries.edit.nameRequired'))
    }
    setError('')
    const typedValueJson = JSON.stringify(typedValue)
    const customFieldsJson = toCustomFieldsJson(customFields)
    await commands.updateEntry(
      id,
      name,
      typedValueJson,
      notes ?? undefined,
      selectedLabelIds,
      customFieldsJson,
    )
    await commands.startTotpQrScan(id, fieldId)
    window.close()
  }

  const handleStartPicker = async (fieldId: string) => {
    if (!id) return
    if (!name.trim()) {
      setError(t('entries.edit.nameRequired'))
      throw new Error(t('entries.edit.nameRequired'))
    }
    setError('')
    // ピッカー起動前に編集中の内容を保存しておく（TOTP QRスキャンと同じ理由:
    // ピッカーはpopupを閉じて対象ページをクリックする操作のため、popupの
    // フォーム状態は失われる）。ピッカーの選択結果自体はService Worker側で
    // 直接 api_update_entry により永続化される（popup状態を経由しない）。
    // 詳細: docs/extension-custom-field-autofill.md 4-3節
    const typedValueJson = JSON.stringify(typedValue)
    const customFieldsJson = toCustomFieldsJson(customFields)
    await commands.updateEntry(
      id,
      name,
      typedValueJson,
      notes ?? undefined,
      selectedLabelIds,
      customFieldsJson,
    )
    await commands.startPicker(id, fieldId)
    window.close()
  }

  if (loading) return <PageHeader title={t('common.loading')} showBackButton={true} />
  if (!entry) return <PageHeader title={t('entries.edit.notFound')} showBackButton={true} />

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <PageHeader
        title={t('entries.edit.title')}
        showBackButton={true}
        action={
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="text-sm"
          >
            {saving ? t('entries.edit.saving') : t('entries.edit.saveButton')}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="mb-3 p-2 bg-danger/10 text-danger text-sm rounded-md">{error}</div>
        )}
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
          entryId={id}
          onScanTotpQr={handleScanTotpQr}
          onStartPicker={handleStartPicker}
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
