import { ArrowLeft, Copy, Eye, EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate, useParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import * as commands from '../../commands'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { getEntryTypeLabel } from '../../shared/constants'
import type { Entry, Label } from '../../shared/types'

interface FieldDisplayProps {
  label: string
  value: string
  isPassword?: boolean
  isMasked?: boolean
  onToggleMask?: () => void
}

function FieldDisplay({
  label,
  value,
  isPassword = false,
  isMasked = false,
  onToggleMask,
}: FieldDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-bg-elevated border border-border">
        <span className="font-mono text-xs text-text-primary flex-1 break-all">
          {isPassword && isMasked ? '•'.repeat(Math.max(8, value.length)) : value}
        </span>
        {isPassword && onToggleMask && (
          <button
            type="button"
            onClick={onToggleMask}
            className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
          >
            {isMasked ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          {copied ? <span className="text-xs text-success">✓</span> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

const markdownComponents = {
  h1: ({ children }: { children: ReactNode }) => (
    <h1 className="text-2xl font-bold text-text-primary mt-4 mb-2">{children}</h1>
  ),
  h2: ({ children }: { children: ReactNode }) => (
    <h2 className="text-xl font-bold text-text-primary mt-3 mb-2">{children}</h2>
  ),
  h3: ({ children }: { children: ReactNode }) => (
    <h3 className="text-lg font-bold text-text-primary mt-2 mb-2">{children}</h3>
  ),
  p: ({ children }: { children: ReactNode }) => (
    <p className="text-text-primary mb-3 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children: ReactNode }) => (
    <ul className="list-disc list-inside text-text-primary mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children: ReactNode }) => (
    <ol className="list-decimal list-inside text-text-primary mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children: ReactNode }) => <li className="text-text-primary">{children}</li>,
  code: ({ inline, children }: { children: ReactNode; inline?: boolean }) =>
    inline ? (
      <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-sm font-mono text-text-primary">
        {children}
      </code>
    ) : (
      <code className="block bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">
        {children}
      </code>
    ),
  pre: ({ children }: { children: ReactNode }) => (
    <pre className="bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children: ReactNode }) => (
    <blockquote className="border-l-4 border-accent pl-3 py-1 text-text-secondary italic mb-3">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { children: ReactNode; href?: string }) => (
    <a
      href={href}
      className="text-accent hover:text-accent-hover underline break-all"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }: { children: ReactNode }) => (
    <strong className="font-bold text-text-primary">{children}</strong>
  ),
  em: ({ children }: { children: ReactNode }) => (
    <em className="italic text-text-primary">{children}</em>
  ),
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }: { children: ReactNode }) => (
    <table className="border-collapse border border-border w-full mb-3 text-sm">{children}</table>
  ),
  thead: ({ children }: { children: ReactNode }) => (
    <thead className="bg-bg-elevated">{children}</thead>
  ),
  tbody: ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children: ReactNode }) => (
    <tr className="border border-border">{children}</tr>
  ),
  th: ({ children }: { children: ReactNode }) => (
    <th className="border border-border p-2 text-text-primary font-bold text-left">{children}</th>
  ),
  td: ({ children }: { children: ReactNode }) => (
    <td className="border border-border p-2 text-text-primary">{children}</td>
  ),
}

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [passwordMasked, setPasswordMasked] = useState(true)

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
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
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
        <SyncHeaderActions />
      </div>

      {/* スクロール可能コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 編集ボタン */}
        <div className="flex justify-start mb-3">
          <Button size="sm" onClick={() => navigate(`/entries/${id}/edit`)}>
            編集
          </Button>
        </div>

        {/* 基本情報 */}
        {entry.entryType === 'login' && (v.url || v.username || v.password) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">ログイン情報</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              {v.url && <FieldDisplay label="URL" value={v.url} />}
              {v.username && <FieldDisplay label="ユーザー名" value={v.username} />}
              {v.password && (
                <FieldDisplay
                  label="パスワード"
                  value={v.password}
                  isPassword={true}
                  isMasked={passwordMasked}
                  onToggleMask={() => setPasswordMasked(!passwordMasked)}
                />
              )}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'bank' && (v.bank_name || v.branch_code || v.account_type || v.account_holder || v.account_number || v.pin) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">銀行口座</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              {v.bank_name && <FieldDisplay label="銀行名" value={v.bank_name} />}
              {v.branch_code && <FieldDisplay label="支店コード" value={v.branch_code} />}
              {v.account_type && <FieldDisplay label="種類" value={v.account_type} />}
              {v.account_holder && <FieldDisplay label="口座名義" value={v.account_holder} />}
              {v.account_number && <FieldDisplay label="口座番号" value={v.account_number} />}
              {v.pin && (
                <FieldDisplay
                  label="PIN"
                  value={v.pin}
                  isPassword={true}
                  isMasked={passwordMasked}
                  onToggleMask={() => setPasswordMasked(!passwordMasked)}
                />
              )}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'ssh_key' && v.private_key && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">SSH キー</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              <FieldDisplay label="秘密鍵" value={v.private_key} />
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'secure_note' && v.content && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">ノート</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2">
              <div className="p-3 rounded-md bg-bg-elevated border border-border text-text-primary prose prose-invert max-w-none text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {v.content}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'credit_card' && (v.cardholder || v.number || v.expiry || v.cvv || v.pin) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">クレジットカード</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              {v.cardholder && <FieldDisplay label="カード名義" value={v.cardholder} />}
              {v.number && <FieldDisplay label="カード番号" value={v.number} />}
              {v.expiry && <FieldDisplay label="有効期限" value={v.expiry} />}
              {v.cvv && (
                <FieldDisplay
                  label="CVV"
                  value={v.cvv}
                  isPassword={true}
                  isMasked={passwordMasked}
                  onToggleMask={() => setPasswordMasked(!passwordMasked)}
                />
              )}
              {v.pin && (
                <FieldDisplay
                  label="暗証番号"
                  value={v.pin}
                  isPassword={true}
                  isMasked={passwordMasked}
                  onToggleMask={() => setPasswordMasked(!passwordMasked)}
                />
              )}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'password' && (v.username || v.password) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">パスワード情報</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              {v.username && <FieldDisplay label="ユーザー名" value={v.username} />}
              {v.password && (
                <FieldDisplay
                  label="パスワード"
                  value={v.password}
                  isPassword={true}
                  isMasked={passwordMasked}
                  onToggleMask={() => setPasswordMasked(!passwordMasked)}
                />
              )}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'software_license' && v.license_key && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">ライセンス情報</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              <FieldDisplay label="ライセンスキー" value={v.license_key} />
            </CardContent>
          </Card>
        )}

        {/* カスタムフィールド */}
        {entry.customFields && entry.customFields.length > 0 && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">カスタムフィールド</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-2">
              {entry.customFields.map((field) => (
                <FieldDisplay
                  key={field.id}
                  label={field.name}
                  value={field.value}
                  isPassword={field.fieldType === 'password'}
                  isMasked={passwordMasked && field.fieldType === 'password'}
                  onToggleMask={
                    field.fieldType === 'password'
                      ? () => setPasswordMasked(!passwordMasked)
                      : undefined
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* メモ */}
        {entry.notes && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">メモ</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2">
              <div className="p-3 rounded-md bg-bg-elevated border border-border text-text-primary text-xs whitespace-pre-wrap break-words">
                {entry.notes}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ラベル */}
        {entry.labels && entry.labels.length > 0 && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">ラベル</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2">
              <div className="flex gap-2 flex-wrap">
                {entry.labels.map((labelId) => {
                  const label = allLabels.find((l) => l.id === labelId)
                  return label ? (
                    <Badge key={labelId} variant="primary" className="text-xs">
                      {label.name}
                    </Badge>
                  ) : null
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
