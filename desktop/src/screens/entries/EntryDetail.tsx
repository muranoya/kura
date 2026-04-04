import { ArrowLeft, Copy, Eye, EyeOff, Maximize2, Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate, useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import * as commands from '../../commands'
import TotpCustomFieldDisplay from '../../components/entries/TotpCustomFieldDisplay'
import { LargeTextDialog } from '../../components/ui/large-text-dialog'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { usePushError } from '../../contexts/ErrorContext'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { getEntryTypeLabel } from '../../shared/constants'
import type { Entry, Label } from '../../shared/types'

interface FieldDisplayProps {
  label: string
  value: string | null | undefined
  isPassword?: boolean
  isMasked?: boolean
  isUrl?: boolean
  onToggleMask?: () => void
}

function FieldDisplay({
  label,
  value,
  isPassword = false,
  isMasked = false,
  isUrl = false,
  onToggleMask,
}: FieldDisplayProps) {
  const [copied, setCopied] = useState(false)
  const [largeTextOpen, setLargeTextOpen] = useState(false)
  const isEmpty = !value

  const handleClick = async () => {
    if (isEmpty) return
    if (isUrl) {
      const { open } = await import('@tauri-apps/plugin-shell')
      open(value)
      return
    }
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
        isEmpty
          ? 'opacity-50'
          : 'cursor-pointer hover:bg-bg-elevated active:bg-bg-elevated/80'
      } ${copied ? 'bg-accent-subtle' : ''}`}
      onClick={handleClick}
      role={isEmpty ? undefined : 'button'}
      tabIndex={isEmpty ? undefined : 0}
      onKeyDown={isEmpty ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      <span className="text-xs text-text-secondary w-24 shrink-0">{label}</span>
      <span className={`text-sm flex-1 break-all ${
        isEmpty
          ? 'text-text-secondary italic'
          : isPassword && isMasked
            ? 'font-mono text-text-primary tracking-wider'
            : 'font-mono text-text-primary'
      }`}>
        {isEmpty
          ? '未設定'
          : isPassword && isMasked
            ? '•'.repeat(Math.max(8, value.length))
            : value}
      </span>
      {!isEmpty && isPassword && onToggleMask && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMask() }}
          className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          {isMasked ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      {!isEmpty && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setLargeTextOpen(true) }}
          className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          <Maximize2 size={14} />
        </button>
      )}
      {!isEmpty && isUrl && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          {copied ? <span className="text-xs text-success">コピーしました</span> : <Copy size={14} />}
        </button>
      )}
      {!isEmpty && (
        <LargeTextDialog
          open={largeTextOpen}
          onOpenChange={setLargeTextOpen}
          label={label}
          value={value}
        />
      )}
    </div>
  )
}

function SectionHeading({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 px-1">
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">{children}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-2xl font-bold text-text-primary mt-4 mb-2">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-xl font-bold text-text-primary mt-3 mb-2">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-lg font-bold text-text-primary mt-2 mb-2">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-text-primary mb-3 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-inside text-text-primary mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-inside text-text-primary mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="text-text-primary">{children}</li>,
  code: ({ inline, children }: { children?: ReactNode; inline?: boolean }) =>
    inline ? (
      <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-sm font-mono text-text-primary">
        {children}
      </code>
    ) : (
      <code className="block bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">
        {children}
      </code>
    ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-4 border-accent pl-3 py-1 text-text-secondary italic mb-3">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { children?: ReactNode; href?: string }) => (
    <a
      href={href}
      className="text-accent hover:text-accent-hover underline break-all"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-bold text-text-primary">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic text-text-primary">{children}</em>
  ),
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }: { children?: ReactNode }) => (
    <table className="border-collapse border border-border w-full mb-3 text-sm">{children}</table>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-bg-elevated">{children}</thead>
  ),
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="border border-border">{children}</tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border p-2 text-text-primary font-bold text-left">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border p-2 text-text-primary">{children}</td>
  ),
}

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pushError = usePushError()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [unmaskedFields, setUnmaskedFields] = useState<Set<string>>(new Set())
  const toggleFieldMask = (key: string) => {
    setUnmaskedFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    const load = async () => {
      if (id) {
        try {
          const data = await commands.getEntry(id)
          const labels = await commands.listLabels()
          setEntry(data)
          setAllLabels(labels)
        } catch (err) {
          console.error('Failed to load entry:', err)
        } finally {
          setLoading(false)
        }
      }
    }
    load()
  }, [id])

  if (loading) return <div className="p-6 text-center text-text-secondary">読み込み中...</div>
  if (!entry) return <div className="p-6 text-center text-danger">エントリが見つかりません</div>

  const v = entry.typedValue as Record<string, string | null>

  return (
    <div className="flex flex-col h-screen bg-bg-surface">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <button
          type="button"
          onClick={() => navigate('/entries')}
          className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <Badge variant="secondary" className="text-xs shrink-0">
          {getEntryTypeLabel(entry.entryType)}
        </Badge>
        <h1 className="text-sm font-semibold text-text-primary truncate flex-1">{entry.name}</h1>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/entries/${id}/edit`)} className="gap-1 h-7 text-xs">
            <Pencil size={13} />
            編集
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (confirm('このエントリを削除しますか？')) {
                commands.deleteEntry(id!).then(() => navigate('/entries')).catch((err) => pushError(`アイテム削除に失敗しました: ${err}`))
              }
            }}
            className="gap-1 h-7 text-xs"
          >
            <Trash2 size={13} />
            削除
          </Button>
          <SyncHeaderActions />
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* ラベル */}
        {entry.labels && entry.labels.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {entry.labels.map((labelId) => {
              const label = allLabels.find((l) => l.id === labelId)
              return label ? (
                <Badge key={labelId} variant="primary" className="text-xs">
                  {label.name}
                </Badge>
              ) : null
            })}
          </div>
        )}

        {/* ログイン情報 */}
        {entry.entryType === 'login' && (
          <>
            <SectionHeading>ログイン情報</SectionHeading>
            <div className="space-y-0.5">
              <FieldDisplay label="ユーザー名" value={v.username as string} />
              <FieldDisplay
                label="パスワード"
                value={v.password as string}
                isPassword={true}
                isMasked={!unmaskedFields.has('password')}
                onToggleMask={() => toggleFieldMask('password')}
              />
              <FieldDisplay label="URL" value={v.url as string} isUrl={true} />
            </div>
          </>
        )}

        {/* 銀行口座 */}
        {entry.entryType === 'bank' && (
          <>
            <SectionHeading>銀行口座</SectionHeading>
            <div className="space-y-0.5">
              <FieldDisplay label="銀行名" value={v.bank_name as string} />
              <FieldDisplay label="支店コード" value={v.branch_code as string} />
              <FieldDisplay label="種類" value={v.account_type as string} />
              <FieldDisplay label="口座名義" value={v.account_holder as string} />
              <FieldDisplay label="口座番号" value={v.account_number as string} />
              <FieldDisplay
                label="PIN"
                value={v.pin as string}
                isPassword={true}
                isMasked={!unmaskedFields.has('bank-pin')}
                onToggleMask={() => toggleFieldMask('bank-pin')}
              />
            </div>
          </>
        )}

        {/* SSH キー */}
        {entry.entryType === 'ssh_key' && (
          <>
            <SectionHeading>SSH キー</SectionHeading>
            <div className="space-y-0.5">
              <FieldDisplay label="秘密鍵" value={v.private_key as string} />
            </div>
          </>
        )}

        {/* セキュアノート */}
        {entry.entryType === 'secure_note' && (
          <>
            <SectionHeading>ノート</SectionHeading>
            {v.content ? (
              <div className="p-3 rounded-md bg-bg-elevated border border-border text-text-primary prose prose-invert max-w-none text-xs mt-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {v.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-text-secondary italic">未設定</div>
            )}
          </>
        )}

        {/* クレジットカード */}
        {entry.entryType === 'credit_card' && (
          <>
            <SectionHeading>クレジットカード</SectionHeading>
            <div className="space-y-0.5">
              <FieldDisplay label="カード名義" value={v.cardholder as string} />
              <FieldDisplay label="カード番号" value={v.number as string} />
              <FieldDisplay label="有効期限" value={v.expiry as string} />
              <FieldDisplay
                label="CVV"
                value={v.cvv as string}
                isPassword={true}
                isMasked={!unmaskedFields.has('cvv')}
                onToggleMask={() => toggleFieldMask('cvv')}
              />
              <FieldDisplay
                label="暗証番号"
                value={v.pin as string}
                isPassword={true}
                isMasked={!unmaskedFields.has('cc-pin')}
                onToggleMask={() => toggleFieldMask('cc-pin')}
              />
            </div>
          </>
        )}

        {/* パスワード */}
        {entry.entryType === 'password' && (
          <>
            <SectionHeading>パスワード情報</SectionHeading>
            <div className="space-y-0.5">
              <FieldDisplay label="ユーザー名" value={v.username as string} />
              <FieldDisplay
                label="パスワード"
                value={v.password as string}
                isPassword={true}
                isMasked={!unmaskedFields.has('password')}
                onToggleMask={() => toggleFieldMask('password')}
              />
            </div>
          </>
        )}

        {/* ソフトウェアライセンス */}
        {entry.entryType === 'software_license' && (
          <>
            <SectionHeading>ライセンス情報</SectionHeading>
            <div className="space-y-0.5">
              <FieldDisplay label="ライセンスキー" value={v.license_key as string} />
            </div>
          </>
        )}

        {/* カスタムフィールド */}
        {entry.customFields && entry.customFields.length > 0 && (
          <>
            <div className="space-y-0.5">
              {entry.customFields.map((field) =>
                field.fieldType === 'totp' ? (
                  <TotpCustomFieldDisplay
                    key={field.id}
                    label={field.name}
                    value={field.value}
                  />
                ) : (
                  <FieldDisplay
                    key={field.id}
                    label={field.name}
                    value={field.value}
                    isPassword={field.fieldType === 'password'}
                    isMasked={field.fieldType === 'password' && !unmaskedFields.has(field.id)}
                    onToggleMask={
                      field.fieldType === 'password'
                        ? () => toggleFieldMask(field.id)
                        : undefined
                    }
                  />
                )
              )}
            </div>
          </>
        )}

        {/* メモ */}
        {entry.notes && (
          <>
            <SectionHeading>メモ</SectionHeading>
            <div className="p-3 rounded-md bg-bg-elevated border border-border text-text-primary text-xs whitespace-pre-wrap break-words mt-1">
              {entry.notes}
            </div>
          </>
        )}

        {/* タイムスタンプ */}
        <div className="mt-6 pt-3 border-t border-border space-y-0.5 text-xs text-text-secondary">
          {entry.updatedAt > 0 && (
            <div>更新: {formatTimestamp(entry.updatedAt)}</div>
          )}
          {entry.createdAt > 0 && (
            <div>作成: {formatTimestamp(entry.createdAt)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
