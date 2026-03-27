import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as commands from '../../commands'
import { Entry, Label } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Copy, Eye, EyeOff, Trash2, Pencil } from 'lucide-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { getEntryTypeLabel } from '../../../shared/constants'
import { getTypeLabel } from '../../components/entries/EntryCard'

interface FieldDisplayProps {
  label: string
  value: string
  isPassword?: boolean
  isMasked?: boolean
  onToggleMask?: () => void
}

function FieldDisplay({ label, value, isPassword = false, isMasked = false, onToggleMask }: FieldDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-0.5">
      <label className="text-sm font-semibold text-text-muted uppercase">{label}</label>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-elevated border border-border">
        <code className="font-mono text-sm text-text-primary flex-1 break-all">
          {isPassword && isMasked ? '••••••••' : value}
        </code>
        {isPassword && onToggleMask && (
          <button onClick={onToggleMask} className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0">
            {isMasked ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button onClick={handleCopy} className="p-1 text-text-muted hover:text-accent transition-colors shrink-0" title="コピー">
          {copied ? <span className="text-sm text-success">✓</span> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

const markdownComponents = {
  h1: ({ children }: any) => <h1 className="text-lg font-bold text-text-primary mt-2 mb-1">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-bold text-text-primary mt-1.5 mb-1">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-bold text-text-primary mt-1 mb-0.5">{children}</h3>,
  p: ({ children }: any) => <p className="text-text-primary mb-1 text-sm leading-tight">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside text-text-primary mb-1 space-y-0.5 text-sm">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside text-text-primary mb-1 space-y-0.5 text-sm">{children}</ol>,
  li: ({ children }: any) => <li className="text-text-primary text-sm">{children}</li>,
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="bg-bg-elevated px-1 py-0.5 rounded text-sm font-mono text-text-primary">{children}</code>
    ) : (
      <code className="block bg-bg-elevated p-2 rounded text-sm font-mono text-text-primary overflow-x-auto mb-1">{children}</code>
    ),
  pre: ({ children }: any) => <pre className="bg-bg-elevated p-2 rounded text-sm font-mono text-text-primary overflow-x-auto mb-1">{children}</pre>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-accent pl-2 py-0.5 text-text-secondary italic mb-1 text-sm">{children}</blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href} className="text-accent hover:text-accent-hover underline break-all text-sm" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }: any) => <strong className="font-bold text-text-primary">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-text-primary">{children}</em>,
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

  const handleDelete = async () => {
    if (!id) return
    if (confirm('このエントリを削除しますか？')) {
      try {
        await commands.deleteEntry(id)
        navigate('/entries')
      } catch (err) {
        alert(String(err) || 'Failed to delete entry')
      }
    }
  }

  if (loading) return <PageHeader title="読み込み中..." size="compact" showBackButton={true} />
  if (!entry) return <PageHeader title="エントリが見つかりません" size="compact" showBackButton={true} />

  const v = entry.typedValue as Record<string, any>

  return (
    <div className="h-full overflow-y-auto pb-20">
      <PageHeader
        title={entry.name}
        subtitle={getTypeLabel(entry.entryType)}
        size="compact"
        showBackButton={true}
        onBack={() => navigate('/entries')}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => navigate(`/entries/${id}/edit`)} className="gap-1.5 text-sm h-8">
              <Pencil size={14} />
              編集
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} className="gap-1.5 text-sm h-8">
              <Trash2 size={14} />
              削除
            </Button>
          </div>
        }
      />

      <div className="p-3 space-y-2">

        {/* 基本情報 */}
        {entry.entryType === 'login' && (v.url || v.username || v.password || v.totp) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">ログイン情報</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-1.5">
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
              {v.totp && <FieldDisplay label="TOTP" value={v.totp} />}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'bank' && (v.bank_name || v.account_number || v.pin) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">銀行口座</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-1.5">
              {v.bank_name && <FieldDisplay label="銀行名" value={v.bank_name} />}
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

        {entry.entryType === 'ssh_key' && (v.private_key || v.passphrase) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">SSH キー</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-1.5">
              {v.private_key && <FieldDisplay label="秘密鍵" value={v.private_key} />}
              {v.passphrase && (
                <FieldDisplay
                  label="パスフレーズ"
                  value={v.passphrase}
                  isPassword={true}
                  isMasked={passwordMasked}
                  onToggleMask={() => setPasswordMasked(!passwordMasked)}
                />
              )}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'secure_note' && v.content && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">ノート</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2">
              <div className="p-2 rounded-md bg-bg-elevated border border-border text-text-primary text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {v.content}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'credit_card' && (v.cardholder || v.number || v.expiry || v.cvv) && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">クレジットカード</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-1.5">
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
            </CardContent>
          </Card>
        )}

        {/* カスタムフィールド */}
        {entry.customFields && entry.customFields.length > 0 && (
          <Card>
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm font-medium">カスタムフィールド</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2 space-y-1.5">
              {entry.customFields.map((field) => (
                <FieldDisplay
                  key={field.id}
                  label={field.name}
                  value={field.value}
                  isPassword={field.fieldType === 'password'}
                  isMasked={passwordMasked && field.fieldType === 'password'}
                  onToggleMask={field.fieldType === 'password' ? () => setPasswordMasked(!passwordMasked) : undefined}
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
              <div className="p-2 rounded-md bg-bg-elevated border border-border text-text-primary text-sm whitespace-pre-wrap break-words">
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
              <div className="flex gap-1.5 flex-wrap">
                {entry.labels.map((labelId) => {
                  const label = allLabels.find((l) => l.id === labelId)
                  return label ? (
                    <Badge key={labelId} variant="primary" className="text-sm">
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
