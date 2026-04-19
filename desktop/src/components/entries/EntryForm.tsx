import {
  ChevronDown,
  ChevronUp,
  Link,
  Lock,
  Mail,
  Phone,
  Plus,
  Timer,
  Trash2,
  Type,
  Wand2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/utils'
import { getEntryTypeLabel } from '../../shared/constants'
import type { CustomField, CustomFieldType, Label } from '../../shared/types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label as UILabel } from '../ui/label'
import { Textarea } from '../ui/textarea'
import PasswordGeneratorPanel from './PasswordGeneratorPanel'

export interface EntryFormProps {
  entryType: string
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
  onCreateLabel?: (name: string) => Promise<Label>
  error?: string
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

export default function EntryForm({
  entryType,
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
  onCreateLabel,
  error,
}: EntryFormProps) {
  const { t } = useTranslation()
  const customFieldTypes = useMemo(
    () => [
      { value: 'text' as const, label: t('customFieldTypes.text'), icon: Type },
      { value: 'password' as const, label: t('customFieldTypes.password'), icon: Lock },
      { value: 'email' as const, label: t('customFieldTypes.email'), icon: Mail },
      { value: 'url' as const, label: t('customFieldTypes.url'), icon: Link },
      { value: 'phone' as const, label: t('customFieldTypes.phone'), icon: Phone },
      { value: 'totp' as const, label: t('customFieldTypes.totp'), icon: Timer },
    ],
    [t],
  )
  const fieldTypeLabels: Record<string, string> = useMemo(
    () => ({
      text: t('customFieldTypes.text'),
      password: t('customFieldTypes.password'),
      email: t('customFieldTypes.email'),
      url: t('customFieldTypes.url'),
      phone: t('customFieldTypes.phone'),
      totp: t('customFieldTypes.totp'),
    }),
    [t],
  )
  const [secureNotePreviewMode, setSecureNotePreviewMode] = useState(false)
  const [showNewLabelInput, setShowNewLabelInput] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [activeGeneratorFieldId, setActiveGeneratorFieldId] = useState<string | null>(null)
  const [focusedPasswordFieldId, setFocusedPasswordFieldId] = useState<string | null>(null)
  const [pendingFieldType, setPendingFieldType] = useState(false)

  const updateTypedValue = useCallback(
    (key: string, value: string | null) => {
      onTypedValueChange(key, value)
    },
    [onTypedValueChange],
  )

  const addCustomFieldWithType = useCallback(
    (fieldType: CustomFieldType) => {
      const newField: CustomField = {
        id: Math.random().toString(36).substring(7),
        name: '',
        fieldType,
        value: '',
      }
      onCustomFieldsChange([...customFields, newField])
      setPendingFieldType(false)
    },
    [customFields, onCustomFieldsChange],
  )

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

  const moveCustomField = useCallback(
    (fieldId: string, direction: 'up' | 'down') => {
      const index = customFields.findIndex((f) => f.id === fieldId)
      if (index < 0) return
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= customFields.length) return
      const newFields = [...customFields]
      ;[newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]]
      onCustomFieldsChange(newFields)
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
              <UILabel htmlFor="username" className="text-xs">
                {t('fields.username')}
              </UILabel>
              <Input
                id="username"
                value={v.username || ''}
                onChange={(e) => updateTypedValue('username', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="password" className="text-xs">
                {t('fields.password')}
              </UILabel>
              <div className="relative">
                <Input
                  id="password"
                  type={focusedPasswordFieldId === 'password' ? 'text' : 'password'}
                  value={v.password || ''}
                  onChange={(e) => updateTypedValue('password', e.target.value)}
                  onFocus={() => {
                    setFocusedPasswordFieldId('password')
                    if (!v.password) setActiveGeneratorFieldId('password')
                  }}
                  onBlur={() => {
                    setFocusedPasswordFieldId(null)
                    setActiveGeneratorFieldId(null)
                  }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'password' && !!v.password && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setActiveGeneratorFieldId(
                        activeGeneratorFieldId === 'password' ? null : 'password',
                      )
                    }
                    title={t('entries.form.passwordGenerate')}
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
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
              <UILabel htmlFor="url" className="text-xs">
                {t('fields.url')}
              </UILabel>
              <Input
                id="url"
                value={v.url || ''}
                onChange={(e) => updateTypedValue('url', e.target.value)}
                placeholder={t('fieldPlaceholders.url')}
              />
            </div>
          </div>
        )
      case 'bank':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="bank_name" className="text-xs">
                {t('fields.bank_name')}
              </UILabel>
              <Input
                id="bank_name"
                value={v.bank_name || ''}
                onChange={(e) => updateTypedValue('bank_name', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="branch_code" className="text-xs">
                {t('fields.branch_code')}
              </UILabel>
              <Input
                id="branch_code"
                value={v.branch_code || ''}
                onChange={(e) => updateTypedValue('branch_code', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="account_type" className="text-xs">
                {t('fields.account_type')}
              </UILabel>
              <Input
                id="account_type"
                value={v.account_type || ''}
                onChange={(e) => updateTypedValue('account_type', e.target.value)}
                placeholder={t('fieldPlaceholders.account_type')}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="account_holder" className="text-xs">
                {t('fields.account_holder')}
              </UILabel>
              <Input
                id="account_holder"
                value={v.account_holder || ''}
                onChange={(e) => updateTypedValue('account_holder', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="account_number" className="text-xs">
                {t('fields.account_number')}
              </UILabel>
              <Input
                id="account_number"
                value={v.account_number || ''}
                onChange={(e) => updateTypedValue('account_number', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="pin" className="text-xs">
                {t('fields.pin')}
              </UILabel>
              <div className="relative">
                <Input
                  id="pin"
                  type={focusedPasswordFieldId === 'pin' ? 'text' : 'password'}
                  value={v.pin || ''}
                  onChange={(e) => updateTypedValue('pin', e.target.value)}
                  onFocus={() => {
                    setFocusedPasswordFieldId('pin')
                    if (!v.pin) setActiveGeneratorFieldId('pin')
                  }}
                  onBlur={() => {
                    setFocusedPasswordFieldId(null)
                    setActiveGeneratorFieldId(null)
                  }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'pin' && !!v.pin && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setActiveGeneratorFieldId(activeGeneratorFieldId === 'pin' ? null : 'pin')
                    }
                    title={t('entries.form.passwordGenerate')}
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
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
                {t('fields.private_key')}
              </UILabel>
              <Textarea
                id="private_key"
                value={v.private_key || ''}
                onChange={(e) => updateTypedValue('private_key', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        )
      case 'secure_note':
        return (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <UILabel htmlFor="content" className="text-xs">
                  {t('fields.content')}
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
                    {t('entries.form.secureNoteEdit')}
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
                    {t('entries.form.secureNotePreview')}
                  </button>
                </div>
              </div>
              {!secureNotePreviewMode ? (
                <Textarea
                  id="content"
                  value={v.content || ''}
                  onChange={(e) => updateTypedValue('content', e.target.value)}
                  className="min-h-40 resize-y"
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
                {t('fields.cardholder')}
              </UILabel>
              <Input
                id="cardholder"
                value={v.cardholder || ''}
                onChange={(e) => updateTypedValue('cardholder', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="number" className="text-xs">
                {t('fields.number')}
              </UILabel>
              <Input
                id="number"
                value={v.number || ''}
                onChange={(e) => updateTypedValue('number', e.target.value)}
                placeholder={t('fieldPlaceholders.number')}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="expiry" className="text-xs">
                {t('fields.expiry')}
              </UILabel>
              <Input
                id="expiry"
                value={v.expiry || ''}
                onChange={(e) => updateTypedValue('expiry', e.target.value)}
                placeholder={t('fieldPlaceholders.expiry')}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="cvv" className="text-xs">
                {t('fields.cvv')}
              </UILabel>
              <Input
                id="cvv"
                type={focusedPasswordFieldId === 'cvv' ? 'text' : 'password'}
                value={v.cvv || ''}
                onChange={(e) => updateTypedValue('cvv', e.target.value)}
                placeholder={t('fieldPlaceholders.cvv')}
                onFocus={() => setFocusedPasswordFieldId('cvv')}
                onBlur={() => setFocusedPasswordFieldId(null)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="cc_pin" className="text-xs">
                {t('fields.cc_pin')}
              </UILabel>
              <div className="relative">
                <Input
                  id="cc_pin"
                  type={focusedPasswordFieldId === 'cc_pin' ? 'text' : 'password'}
                  value={v.pin || ''}
                  onChange={(e) => updateTypedValue('pin', e.target.value)}
                  onFocus={() => {
                    setFocusedPasswordFieldId('cc_pin')
                    if (!v.pin) setActiveGeneratorFieldId('cc_pin')
                  }}
                  onBlur={() => {
                    setFocusedPasswordFieldId(null)
                    setActiveGeneratorFieldId(null)
                  }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'cc_pin' && !!v.pin && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setActiveGeneratorFieldId(
                        activeGeneratorFieldId === 'cc_pin' ? null : 'cc_pin',
                      )
                    }
                    title={t('entries.form.passwordGenerate')}
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
              {activeGeneratorFieldId === 'cc_pin' && (
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
      case 'password':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="username" className="text-xs">
                {t('fields.username')}
              </UILabel>
              <Input
                id="username"
                value={v.username || ''}
                onChange={(e) => updateTypedValue('username', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="password" className="text-xs">
                {t('fields.password')}
              </UILabel>
              <div className="relative">
                <Input
                  id="password"
                  type={focusedPasswordFieldId === 'password' ? 'text' : 'password'}
                  value={v.password || ''}
                  onChange={(e) => updateTypedValue('password', e.target.value)}
                  onFocus={() => {
                    setFocusedPasswordFieldId('password')
                    if (!v.password) setActiveGeneratorFieldId('password')
                  }}
                  onBlur={() => {
                    setFocusedPasswordFieldId(null)
                    setActiveGeneratorFieldId(null)
                  }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'password' && !!v.password && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      setActiveGeneratorFieldId(
                        activeGeneratorFieldId === 'password' ? null : 'password',
                      )
                    }
                    title={t('entries.form.passwordGenerate')}
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
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
          </div>
        )
      case 'software_license':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="license_key" className="text-xs">
                {t('fields.license_key')}
              </UILabel>
              <Input
                id="license_key"
                value={v.license_key || ''}
                onChange={(e) => updateTypedValue('license_key', e.target.value)}
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }, [
    entryType,
    typedValue,
    updateTypedValue,
    secureNotePreviewMode,
    activeGeneratorFieldId,
    focusedPasswordFieldId,
    t,
  ])

  const renderCustomFields = useCallback(() => {
    return (
      <div className="space-y-2">
        {customFields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <div className="group flex items-start gap-2">
              <Badge variant="muted" className="shrink-0 mt-1.5 text-[10px]">
                {fieldTypeLabels[field.fieldType] || field.fieldType}
              </Badge>
              <Input
                id={`field-name-${field.id}`}
                value={field.name}
                onChange={(e) => updateCustomField(field.id, { name: e.target.value })}
                placeholder={t('entries.form.fieldNamePlaceholder')}
                className="h-8 text-xs flex-[2] min-w-0"
              />
              <div className="relative flex-[3]">
                <Input
                  id={`field-value-${field.id}`}
                  type={
                    field.fieldType === 'password' || field.fieldType === 'totp'
                      ? focusedPasswordFieldId === `custom-${field.id}`
                        ? 'text'
                        : 'password'
                      : 'text'
                  }
                  value={field.value}
                  onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                  placeholder={
                    field.fieldType === 'totp'
                      ? t('fieldPlaceholders.totp')
                      : t('entries.form.valuePlaceholder')
                  }
                  className={cn('h-8 text-xs', field.fieldType === 'password' && 'pr-9')}
                  onFocus={() => {
                    if (field.fieldType === 'password' || field.fieldType === 'totp')
                      setFocusedPasswordFieldId(`custom-${field.id}`)
                    if (field.fieldType === 'password' && !field.value)
                      setActiveGeneratorFieldId(`custom-${field.id}`)
                  }}
                  onBlur={() => {
                    if (field.fieldType === 'password' || field.fieldType === 'totp')
                      setFocusedPasswordFieldId(null)
                    if (field.fieldType === 'password') setActiveGeneratorFieldId(null)
                  }}
                />
                {field.fieldType === 'password' &&
                  focusedPasswordFieldId === `custom-${field.id}` &&
                  !!field.value && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-accent transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        setActiveGeneratorFieldId(
                          activeGeneratorFieldId === `custom-${field.id}`
                            ? null
                            : `custom-${field.id}`,
                        )
                      }
                      title={t('entries.form.passwordGenerate')}
                    >
                      <Wand2 size={14} />
                    </button>
                  )}
              </div>
              {customFields.length > 1 && (
                <div className="flex flex-col shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => moveCustomField(field.id, 'up')}
                    disabled={customFields.indexOf(field) === 0}
                    className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-default"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCustomField(field.id, 'down')}
                    disabled={customFields.indexOf(field) === customFields.length - 1}
                    className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-default"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => deleteCustomField(field.id)}
                className="p-1 shrink-0 mt-1 text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {field.fieldType === 'password' && activeGeneratorFieldId === `custom-${field.id}` && (
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
        ))}
        {pendingFieldType ? (
          <div className="space-y-2">
            <span className="text-xs text-text-muted">{t('entries.form.selectFieldType')}</span>
            <div className="flex flex-wrap gap-1.5">
              {customFieldTypes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => addCustomFieldWithType(value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-border bg-bg-surface text-text-secondary hover:border-accent hover:text-accent hover:bg-accent/5 transition-colors"
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPendingFieldType(false)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPendingFieldType(true)}
            className="w-full gap-2"
          >
            <Plus size={16} />
            {t('entries.form.addField')}
          </Button>
        )}
      </div>
    )
  }, [
    customFields,
    updateCustomField,
    deleteCustomField,
    moveCustomField,
    addCustomFieldWithType,
    activeGeneratorFieldId,
    focusedPasswordFieldId,
    pendingFieldType,
    customFieldTypes,
    fieldTypeLabels,
    t,
  ])

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-md bg-danger/10 border border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* アイテム種別 + 名前 */}
      <div className="space-y-2">
        <Badge variant="secondary">{getEntryTypeLabel(entryType)}</Badge>
        <Input
          id="name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('fieldPlaceholders.name')}
          className="text-base font-medium h-11 border-0 border-b border-border rounded-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-accent"
        />
      </div>

      {/* 種別固有フィールド */}
      <div>{renderForm()}</div>

      {/* カスタムフィールド */}
      <div>{renderCustomFields()}</div>

      {/* メモ */}
      <div className="space-y-1">
        <UILabel className="text-xs text-text-muted">{t('entries.form.notes')}</UILabel>
        <Textarea
          value={notes || ''}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={t('entries.form.notesPlaceholder')}
          className="min-h-20 resize-none border-dashed border-border/60 focus:border-solid focus:border-accent"
        />
      </div>

      {/* ラベル */}
      <div className="space-y-2">
        <span className="text-xs text-text-muted">{t('entries.form.labels')}</span>
        <div className="flex flex-wrap gap-1.5">
          {allLabels.map((label) => {
            const isSelected = selectedLabelIds.includes(label.id)
            return (
              <button
                key={label.id}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    onSelectedLabelIdsChange(selectedLabelIds.filter((lid) => lid !== label.id))
                  } else {
                    onSelectedLabelIdsChange([...selectedLabelIds, label.id])
                  }
                }}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full border transition-colors',
                  isSelected
                    ? 'bg-accent text-white border-accent'
                    : 'bg-transparent text-text-secondary border-border hover:border-accent/50 hover:text-text-primary',
                )}
              >
                {label.name}
              </button>
            )
          })}
          {onCreateLabel && !showNewLabelInput && (
            <button
              type="button"
              onClick={() => setShowNewLabelInput(true)}
              className="px-2.5 py-1 text-xs rounded-full border border-dashed border-border text-text-muted hover:border-accent/50 hover:text-text-primary transition-colors flex items-center gap-1"
            >
              <Plus size={12} />
              {t('entries.form.newLabelButton')}
            </button>
          )}
          {onCreateLabel && showNewLabelInput && (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const trimmed = newLabelName.trim()
                    if (!trimmed || creatingLabel) return
                    setCreatingLabel(true)
                    try {
                      const label = await onCreateLabel(trimmed)
                      onSelectedLabelIdsChange([...selectedLabelIds, label.id])
                      setNewLabelName('')
                      setShowNewLabelInput(false)
                    } catch (err) {
                      console.error(t('entries.form.errorLabelCreate'), err)
                    } finally {
                      setCreatingLabel(false)
                    }
                  } else if (e.key === 'Escape') {
                    setShowNewLabelInput(false)
                    setNewLabelName('')
                  }
                }}
                placeholder={t('entries.form.newLabelPlaceholder')}
                className="h-7 w-28 text-xs"
                disabled={creatingLabel}
              />
              <button
                type="button"
                disabled={creatingLabel || !newLabelName.trim()}
                onClick={async () => {
                  const trimmed = newLabelName.trim()
                  if (!trimmed || creatingLabel) return
                  setCreatingLabel(true)
                  try {
                    const label = await onCreateLabel(trimmed)
                    onSelectedLabelIdsChange([...selectedLabelIds, label.id])
                    setNewLabelName('')
                    setShowNewLabelInput(false)
                  } catch (err) {
                    console.error(t('entries.form.errorLabelCreate'), err)
                  } finally {
                    setCreatingLabel(false)
                  }
                }}
                className="p-1 rounded text-text-muted hover:text-accent disabled:opacity-50"
              >
                {creatingLabel ? <Timer size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>
          )}
        </div>
        {allLabels.length === 0 && !onCreateLabel && (
          <p className="text-xs text-text-muted">{t('entries.form.noLabels')}</p>
        )}
      </div>
    </div>
  )
}
