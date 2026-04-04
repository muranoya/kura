import { open } from '@tauri-apps/plugin-dialog'
import { AlertTriangle, FileUp, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import * as commands from '../../commands'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { ScrollArea } from '../../components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import type {
  ImportAction,
  ImportItemAction,
  ImportItemResult,
  ImportPreview,
  ImportPreviewItem,
  ImportResult,
} from '../../shared/types'

type Step = 'idle' | 'loading' | 'preview' | 'executing' | 'result'

const ENTRY_TYPE_LABELS: Record<string, string> = {
  login: 'ログイン',
  credit_card: 'クレジットカード',
  secure_note: 'セキュアノート',
  password: 'パスワード',
  software_license: 'ソフトウェアライセンス',
  bank: '銀行口座',
  ssh_key: 'SSH鍵',
  passkey: 'パスキー',
}

function getEntryTypeLabel(type_: string): string {
  return ENTRY_TYPE_LABELS[type_] ?? type_
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

export default function Import1puxDialog({ open: isOpen, onOpenChange, onImportComplete }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [itemActions, setItemActions] = useState<Map<string, ImportItemAction>>(new Map())
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleClose = () => {
    if (step === 'loading' || step === 'executing') return
    setStep('idle')
    setError('')
    setFilePath(null)
    setPreview(null)
    setItemActions(new Map())
    setResult(null)
    onOpenChange(false)
  }

  const handleSelectFile = async () => {
    setError('')
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: '1Password Export', extensions: ['1pux'] }],
      })
      if (!selected) return

      setStep('loading')
      setFilePath(selected)

      const previewData = (await commands.import1puxPreview(selected)) as unknown as ImportPreview
      setPreview(previewData)

      // Initialize actions from defaults
      const actions = new Map<string, ImportItemAction>()
      for (const item of previewData.items) {
        actions.set(item.source_id, {
          source_id: item.source_id,
          action: item.default_action,
          target_entry_type: item.target_entry_type,
        })
      }
      setItemActions(actions)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('idle')
    }
  }

  const handleExecute = async () => {
    if (!filePath || !preview) return
    setStep('executing')
    setError('')

    try {
      const actions = Array.from(itemActions.values())
      const resultData = (await commands.import1puxExecute(
        filePath,
        JSON.stringify(actions),
      )) as unknown as ImportResult
      setResult(resultData)
      setStep('result')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('preview')
    }
  }

  const handleResultClose = async () => {
    handleClose()
    // Save vault and sync after import
    try {
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      await commands.syncVaultIfConfigured()
    } catch {
      // Sync failure is non-critical
    }
    onImportComplete()
  }

  const updateItemAction = (sourceId: string, action: ImportAction) => {
    setItemActions((prev) => {
      const next = new Map(prev)
      const existing = next.get(sourceId)
      if (existing) {
        next.set(sourceId, { ...existing, action })
      }
      return next
    })
  }

  const setAllActions = (action: ImportAction) => {
    setItemActions((prev) => {
      const next = new Map(prev)
      for (const [id, existing] of next) {
        next.set(id, { ...existing, action })
      }
      return next
    })
  }

  const importCount = Array.from(itemActions.values()).filter(
    (a) => a.action === 'import' || (typeof a.action === 'object' && 'overwrite' in a.action),
  ).length

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {step === 'idle' && (
          <>
            <DialogHeader>
              <DialogTitle>1Passwordからインポート</DialogTitle>
              <DialogDescription>
                1Passwordからエクスポートした .1pux ファイルを選択してください。
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <FileUp className="h-12 w-12 text-text-secondary" />
              <Button onClick={handleSelectFile}>ファイルを選択</Button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </>
        )}

        {step === 'loading' && (
          <>
            <DialogHeader>
              <DialogTitle>1Passwordからインポート</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-text-secondary">ファイルを解析中...</p>
            </div>
          </>
        )}

        {step === 'preview' && preview && (
          <>
            <DialogHeader>
              <DialogTitle>インポートプレビュー</DialogTitle>
              <DialogDescription>
                {preview.source_account_name && `アカウント: ${preview.source_account_name} · `}
                {preview.source_vault_names.join(', ')}
              </DialogDescription>
            </DialogHeader>

            {/* Stats */}
            <div className="flex flex-wrap gap-2 py-2">
              <Badge>合計 {preview.stats.total_items} 件</Badge>
              {preview.stats.by_target_type.map(([type_, count]) => (
                <Badge key={type_} variant="secondary">
                  {getEntryTypeLabel(type_)} {count}
                </Badge>
              ))}
              {preview.stats.duplicate_count > 0 && (
                <Badge variant="destructive">重複 {preview.stats.duplicate_count} 件</Badge>
              )}
              {preview.stats.attachment_warning_count > 0 && (
                <Badge variant="muted">
                  添付ファイル警告 {preview.stats.attachment_warning_count} 件
                </Badge>
              )}
            </div>

            {/* Bulk actions */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">一括操作:</span>
              <Button variant="ghost" size="sm" onClick={() => setAllActions('import')}>
                全て取り込む
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAllActions('skip')}>
                全てスキップ
              </Button>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            {/* Item list */}
            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              <div className="space-y-1">
                {preview.items.map((item) => (
                  <PreviewItemRow
                    key={item.source_id}
                    item={item}
                    action={itemActions.get(item.source_id)?.action ?? 'skip'}
                    onActionChange={(action) => updateItemAction(item.source_id, action)}
                  />
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                キャンセル
              </Button>
              <Button onClick={handleExecute} disabled={importCount === 0}>
                {importCount} 件をインポート
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'executing' && (
          <>
            <DialogHeader>
              <DialogTitle>インポート実行中</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-text-secondary">エントリを作成しています...</p>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <DialogHeader>
              <DialogTitle>インポート完了</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <div className="flex flex-wrap gap-2">
                {result.created_count > 0 && (
                  <Badge variant="success">作成 {result.created_count} 件</Badge>
                )}
                {result.overwritten_count > 0 && (
                  <Badge variant="primary">上書き {result.overwritten_count} 件</Badge>
                )}
                {result.skipped_count > 0 && (
                  <Badge variant="muted">スキップ {result.skipped_count} 件</Badge>
                )}
                {result.error_count > 0 && (
                  <Badge variant="destructive">エラー {result.error_count} 件</Badge>
                )}
              </div>

              {result.labels_created.length > 0 && (
                <p className="text-sm text-text-secondary">
                  新規作成ラベル: {result.labels_created.join(', ')}
                </p>
              )}

              {result.error_count > 0 && (
                <ScrollArea className="max-h-40">
                  <div className="space-y-1">
                    {result.items
                      .filter((item: ImportItemResult) => !item.success)
                      .map((item: ImportItemResult) => (
                        <div
                          key={item.source_id}
                          className="flex items-center gap-2 text-sm text-danger"
                        >
                          <X className="h-3 w-3 shrink-0" />
                          <span>
                            {item.source_name}: {item.error}
                          </span>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleResultClose}>閉じる</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PreviewItemRow({
  item,
  action,
  onActionChange,
}: {
  item: ImportPreviewItem
  action: ImportAction
  onActionChange: (action: ImportAction) => void
}) {
  const hasDuplicates = item.duplicates.length > 0

  const actionValue =
    action === 'import' ? 'import' : action === 'skip' ? 'skip' : 'overwrite'

  const handleChange = (value: string) => {
    if (value === 'import') onActionChange('import')
    else if (value === 'skip') onActionChange('skip')
    else if (value.startsWith('overwrite:')) {
      const entryId = value.substring('overwrite:'.length)
      onActionChange({ overwrite: { existing_entry_id: entryId } })
    }
  }

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-bg-elevated">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.source_name}</span>
          {!item.source_category.is_direct_mapping && (
            <Badge variant="muted" className="text-[10px] px-1.5 py-0">
              {item.source_category.category_name}
            </Badge>
          )}
          {item.has_attachments && (
            <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span>{getEntryTypeLabel(item.target_entry_type)}</span>
          {hasDuplicates && (
            <span className="text-warning">
              重複: {item.duplicates[0].existing_entry_name}
              {item.duplicates[0].confidence === 'high' ? ' (高)' : item.duplicates[0].confidence === 'medium' ? ' (中)' : ' (低)'}
            </span>
          )}
        </div>
      </div>

      <Select value={actionValue} onValueChange={handleChange}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="import">取り込む</SelectItem>
          <SelectItem value="skip">スキップ</SelectItem>
          {item.duplicates.map((d) => (
            <SelectItem key={d.existing_entry_id} value={`overwrite:${d.existing_entry_id}`}>
              上書き: {d.existing_entry_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
