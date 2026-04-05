import { ChevronDown, ChevronUp, Link, Lock, Mail, Phone, Plus, Timer, Trash2, Type, Wand2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getEntryTypeLabel } from '../../../shared/constants'
import type { CustomField, CustomFieldType, Label } from '../../../shared/types'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label as UILabel } from '../ui/label'
import { markdownComponents } from '../ui/markdown-components'
import { Textarea } from '../ui/textarea'
import PasswordGeneratorPanel from './PasswordGeneratorPanel'

export interface EntryFormProps {
  entryType: string
  name: string
  onNameChange: (name: string) => void
  typedValue: Record<string, string>
  onTypedValueChange: (key: string, value: string) => void
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

const CUSTOM_FIELD_TYPES = [
  { value: 'text' as const, label: 'テキスト', icon: Type },
  { value: 'password' as const, label: 'パスワード', icon: Lock },
  { value: 'email' as const, label: 'メール', icon: Mail },
  { value: 'url' as const, label: 'URL', icon: Link },
  { value: 'phone' as const, label: '電話番号', icon: Phone },
  { value: 'totp' as const, label: 'ワンタイムパスワード', icon: Timer },
]

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'テキスト',
  password: 'パスワード',
  email: 'メール',
  url: 'URL',
  phone: '電話番号',
  totp: 'ワンタイムパスワード',
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
  const [secureNotePreviewMode, setSecureNotePreviewMode] = useState(false)
  const [showNewLabelInput, setShowNewLabelInput] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [activeGeneratorFieldId, setActiveGeneratorFieldId] = useState<string | null>(null)
  const [focusedPasswordFieldId, setFocusedPasswordFieldId] = useState<string | null>(null)
  const [pendingFieldType, setPendingFieldType] = useState(false)

  const updateTypedValue = useCallback(
    (key: string, value: string) => {
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
              <UILabel htmlFor="username" className="text-sm">
                ユーザー名
              </UILabel>
              <Input
                id="username"
                value={v.username || ''}
                onChange={(e) => updateTypedValue('username', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="password" className="text-sm">
                パスワード
              </UILabel>
              <div className="relative">
                <Input
                  id="password"
                  type={focusedPasswordFieldId === 'password' ? 'text' : 'password'}
                  value={v.password || ''}
                  onChange={(e) => updateTypedValue('password', e.target.value)}
                  onFocus={() => { setFocusedPasswordFieldId('password'); if (!v.password) setActiveGeneratorFieldId('password') }}
                  onBlur={() => { setFocusedPasswordFieldId(null); setActiveGeneratorFieldId(null) }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'password' && !!(v.password) && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveGeneratorFieldId(activeGeneratorFieldId === 'password' ? null : 'password')}
                    title="パスワード生成"
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
              {activeGeneratorFieldId === 'password' && (
                <div role="presentation" onMouseDown={(e) => e.preventDefault()}>
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
              <UILabel htmlFor="url" className="text-sm">
                URL
              </UILabel>
              <Input
                id="url"
                value={v.url || ''}
                onChange={(e) => updateTypedValue('url', e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>
        )
      case 'bank':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <UILabel htmlFor="bank_name" className="text-sm">
                銀行名
              </UILabel>
              <Input
                id="bank_name"
                value={v.bank_name || ''}
                onChange={(e) => updateTypedValue('bank_name', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="branch_code" className="text-sm">
                支店コード
              </UILabel>
              <Input
                id="branch_code"
                value={v.branch_code || ''}
                onChange={(e) => updateTypedValue('branch_code', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="account_type" className="text-sm">
                口座種別
              </UILabel>
              <Input
                id="account_type"
                value={v.account_type || ''}
                onChange={(e) => updateTypedValue('account_type', e.target.value)}
                placeholder="普通 / 当座 / 貯蓄"
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="account_holder" className="text-sm">
                口座名義
              </UILabel>
              <Input
                id="account_holder"
                value={v.account_holder || ''}
                onChange={(e) => updateTypedValue('account_holder', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="account_number" className="text-sm">
                口座番号
              </UILabel>
              <Input
                id="account_number"
                value={v.account_number || ''}
                onChange={(e) => updateTypedValue('account_number', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="pin" className="text-sm">
                PIN
              </UILabel>
              <div className="relative">
                <Input
                  id="pin"
                  type={focusedPasswordFieldId === 'pin' ? 'text' : 'password'}
                  value={v.pin || ''}
                  onChange={(e) => updateTypedValue('pin', e.target.value)}
                  onFocus={() => { setFocusedPasswordFieldId('pin'); if (!v.pin) setActiveGeneratorFieldId('pin') }}
                  onBlur={() => { setFocusedPasswordFieldId(null); setActiveGeneratorFieldId(null) }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'pin' && !!(v.pin) && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveGeneratorFieldId(activeGeneratorFieldId === 'pin' ? null : 'pin')}
                    title="パスワード生成"
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
              {activeGeneratorFieldId === 'pin' && (
                <div role="presentation" onMouseDown={(e) => e.preventDefault()}>
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
              <UILabel htmlFor="private_key" className="text-sm">
                秘密鍵
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
                <UILabel htmlFor="content" className="text-sm">
                  内容
                </UILabel>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSecureNotePreviewMode(false)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
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
                    className={`px-3 py-1 text-sm rounded transition-colors ${
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
              <UILabel htmlFor="cardholder" className="text-sm">
                カード名義
              </UILabel>
              <Input
                id="cardholder"
                value={v.cardholder || ''}
                onChange={(e) => updateTypedValue('cardholder', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="number" className="text-sm">
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
              <UILabel htmlFor="expiry" className="text-sm">
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
              <UILabel htmlFor="cvv" className="text-sm">
                CVV
              </UILabel>
              <Input
                id="cvv"
                type={focusedPasswordFieldId === 'cvv' ? 'text' : 'password'}
                value={v.cvv || ''}
                onChange={(e) => updateTypedValue('cvv', e.target.value)}
                placeholder="123"
                onFocus={() => setFocusedPasswordFieldId('cvv')}
                onBlur={() => setFocusedPasswordFieldId(null)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="cc_pin" className="text-sm">
                暗証番号
              </UILabel>
              <div className="relative">
                <Input
                  id="cc_pin"
                  type={focusedPasswordFieldId === 'cc_pin' ? 'text' : 'password'}
                  value={v.pin || ''}
                  onChange={(e) => updateTypedValue('pin', e.target.value)}
                  onFocus={() => { setFocusedPasswordFieldId('cc_pin'); if (!v.pin) setActiveGeneratorFieldId('cc_pin') }}
                  onBlur={() => { setFocusedPasswordFieldId(null); setActiveGeneratorFieldId(null) }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'cc_pin' && !!(v.pin) && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveGeneratorFieldId(activeGeneratorFieldId === 'cc_pin' ? null : 'cc_pin')}
                    title="パスワード生成"
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
              {activeGeneratorFieldId === 'cc_pin' && (
                <div role="presentation" onMouseDown={(e) => e.preventDefault()}>
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
              <UILabel htmlFor="username" className="text-sm">
                ユーザー名
              </UILabel>
              <Input
                id="username"
                value={v.username || ''}
                onChange={(e) => updateTypedValue('username', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <UILabel htmlFor="password" className="text-sm">
                パスワード
              </UILabel>
              <div className="relative">
                <Input
                  id="password"
                  type={focusedPasswordFieldId === 'password' ? 'text' : 'password'}
                  value={v.password || ''}
                  onChange={(e) => updateTypedValue('password', e.target.value)}
                  onFocus={() => { setFocusedPasswordFieldId('password'); if (!v.password) setActiveGeneratorFieldId('password') }}
                  onBlur={() => { setFocusedPasswordFieldId(null); setActiveGeneratorFieldId(null) }}
                  className="pr-9"
                />
                {focusedPasswordFieldId === 'password' && !!(v.password) && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveGeneratorFieldId(activeGeneratorFieldId === 'password' ? null : 'password')}
                    title="パスワード生成"
                  >
                    <Wand2 size={16} />
                  </button>
                )}
              </div>
              {activeGeneratorFieldId === 'password' && (
                <div role="presentation" onMouseDown={(e) => e.preventDefault()}>
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
              <UILabel htmlFor="license_key" className="text-sm">
                ライセンスキー
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
  }, [entryType, typedValue, updateTypedValue, secureNotePreviewMode, activeGeneratorFieldId, focusedPasswordFieldId])

  const renderCustomFields = useCallback(() => {
    return (
      <div className="space-y-2">
        {customFields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <div className="group flex items-start gap-2">
              <Badge variant="muted" className="shrink-0 mt-1.5 text-[10px]">
                {FIELD_TYPE_LABELS[field.fieldType] || field.fieldType}
              </Badge>
              <Input
                id={`field-name-${field.id}`}
                value={field.name}
                onChange={(e) => updateCustomField(field.id, { name: e.target.value })}
                placeholder="フィールド名"
                className="h-8 text-sm flex-[2] min-w-0"
              />
              <div className="relative flex-[3]">
                <Input
                  id={`field-value-${field.id}`}
                  type={
                    (field.fieldType === 'password' || field.fieldType === 'totp')
                      ? (focusedPasswordFieldId === `custom-${field.id}` ? 'text' : 'password')
                      : 'text'
                  }
                  value={field.value}
                  onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                  placeholder={
                    field.fieldType === 'totp' ? 'otpauth:// URI または Base32 シークレット' : '値'
                  }
                  className={cn('h-8 text-sm', field.fieldType === 'password' && 'pr-9')}
                  onFocus={() => {
                    if (field.fieldType === 'password' || field.fieldType === 'totp') setFocusedPasswordFieldId(`custom-${field.id}`)
                    if (field.fieldType === 'password' && !field.value) setActiveGeneratorFieldId(`custom-${field.id}`)
                  }}
                  onBlur={() => {
                    if (field.fieldType === 'password' || field.fieldType === 'totp') setFocusedPasswordFieldId(null)
                    if (field.fieldType === 'password') setActiveGeneratorFieldId(null)
                  }}
                />
                {field.fieldType === 'password' && focusedPasswordFieldId === `custom-${field.id}` && !!field.value && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setActiveGeneratorFieldId(activeGeneratorFieldId === `custom-${field.id}` ? null : `custom-${field.id}`)}
                    title="パスワード生成"
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
            <span className="text-xs text-text-muted">フィールドの種類を選択</span>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_FIELD_TYPES.map(({ value, label, icon: Icon }) => (
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
              キャンセル
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
            フィールドを追加
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
          placeholder="例: Gmail アカウント"
          className="text-base font-medium h-11 border-0 border-b border-border rounded-none bg-transparent px-0 focus-visible:ring-0 focus-visible:border-accent"
        />
      </div>

      {/* 種別固有フィールド */}
      <div>{renderForm()}</div>

      {/* カスタムフィールド */}
      <div>{renderCustomFields()}</div>

      {/* メモ */}
      <div className="space-y-1">
        <UILabel className="text-sm text-text-muted">メモ</UILabel>
        <Textarea
          value={notes || ''}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="メモを追加..."
          className="min-h-20 resize-none border-dashed border-border/60 focus:border-solid focus:border-accent"
        />
      </div>

      {/* ラベル */}
      <div className="space-y-2">
        <span className="text-xs text-text-muted">ラベル</span>
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
                  'px-2.5 py-1 text-sm rounded-full border transition-colors',
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
              className="px-2.5 py-1 text-sm rounded-full border border-dashed border-border text-text-muted hover:border-accent/50 hover:text-text-primary transition-colors flex items-center gap-1"
            >
              <Plus size={12} />
              新規
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
                      console.error('ラベル作成失敗:', err)
                    } finally {
                      setCreatingLabel(false)
                    }
                  } else if (e.key === 'Escape') {
                    setShowNewLabelInput(false)
                    setNewLabelName('')
                  }
                }}
                placeholder="ラベル名"
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
                    console.error('ラベル作成失敗:', err)
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
          <p className="text-xs text-text-muted">ラベルがありません</p>
        )}
      </div>
    </div>
  )
}
