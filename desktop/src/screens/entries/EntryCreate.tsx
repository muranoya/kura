import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import EntryForm from '../../components/entries/EntryForm'
import EntryTypeSelectDialog from '../../components/entries/EntryTypeSelectDialog'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Button } from '../../components/ui/button'
import { usePushError } from '../../contexts/ErrorContext'
import type { CustomField, Label } from '../../shared/types'

export default function EntryCreate() {
  const navigate = useNavigate()
  const pushError = usePushError()
  const [showTypeDialog, setShowTypeDialog] = useState(true)
  const [entryType, setEntryType] = useState('login')
  const [name, setName] = useState('')
  const [typedValue, setTypedValue] = useState<Record<string, string | null>>({})
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

      // Save vault to file and sync to S3 (background)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      commands.syncVaultIfConfigured().catch((e) => console.warn('Sync failed:', e))

      navigate(`/entries/${id}`)
    } catch (err) {
      pushError(`アイテム作成失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-bg-surface">
      <EntryTypeSelectDialog
        open={showTypeDialog}
        onSelect={(type) => {
          setEntryType(type)
          setShowTypeDialog(false)
        }}
        onCancel={() => navigate('/entries')}
      />

      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">新規アイテム</h1>
        <SyncHeaderActions />
      </div>

      {/* フォーム */}
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
            const label = await commands.createLabel(name)
            setAllLabels((prev) => [...prev, label])
            return label
          }}
        />
      </div>

      {/* sticky ボタンバー */}
      <div className="shrink-0 sticky bottom-0 flex justify-end gap-2 px-3 py-2 border-t border-border bg-bg-surface">
        <Button variant="secondary" size="sm" onClick={() => navigate('/entries')}>
          キャンセル
        </Button>
        <Button size="sm" onClick={handleCreate} disabled={loading}>
          {loading ? '作成中...' : '作成'}
        </Button>
      </div>
    </div>
  )
}
