import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { Label, CustomField } from '../../shared/types'
import { Button } from '../../components/ui/button'
import EntryForm from '../../components/entries/EntryForm'

export default function EntryCreate() {
  const navigate = useNavigate()
  const [entryType, setEntryType] = useState('login')
  const [name, setName] = useState('')
  const [typedValue, setTypedValue] = useState<Record<string, any>>({})
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
        console.error('ラベル読み込み失敗:', err)
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
      const customFieldsJson = customFields.length > 0
        ? JSON.stringify(customFields.map(f => ({ id: f.id, name: f.name, field_type: f.fieldType, value: f.value })))
        : undefined
      const id = await commands.createEntry(entryType, name, typedValueJson, notes || undefined, selectedLabelIds, customFieldsJson)

      // Save vault to file and push to S3
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }

      navigate(`/entries/${id}`)
    } catch (err) {
      alert(`アイテム作成失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">新規アイテム</h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/entries')}
        >
          キャンセル
        </Button>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? '作成中...' : '作成'}
        </Button>
      </div>

      {/* フォーム */}
      <div className="flex-1 overflow-y-auto p-3">
        <EntryForm
          mode="create"
          entryType={entryType}
          onEntryTypeChange={setEntryType}
          name={name}
          onNameChange={setName}
          typedValue={typedValue}
          onTypedValueChange={(key, value) => setTypedValue(prev => ({ ...prev, [key]: value }))}
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
