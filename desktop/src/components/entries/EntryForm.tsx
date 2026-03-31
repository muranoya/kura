import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getEntryTypeLabel } from '../../shared/constants'
import type { CustomField, CustomFieldType, Label } from '../../shared/types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label as UILabel } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import PasswordGeneratorPanel from './PasswordGeneratorPanel'

export interface EntryFormProps {
  mode: 'create' | 'edit'
  entryType: string
  onEntryTypeChange?: (type: string) => void
  name: string
  onNameChange: (name: string) => void
  typedValue: Record<string, string | null>
  onTypedValueChange: (key: string, value: string | null) => void
  notes: string | null
  onNotesChange: (notes: string) => void
  customFields: CustomField[]
  onCustomFieldsChange: (fields: CustomField[]) => void
  allLabels: Label[]
  selectedLabelIds: string[]
  onSelectedLabelIdsChange: (ids: string[]) => void
  error?: string
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

export default function EntryForm({
  mode,
  entryType,
  onEntryTypeChange,
  name,
  onNameChange,
  typedValue,
  onTypedValueChange,
  notes,
  onNotesChange,
  customFields,
  onCustomFieldsChange,
  allLabels,
  selectedLabelIds,
  onSelectedLabelIdsChange,
  error,
}: EntryFormProps) {
  const [secureNotePreviewMode, setSecureNotePreviewMode] = useState(false)
  const [activeGeneratorFieldId, setActiveGeneratorFieldId] = useState<string | null>(null)

  const updateTypedValue = useCallback(
    (key: string, value: string | null) => {
      onTypedValueChange(key, value)
    },
    [onTypedValueChange],
  )

  const addCustomField = useCallback(() => {
    const newField: CustomField = {
      id: Math.random().toString(36).substring(7),
      name: '',
      fieldType: 'text',
      value: '',
    }
    onCustomFieldsChange([...customFields, newField])
  }, [customFields, onCustomFieldsChange])

  const updateCustomField = useCallback(
    (fieldId: string, field: Partial<CustomField>) => {
      onCustomFieldsChange(customFields.map((f) => (f.id === fieldId ? { ...f, ...field } : f)))
    },
    [customFields, onCustomFieldsChange],
  )

  const deleteCustomField = useCallback(
    (fieldId: string) => {
      onCustomFieldsChange(customFields.filter((f) => f.id !== fieldId))
    },
    [customFields, onCustomFieldsChange],
  )

  const renderForm = useCallback(() => {
    const v = typedValue

    switch (entryType) {
      case 'login':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="url" className="text-xs">
                URL
              </UILabel>
              <Input
                id="url"
                value={v.url || ''}
                onChange={(e) => updateTypedValue('url', e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="username" className="text-xs">
                ユーザー名
              </UILabel>
              <Input
                id="username"
                value={v.username || ''}
                onChange={(e) => updateTypedValue('username', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="password" className="text-xs">
                パスワード
              </UILabel>
              <Input
                id="password"
                type="password"
                value={v.password || ''}
                onChange={(e) => updateTypedValue('password', e.target.value)}
                onFocus={() => setActiveGeneratorFieldId('password')}
                onBlur={() => setActiveGeneratorFieldId(null)}
              />
              {activeGeneratorFieldId === 'password' && (
                <div onMouseDown={(e) => e.preventDefault()}>
                  <PasswordGeneratorPanel
                    onUse={(pw) => {
                      updateTypedValue('password', pw)
                      setActiveGeneratorFieldId(null)
                    }}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="totp" className="text-xs">
                TOTP（オプション）
              </UILabel>
              <Input
                id="totp"
                value={v.totp || ''}
                onChange={(e) => updateTypedValue('totp', e.target.value)}
                placeholder="000000"
              />
            </div>
          </div>
        )
      case 'bank':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="bank_name" className="text-xs">
                銀行名
              </UILabel>
              <Input
                id="bank_name"
                value={v.bank_name || ''}
                onChange={(e) => updateTypedValue('bank_name', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="account_number" className="text-xs">
                口座番号
              </UILabel>
              <Input
                id="account_number"
                value={v.account_number || ''}
                onChange={(e) => updateTypedValue('account_number', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="pin" className="text-xs">
                PIN
              </UILabel>
              <Input
                id="pin"
                type="password"
                value={v.pin || ''}
                onChange={(e) => updateTypedValue('pin', e.target.value)}
                onFocus={() => setActiveGeneratorFieldId('pin')}
                onBlur={() => setActiveGeneratorFieldId(null)}
              />
              {activeGeneratorFieldId === 'pin' && (
                <div onMouseDown={(e) => e.preventDefault()}>
                  <PasswordGeneratorPanel
                    onUse={(pw) => {
                      updateTypedValue('pin', pw)
                      setActiveGeneratorFieldId(null)
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )
      case 'ssh_key':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="private_key" className="text-xs">
                秘密鍵
              </UILabel>
              <Textarea
                id="private_key"
                value={v.private_key || ''}
                onChange={(e) => updateTypedValue('private_key', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="passphrase" className="text-xs">
                パスフレーズ（オプション）
              </UILabel>
              <Input
                id="passphrase"
                type="password"
                value={v.passphrase || ''}
                onChange={(e) => updateTypedValue('passphrase', e.target.value)}
                onFocus={() => setActiveGeneratorFieldId('passphrase')}
                onBlur={() => setActiveGeneratorFieldId(null)}
              />
              {activeGeneratorFieldId === 'passphrase' && (
                <div onMouseDown={(e) => e.preventDefault()}>
                  <PasswordGeneratorPanel
                    onUse={(pw) => {
                      updateTypedValue('passphrase', pw)
                      setActiveGeneratorFieldId(null)
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )
      case 'secure_note':
        return (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <UILabel htmlFor="content" className="text-xs">
                  内容
                </UILabel>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSecureNotePreviewMode(false)}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      !secureNotePreviewMode
                        ? 'bg-accent text-text-primary'
                        : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecureNotePreviewMode(true)}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      secureNotePreviewMode
                        ? 'bg-accent text-text-primary'
                        : 'bg-bg-elevated text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    プレビュー
                  </button>
                </div>
              </div>
              {!secureNotePreviewMode ? (
                <Textarea
                  id="content"
                  value={v.content || ''}
                  onChange={(e) => updateTypedValue('content', e.target.value)}
                  className="min-h-40"
                />
              ) : (
                <div className="p-3 rounded-md bg-bg-elevated border border-border text-text-primary min-h-40 overflow-y-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {v.content || ''}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )
      case 'credit_card':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="cardholder" className="text-xs">
                カード名義
              </UILabel>
              <Input
                id="cardholder"
                value={v.cardholder || ''}
                onChange={(e) => updateTypedValue('cardholder', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="number" className="text-xs">
                カード番号
              </UILabel>
              <Input
                id="number"
                value={v.number || ''}
                onChange={(e) => updateTypedValue('number', e.target.value)}
                placeholder="1234 5678 9012 3456"
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="expiry" className="text-xs">
                有効期限
              </UILabel>
              <Input
                id="expiry"
                value={v.expiry || ''}
                onChange={(e) => updateTypedValue('expiry', e.target.value)}
                placeholder="MM/YY"
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="cvv" className="text-xs">
                CVV
              </UILabel>
              <Input
                id="cvv"
                type="password"
                value={v.cvv || ''}
                onChange={(e) => updateTypedValue('cvv', e.target.value)}
                placeholder="123"
                onFocus={() => setActiveGeneratorFieldId('cvv')}
                onBlur={() => setActiveGeneratorFieldId(null)}
              />
              {activeGeneratorFieldId === 'cvv' && (
                <div onMouseDown={(e) => e.preventDefault()}>
                  <PasswordGeneratorPanel
                    onUse={(pw) => {
                      updateTypedValue('cvv', pw)
                      setActiveGeneratorFieldId(null)
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )
      default:
        return null
    }
  }, [entryType, typedValue, updateTypedValue, secureNotePreviewMode, activeGeneratorFieldId])

  const renderCustomFields = useCallback(() => {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">カスタムフィールド</h3>
        {customFields.map((field) => (
          <Card key={field.id} className="p-2 space-y-1.5">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-0.5">
                <UILabel htmlFor={`field-type-${field.id}`} className="text-xs">
                  種類
                </UILabel>
                <Select
                  value={field.fieldType}
                  onValueChange={(value) =>
                    updateCustomField(field.id, { fieldType: value as CustomFieldType })
                  }
                >
                  <SelectTrigger id={`field-type-${field.id}`} className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">テキスト</SelectItem>
                    <SelectItem value="password">パスワード</SelectItem>
                    <SelectItem value="email">メール</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                    <SelectItem value="phone">電話番号</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-0.5">
                <UILabel htmlFor={`field-name-${field.id}`} className="text-xs">
                  フィールド名
                </UILabel>
                <Input
                  id={`field-name-${field.id}`}
                  value={field.name}
                  onChange={(e) => updateCustomField(field.id, { name: e.target.value })}
                  placeholder="例: セキュリティ質問"
                  className="h-8 text-xs"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteCustomField(field.id)}
                className="p-1 shrink-0 h-8"
              >
                <Trash2 size={14} />
              </Button>
            </div>
            <div className="space-y-0.5">
              <UILabel htmlFor={`field-value-${field.id}`} className="text-xs">
                値
              </UILabel>
              <Input
                id={`field-value-${field.id}`}
                type={field.fieldType === 'password' ? 'password' : 'text'}
                value={field.value}
                onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                className="h-8 text-xs"
                onFocus={() =>
                  field.fieldType === 'password' && setActiveGeneratorFieldId(`custom-${field.id}`)
                }
                onBlur={() => field.fieldType === 'password' && setActiveGeneratorFieldId(null)}
              />
              {field.fieldType === 'password' &&
                activeGeneratorFieldId === `custom-${field.id}` && (
                  <div onMouseDown={(e) => e.preventDefault()}>
                    <PasswordGeneratorPanel
                      onUse={(pw) => {
                        updateCustomField(field.id, { value: pw })
                        setActiveGeneratorFieldId(null)
                      }}
                    />
                  </div>
                )}
            </div>
          </Card>
        ))}
        <Button variant="secondary" size="sm" onClick={addCustomField} className="w-full gap-2">
          <Plus size={16} />
          フィールドを追加
        </Button>
      </div>
    )
  }, [customFields, updateCustomField, deleteCustomField, addCustomField, activeGeneratorFieldId])

  const getTypeLabel = () => {
    switch (entryType) {
      case 'login':
        return 'ログイン情報'
      case 'bank':
        return '銀行情報'
      case 'ssh_key':
        return 'キー情報'
      case 'secure_note':
        return 'ノート'
      case 'credit_card':
        return 'カード情報'
      default:
        return 'アイテム'
    }
  }

  return (
    <>
      {error && (
        <div className="mb-3 p-3 rounded-md bg-danger/10 border border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* 基本情報 */}
      <Card className="mb-3">
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm font-medium">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-2 space-y-3">
          <div>
            <UILabel htmlFor="entry-type">アイテム種別</UILabel>
            {mode === 'create' ? (
              <Select value={entryType} onValueChange={onEntryTypeChange}>
                <SelectTrigger id="entry-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="login">ログイン</SelectItem>
                  <SelectItem value="bank">銀行口座</SelectItem>
                  <SelectItem value="ssh_key">SSHキー</SelectItem>
                  <SelectItem value="secure_note">セキュアノート</SelectItem>
                  <SelectItem value="credit_card">クレジットカード</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary">{getEntryTypeLabel(entryType)}</Badge>
            )}
          </div>
          <div>
            <UILabel htmlFor="name">名前</UILabel>
            <Input
              id="name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="例: Gmail アカウント"
            />
          </div>
        </CardContent>
      </Card>

      {/* アイテム種別別フォーム */}
      <Card className="mb-3">
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm font-medium">{getTypeLabel()}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-2">{renderForm()}</CardContent>
      </Card>

      {/* カスタムフィールド */}
      <div className="mb-3">{renderCustomFields()}</div>

      {/* ラベル */}
      <Card className="mb-3">
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm font-medium">ラベル</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-2">
          {allLabels.length === 0 ? (
            <p className="text-xs text-text-muted">ラベルがありません</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allLabels.map((label) => (
                <label key={label.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLabelIds.includes(label.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSelectedLabelIdsChange([...selectedLabelIds, label.id])
                      } else {
                        onSelectedLabelIdsChange(selectedLabelIds.filter((lid) => lid !== label.id))
                      }
                    }}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-xs">{label.name}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* メモ */}
      <Card className="mb-3">
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm font-medium">メモ</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-2">
          <Textarea
            value={notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="メモを入力（オプション）"
            className="min-h-24"
          />
        </CardContent>
      </Card>
    </>
  )
}
