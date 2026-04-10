import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isDevModeEnabled,
  setDevModeEnabled,
  setDevModePatterns,
  validatePatterns,
} from '../../../shared/dev-mode'
import type { DevModeDebugReport, DevModeFieldReport } from '../../../shared/dev-mode-types'
import type { SitePattern } from '../../../shared/pattern-types'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/button'

interface TabInfo {
  id: number
  title: string
  url: string
}

export default function DevMode() {
  const [enabled, setEnabled] = useState(false)
  const [patterns, setPatterns] = useState<SitePattern[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null)
  const [report, setReport] = useState<DevModeDebugReport | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    isDevModeEnabled().then(setEnabled)
  }, [])

  const refreshTabs = useCallback(async () => {
    const allTabs = await chrome.tabs.query({})
    const tabInfos: TabInfo[] = allTabs
      .filter(
        (t) =>
          t.id &&
          t.url &&
          !t.url.startsWith('chrome://') &&
          !t.url.startsWith('chrome-extension://'),
      )
      .map((t) => ({ id: t.id ?? 0, title: t.title || '', url: t.url || '' }))
    setTabs(tabInfos)
    if (tabInfos.length > 0 && !selectedTabId) {
      setSelectedTabId(tabInfos[0].id)
    }
  }, [selectedTabId])

  useEffect(() => {
    if (enabled) refreshTabs()
  }, [enabled, refreshTabs])

  const handleToggle = async () => {
    const newEnabled = !enabled
    await setDevModeEnabled(newEnabled)
    setEnabled(newEnabled)
    if (!newEnabled) {
      setPatterns(null)
      setReport(null)
      setLoadError(null)
      chrome.runtime.sendMessage({ type: 'DEV_MODE_DISABLED' })
    }
  }

  const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoadError(null)
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const validated = validatePatterns(json)
      setPatterns(validated)
      await setDevModePatterns(validated)
      chrome.runtime.sendMessage({ type: 'DEV_MODE_PATTERNS_UPDATED' })
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
      setPatterns(null)
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClearPatterns = async () => {
    setPatterns(null)
    setLoadError(null)
    await setDevModePatterns(null)
    chrome.runtime.sendMessage({ type: 'DEV_MODE_PATTERNS_UPDATED' })
  }

  const handleInspect = async () => {
    if (!selectedTabId) return
    setInspecting(true)
    setInspectError(null)
    setReport(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DEV_MODE_DRY_RUN_TAB',
        tabId: selectedTabId,
      })
      if (response?.success && response.report) {
        setReport(response.report)
      } else {
        setInspectError(response?.error || 'Content Scriptからの応答なし')
      }
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : String(err))
    } finally {
      setInspecting(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="開発者モード" />

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">パターンDBテストモード</span>
          <button
            type="button"
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              enabled ? 'bg-accent' : 'bg-bg-elevated border border-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm ${
                enabled ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <>
            {/* Pattern loader */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                カスタムパターン
              </h3>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover active:scale-95">
                  ファイル選択
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileLoad}
                    className="hidden"
                  />
                </label>
                {patterns && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleClearPatterns}
                    className="text-xs px-3 py-1.5"
                  >
                    クリア
                  </Button>
                )}
              </div>

              {loadError && (
                <div className="rounded bg-danger/10 p-2 text-xs text-danger whitespace-pre-wrap max-h-20 overflow-y-auto">
                  {loadError}
                </div>
              )}

              {patterns && (
                <div className="rounded bg-accent-subtle p-2 text-xs space-y-0.5">
                  <p className="font-medium text-accent">{patterns.length} 件読み込み済み</p>
                  {patterns.map((p) => (
                    <p
                      key={`${p.match.type}-${p.match.value}`}
                      className="text-text-secondary font-mono"
                    >
                      {p.match.type}: {p.match.value}
                      {p.match.strict_subdomain ? ' (strict)' : ''}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-xs text-text-muted">
                メモリ上にのみ保持。ブラウザ再起動でクリアされます。
              </p>
            </section>

            {/* Debug panel */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                デバッグ
              </h3>

              <div className="flex items-center gap-2">
                <select
                  value={selectedTabId ?? ''}
                  onChange={(e) => setSelectedTabId(Number(e.target.value))}
                  className="flex-1 rounded border border-border bg-bg-surface px-2 py-1.5 text-xs truncate"
                >
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title || tab.url}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={refreshTabs}
                  className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs hover:bg-bg-elevated/80"
                  title="タブ更新"
                >
                  ↻
                </button>
                <Button
                  size="sm"
                  onClick={handleInspect}
                  disabled={!selectedTabId || inspecting}
                  className="text-xs px-3 py-1.5"
                >
                  {inspecting ? '...' : 'Inspect'}
                </Button>
              </div>

              {inspectError && (
                <div className="rounded bg-danger/10 p-2 text-xs text-danger">{inspectError}</div>
              )}

              {report && <DebugReportView report={report} />}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ========== Debug report display ==========

function DebugReportView({ report }: { report: DevModeDebugReport }) {
  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="rounded bg-bg-elevated p-2 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <MatchBadge type={report.matchType} />
          <span className="text-xs text-text-muted">src: {report.patternSource}</span>
        </div>
        <p className="text-xs font-mono text-text-secondary truncate" title={report.url}>
          {report.url}
        </p>
        {report.matchedPatternValue && (
          <p className="text-xs text-text-secondary">
            <span className="font-mono">{report.matchedPatternValue}</span>
            {report.matchedPatternDescription && (
              <span className="text-text-muted ml-1">— {report.matchedPatternDescription}</span>
            )}
          </p>
        )}
      </div>

      {/* Forms */}
      {report.forms.length === 0 ? (
        <p className="text-xs text-text-muted">フォーム未検出</p>
      ) : (
        report.forms.map((form) => <FormView key={form.formId || form.formType} form={form} />)
      )}
    </div>
  )
}

function MatchBadge({ type }: { type: string }) {
  const cls: Record<string, string> = {
    domain: 'bg-accent text-white',
    domain_suffix: 'bg-accent-subtle text-accent',
    heuristic: 'bg-bg-elevated text-text-primary border border-border',
    none: 'bg-danger/10 text-danger',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls[type] || cls.none}`}
    >
      {type}
    </span>
  )
}

function FormView({ form }: { form: DevModeDebugReport['forms'][0] }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded border border-border text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:bg-bg-elevated/50"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-semibold">{form.formType}</span>
          {form.formId && <span className="text-text-muted font-mono">({form.formId})</span>}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              form.detectionMethod === 'pattern'
                ? 'bg-accent-subtle text-accent'
                : 'bg-bg-elevated text-text-secondary'
            }`}
          >
            {form.detectionMethod}
          </span>
        </div>
        <span className="text-text-muted text-[10px]">{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="border-t border-border px-2 py-1.5 space-y-1">
          {form.fields.map((field) => (
            <FieldRow
              key={`${field.type}-${field.element.tagName}-${field.element.id}-${field.element.name}`}
              field={field}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldRow({ field }: { field: DevModeFieldReport }) {
  const [showScores, setShowScores] = useState(false)
  const isMatched = field.selectorMatched !== false && field.element.tagName !== ''

  return (
    <div className={isMatched ? '' : 'opacity-50'}>
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold w-16 shrink-0">{field.type}</span>
        <span className="font-mono text-text-muted w-6 text-right shrink-0">{field.score}</span>

        {/* Element info */}
        <span className="font-mono text-text-secondary truncate flex-1" title={field.selector}>
          {field.element.id
            ? `#${field.element.id}`
            : field.element.name
              ? `[name="${field.element.name}"]`
              : field.element.tagName?.toLowerCase() || '-'}
          {field.element.autocomplete && ` ac=${field.element.autocomplete}`}
        </span>

        {/* Status */}
        {field.selectorMatched === true && <StatusDot color="success" label="match" />}
        {field.selectorMatched === false && <StatusDot color="danger" label="miss" />}
        {field.selectorMatched == null && field.element.visible && (
          <StatusDot color="success" label="vis" />
        )}
        {field.selectorMatched == null && !field.element.visible && field.element.tagName && (
          <StatusDot color="danger" label="hid" />
        )}

        {/* Score detail toggle */}
        {field.allScores && Object.keys(field.allScores).length > 0 && (
          <button
            type="button"
            onClick={() => setShowScores(!showScores)}
            className="text-accent hover:underline shrink-0"
          >
            {showScores ? '−' : '+'}
          </button>
        )}
      </div>

      {showScores && field.allScores && (
        <div className="flex flex-wrap gap-1 pl-24 mt-0.5">
          {Object.entries(field.allScores)
            .sort(([, a], [, b]) => b - a)
            .map(([type, score]) => (
              <span
                key={type}
                className={`font-mono rounded px-1 py-0.5 text-[10px] ${
                  type === field.type
                    ? 'bg-accent-subtle text-accent font-semibold'
                    : 'bg-bg-elevated text-text-muted'
                }`}
              >
                {type}={score}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}

function StatusDot({ color, label }: { color: 'success' | 'danger'; label: string }) {
  const cls = color === 'success' ? 'text-success' : 'text-danger'
  return <span className={`text-[10px] font-medium shrink-0 ${cls}`}>{label}</span>
}
