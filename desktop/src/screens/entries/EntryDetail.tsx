import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as commands from '../../commands'
import { Entry, Label } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Separator } from '../../components/ui/separator'
import { ArrowLeft, Copy, Eye, EyeOff } from 'lucide-react'
import { getEntryTypeLabel } from '../../shared/constants'

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
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-text-secondary">{label}</label>
      <div className="flex items-center gap-2 p-3 rounded-md bg-bg-elevated border border-border">
        <span className="font-mono text-sm text-text-primary flex-1 break-all">
          {isPassword && isMasked ? '•'.repeat(Math.max(8, value.length)) : value}
        </span>
        {isPassword && onToggleMask && (
          <button onClick={onToggleMask} className="p-1 text-text-muted hover:text-text-primary transition-colors">
            {isMasked ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
        <button onClick={handleCopy} className="p-1 text-text-muted hover:text-text-primary transition-colors">
          {copied ? <span className="text-xs text-success">✓</span> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}

const markdownComponents = {
  h1: ({ children }: any) => <h1 className="text-2xl font-bold text-text-primary mt-4 mb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-bold text-text-primary mt-3 mb-2">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-bold text-text-primary mt-2 mb-2">{children}</h3>,
  p: ({ children }: any) => <p className="text-text-primary mb-3 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc list-inside text-text-primary mb-3 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal list-inside text-text-primary mb-3 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-text-primary">{children}</li>,
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-sm font-mono text-text-primary">{children}</code>
    ) : (
      <code className="block bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">{children}</code>
    ),
  pre: ({ children }: any) => <pre className="bg-bg-elevated p-3 rounded text-sm font-mono text-text-primary overflow-x-auto mb-3">{children}</pre>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-accent pl-3 py-1 text-text-secondary italic mb-3">{children}</blockquote>
  ),
  a: ({ href, children }: any) => (
    <a href={href} className="text-accent hover:text-accent-hover underline break-all" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  strong: ({ children }: any) => <strong className="font-bold text-text-primary">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-text-primary">{children}</em>,
  hr: () => <hr className="border-border my-4" />,
  table: ({ children }: any) => (
    <table className="border-collapse border border-border w-full mb-3 text-sm">
      {children}
    </table>
  ),
  thead: ({ children }: any) => <thead className="bg-bg-elevated">{children}</thead>,
  tbody: ({ children }: any) => <tbody>{children}</tbody>,
  tr: ({ children }: any) => <tr className="border border-border">{children}</tr>,
  th: ({ children }: any) => <th className="border border-border p-2 text-text-primary font-bold text-left">{children}</th>,
  td: ({ children }: any) => <td className="border border-border p-2 text-text-primary">{children}</td>,
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

  const v = entry.typedValue as Record<string, any>

  return (
    <div className="min-h-screen bg-bg-base p-6">
      <div className="max-w-2xl">
        {/* ヘッダー */}
        <button
          onClick={() => navigate('/entries')}
          className="flex items-center gap-2 text-accent hover:text-accent-hover mb-6 transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">戻る</span>
        </button>

        {/* タイトル */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-text-primary mb-2">{entry.name}</h1>
          <Badge variant="secondary">{getEntryTypeLabel(entry.entryType)}</Badge>
        </div>

        {/* 基本情報 */}
        {entry.entryType === 'login' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">ログイン情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

        {entry.entryType === 'bank' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">銀行口座</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {v.bank_name && <FieldDisplay label="銀行名" value={v.bank_name} />}
              {v.account_number && <FieldDisplay label="口座番号" value={v.account_number} />}
              {v.pin && <FieldDisplay label="PIN" value={v.pin} isPassword={true} isMasked={passwordMasked} onToggleMask={() => setPasswordMasked(!passwordMasked)} />}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'ssh_key' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">SSH キー</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {v.private_key && <FieldDisplay label="秘密鍵" value={v.private_key} />}
              {v.passphrase && <FieldDisplay label="パスフレーズ" value={v.passphrase} isPassword={true} isMasked={passwordMasked} onToggleMask={() => setPasswordMasked(!passwordMasked)} />}
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'secure_note' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">ノート</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-3 rounded-md bg-bg-elevated border border-border text-text-primary prose prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {v.content}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {entry.entryType === 'credit_card' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">クレジットカード</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {v.cardholder && <FieldDisplay label="カード名義" value={v.cardholder} />}
              {v.number && <FieldDisplay label="カード番号" value={v.number} />}
              {v.expiry && <FieldDisplay label="有効期限" value={v.expiry} />}
              {v.cvv && <FieldDisplay label="CVV" value={v.cvv} isPassword={true} isMasked={passwordMasked} onToggleMask={() => setPasswordMasked(!passwordMasked)} />}
            </CardContent>
          </Card>
        )}

        {/* カスタムフィールド */}
        {entry.customFields && entry.customFields.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">カスタムフィールド</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">メモ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-3 rounded-md bg-bg-elevated border border-border text-text-primary text-sm whitespace-pre-wrap break-words">
                {entry.notes}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ラベル */}
        {entry.labels && entry.labels.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">ラベル</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {entry.labels.map(labelId => {
                  const label = allLabels.find(l => l.id === labelId)
                  return label ? <Badge key={labelId} variant="primary">{label.name}</Badge> : null
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* アクション */}
        <div className="flex gap-3">
          <Button onClick={() => navigate(`/entries/${id}/edit`)} className="flex-1">
            編集
          </Button>
          <Button variant="secondary" onClick={() => navigate('/entries')} className="flex-1">
            戻る
          </Button>
        </div>
      </div>
    </div>
  )
}
