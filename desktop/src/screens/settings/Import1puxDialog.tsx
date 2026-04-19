import { open } from '@tauri-apps/plugin-dialog'
import { AlertTriangle, FileUp, Loader2, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Input } from '../../components/ui/input'
import { ScrollArea } from '../../components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { getEntryTypeLabel } from '../../shared/constants'
import type {
  DuplicateConfidence,
  ImportAction,
  ImportItemAction,
  ImportItemResult,
  ImportPreview,
  ImportPreviewItem,
  ImportResult,
} from '../../shared/types'

type Step = 'idle' | 'loading' | 'preview' | 'executing' | 'result'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

export default function Import1puxDialog({ open: isOpen, onOpenChange, onImportComplete }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [itemActions, setItemActions] = useState<Map<string, ImportItemAction>>(new Map())
  const [result, setResult] = useState<ImportResult | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [dupConfFilter, setDupConfFilter] = useState<DuplicateConfidence | 'none' | null>(null)
  const [archivedFilter, setArchivedFilter] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const dupConfCounts = useMemo(() => {
    if (!preview) return { high: 0, medium: 0, low: 0, none: 0 }
    let high = 0
    let medium = 0
    let low = 0
    let none = 0
    for (const item of preview.items) {
      if (item.duplicates.length === 0) {
        none++
        continue
      }
      if (item.duplicates.some((d) => d.confidence === 'high')) high++
      if (item.duplicates.some((d) => d.confidence === 'medium')) medium++
      if (item.duplicates.some((d) => d.confidence === 'low')) low++
    }
    return { high, medium, low, none }
  }, [preview])

  const filteredItems = useMemo(() => {
    if (!preview) return []
    return preview.items.filter((item) => {
      if (typeFilter && item.target_entry_type !== typeFilter) return false
      if (dupConfFilter === 'none' && item.duplicates.length > 0) return false
      if (
        dupConfFilter &&
        dupConfFilter !== 'none' &&
        !item.duplicates.some((d) => d.confidence === dupConfFilter)
      )
        return false
      if (archivedFilter && !item.is_archived) return false
      if (searchQuery) {
        if (!item.source_name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      }
      return true
    })
  }, [preview, typeFilter, dupConfFilter, archivedFilter, searchQuery])

  const clearFilters = () => {
    setTypeFilter(null)
    setDupConfFilter(null)
    setArchivedFilter(false)
    setSearchQuery('')
  }

  const handleClose = () => {
    if (step === 'loading' || step === 'executing') return
    setStep('idle')
    setError('')
    setFilePath(null)
    setPreview(null)
    setItemActions(new Map())
    setResult(null)
    clearFilters()
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

  const setFilteredActions = (action: ImportAction) => {
    const visibleIds = new Set(filteredItems.map((i) => i.source_id))
    setItemActions((prev) => {
      const next = new Map(prev)
      for (const [id, existing] of next) {
        if (visibleIds.has(id)) {
          next.set(id, { ...existing, action })
        }
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
              <DialogTitle>{t('import1pux.title')}</DialogTitle>
              <DialogDescription>{t('import1pux.description')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <FileUp className="h-12 w-12 text-text-secondary" />
              <Button onClick={handleSelectFile}>{t('import1pux.selectFile')}</Button>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </>
        )}

        {step === 'loading' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import1pux.title')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-text-secondary">{t('import1pux.parsing')}</p>
            </div>
          </>
        )}

        {step === 'preview' && preview && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import1pux.previewTitle')}</DialogTitle>
              <DialogDescription>
                {preview.source_account_name &&
                  t('import1pux.previewAccount', { account: preview.source_account_name })}
                {preview.source_vault_names.join(', ')}
              </DialogDescription>
            </DialogHeader>

            {/* Stats / Filter badges */}
            <div className="flex flex-wrap gap-2 py-2">
              <Badge
                className="cursor-pointer"
                variant={
                  typeFilter || dupConfFilter || archivedFilter || searchQuery
                    ? 'secondary'
                    : 'default'
                }
                onClick={clearFilters}
              >
                {t('import1pux.totalCount', { count: preview.stats.total_items })}
              </Badge>
              {preview.stats.by_target_type.map(([type_, count]) => (
                <Badge
                  key={type_}
                  className="cursor-pointer"
                  variant={typeFilter === type_ ? 'primary' : 'secondary'}
                  onClick={() => setTypeFilter((prev) => (prev === type_ ? null : type_))}
                >
                  {getEntryTypeLabel(type_)} {count}
                </Badge>
              ))}
              {dupConfCounts.none > 0 && (
                <Badge
                  className="cursor-pointer"
                  variant={dupConfFilter === 'none' ? 'primary' : 'secondary'}
                  onClick={() => setDupConfFilter((prev) => (prev === 'none' ? null : 'none'))}
                >
                  {t('import1pux.noDuplicates', { count: dupConfCounts.none })}
                </Badge>
              )}
              {dupConfCounts.high > 0 && (
                <Badge
                  className="cursor-pointer"
                  variant={dupConfFilter === 'high' ? 'primary' : 'destructive'}
                  onClick={() => setDupConfFilter((prev) => (prev === 'high' ? null : 'high'))}
                >
                  {t('import1pux.duplicatesHigh', { count: dupConfCounts.high })}
                </Badge>
              )}
              {dupConfCounts.medium > 0 && (
                <Badge
                  className="cursor-pointer"
                  variant={dupConfFilter === 'medium' ? 'primary' : 'destructive'}
                  onClick={() => setDupConfFilter((prev) => (prev === 'medium' ? null : 'medium'))}
                >
                  {t('import1pux.duplicatesMedium', { count: dupConfCounts.medium })}
                </Badge>
              )}
              {dupConfCounts.low > 0 && (
                <Badge
                  className="cursor-pointer"
                  variant={dupConfFilter === 'low' ? 'primary' : 'destructive'}
                  onClick={() => setDupConfFilter((prev) => (prev === 'low' ? null : 'low'))}
                >
                  {t('import1pux.duplicatesLow', { count: dupConfCounts.low })}
                </Badge>
              )}
              {preview.stats.archived_count > 0 && (
                <Badge
                  className="cursor-pointer"
                  variant={archivedFilter ? 'primary' : 'muted'}
                  onClick={() => setArchivedFilter((prev) => !prev)}
                >
                  {t('import1pux.archived', { count: preview.stats.archived_count })}
                </Badge>
              )}
              {preview.stats.attachment_warning_count > 0 && (
                <Badge variant="muted">
                  {t('import1pux.attachmentWarnings', {
                    count: preview.stats.attachment_warning_count,
                  })}
                </Badge>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <Input
                placeholder={t('import1pux.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-sm pl-8"
              />
            </div>

            {/* Bulk actions */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">{t('import1pux.bulkActions')}</span>
              <Button variant="ghost" size="sm" onClick={() => setFilteredActions('import')}>
                {t('import1pux.importAll')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFilteredActions('skip')}>
                {t('import1pux.skipAll')}
              </Button>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            {/* Item list */}
            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              <div className="space-y-1">
                {filteredItems.map((item) => (
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
                {t('common.cancel')}
              </Button>
              <Button onClick={handleExecute} disabled={importCount === 0}>
                {t('import1pux.importCount', { count: importCount })}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'executing' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import1pux.executingTitle')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-text-secondary">{t('import1pux.executingDescription')}</p>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import1pux.resultTitle')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <div className="flex flex-wrap gap-2">
                {result.created_count > 0 && (
                  <Badge variant="success">
                    {t('import1pux.createdCount', { count: result.created_count })}
                  </Badge>
                )}
                {result.overwritten_count > 0 && (
                  <Badge variant="primary">
                    {t('import1pux.overwrittenCount', { count: result.overwritten_count })}
                  </Badge>
                )}
                {result.skipped_count > 0 && (
                  <Badge variant="muted">
                    {t('import1pux.skippedCount', { count: result.skipped_count })}
                  </Badge>
                )}
                {result.error_count > 0 && (
                  <Badge variant="destructive">
                    {t('import1pux.errorCount', { count: result.error_count })}
                  </Badge>
                )}
              </div>

              {result.labels_created.length > 0 && (
                <p className="text-sm text-text-secondary">
                  {t('import1pux.labelsCreated', { labels: result.labels_created.join(', ') })}
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
              <Button onClick={handleResultClose}>{t('common.close')}</Button>
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
  const { t } = useTranslation()
  const hasDuplicates = item.duplicates.length > 0

  const actionValue = action === 'import' ? 'import' : action === 'skip' ? 'skip' : 'overwrite'

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
          {item.is_archived && (
            <Badge variant="muted" className="text-[10px] px-1.5 py-0">
              {t('import1pux.itemArchived')}
            </Badge>
          )}
          {!item.source_category.is_direct_mapping && (
            <Badge variant="muted" className="text-[10px] px-1.5 py-0">
              {item.source_category.category_name}
            </Badge>
          )}
          {item.has_attachments && <AlertTriangle className="h-3 w-3 text-warning shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span>{getEntryTypeLabel(item.target_entry_type)}</span>
          {hasDuplicates && (
            <span className="text-warning">
              {t('import1pux.duplicateRow', { name: item.duplicates[0].existing_entry_name })}
              {item.duplicates[0].confidence === 'high'
                ? t('import1pux.confidenceHigh')
                : item.duplicates[0].confidence === 'medium'
                  ? t('import1pux.confidenceMedium')
                  : t('import1pux.confidenceLow')}
            </span>
          )}
        </div>
      </div>

      <Select value={actionValue} onValueChange={handleChange}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="import">{t('import1pux.actions.import')}</SelectItem>
          <SelectItem value="skip">{t('import1pux.actions.skip')}</SelectItem>
          {item.duplicates.map((d) => (
            <SelectItem key={d.existing_entry_id} value={`overwrite:${d.existing_entry_id}`}>
              {t('import1pux.actions.overwrite', { name: d.existing_entry_name })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
