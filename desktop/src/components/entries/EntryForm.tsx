import { useCallback } from 'react'
import { CustomField, CustomFieldType, Label } from '../../shared/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Label as UILabel } from '../ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Plus, Trash2 } from 'lucide-react'

export interface EntryFormProps {
  mode: 'create' | 'edit'
  entryType: string
  onEntryTypeChange?: (type: string) => void
  name: string
  onNameChange: (name: string) => void
  typedValue: Record<string, any>
  onTypedValueChange: (key: string, value: any) => void
  notes: string | null
  onNotesChange: (notes: string) => void
  customFields: CustomField[]
  onCustomFieldsChange: (fields: CustomField[]) => void
  allLabels: Label[]
  selectedLabelIds: string[]
  onSelectedLabelIdsChange: (ids: string[]) => void
  error?: string
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
  const updateTypedValue = useCallback((key: string, value: any) => {
    onTypedValueChange(key, value)
  }, [onTypedValueChange])

  const addCustomField = useCallback(() => {
    const newField: CustomField = {
      id: Math.random().toString(36).substring(7),
      name: '',
      fieldType: 'text',
      value: '',
    }
    onCustomFieldsChange([...customFields, newField])
  }, [customFields, onCustomFieldsChange])

  const updateCustomField = useCallback((fieldId: string, field: Partial<CustomField>) => {
    onCustomFieldsChange(
      customFields.map(f => (f.id === fieldId ? { ...f, ...field } : f))
    )
  }, [customFields, onCustomFieldsChange])

  const deleteCustomField = useCallback((fieldId: string) => {
    onCustomFieldsChange(customFields.filter(f => f.id !== fieldId))
  }, [customFields, onCustomFieldsChange])

  const renderForm = useCallback(() => {
    const v = typedValue

    switch (entryType) {
      case 'login':
        return (
          <div className="space-y-4">
            <div>
              <UILabel htmlFor="url">URL</UILabel>
              <Input
                id="url"
                value={v.url || ''}
                onChange={(e) => updateTypedValue('url', e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <UILabel htmlFor="username">ユーザー名</UILabel>
              <Input
                id="username"
                value={v.username || ''}
                onChange={(e) => updateTypedValue('username', e.target.value)}
              />
            </div>
            <div>
              <UILabel htmlFor="password">パスワード</UILabel>
              <Input
                id="password"
                type="password"
                value={v.password || ''}
                onChange={(e) => updateTypedValue('password', e.target.value)}
              />
            </div>
            <div>
              <UILabel htmlFor="totp">TOTP（オプション）</UILabel>
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
          <div className="space-y-4">
            <div>
              <UILabel htmlFor="bank_name">銀行名</UILabel>
              <Input
                id="bank_name"
                value={v.bank_name || ''}
                onChange={(e) => updateTypedValue('bank_name', e.target.value)}
              />
            </div>
            <div>
              <UILabel htmlFor="account_number">口座番号</UILabel>
              <Input
                id="account_number"
                value={v.account_number || ''}
                onChange={(e) => updateTypedValue('account_number', e.target.value)}
              />
            </div>
            <div>
              <UILabel htmlFor="pin">PIN</UILabel>
              <Input
                id="pin"
                type="password"
                value={v.pin || ''}
                onChange={(e) => updateTypedValue('pin', e.target.value)}
              />
            </div>
          </div>
        )
      case 'ssh_key':
        return (
          <div className="space-y-4">
            <div>
              <UILabel htmlFor="private_key">秘密鍵</UILabel>
              <Textarea
                id="private_key"
                value={v.private_key || ''}
                onChange={(e) => updateTypedValue('private_key', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <UILabel htmlFor="passphrase">パスフレーズ（オプション）</UILabel>
              <Input
                id="passphrase"
                type="password"
                value={v.passphrase || ''}
                onChange={(e) => updateTypedValue('passphrase', e.target.value)}
              />
            </div>
          </div>
        )
      case 'secure_note':
        return (
          <div>
            <UILabel htmlFor="content">内容</UILabel>
            <Textarea
              id="content"
              value={v.content || ''}
              onChange={(e) => updateTypedValue('content', e.target.value)}
              className="min-h-64"
            />
          </div>
        )
      case 'credit_card':
        return (
          <div className="space-y-4">
            <div>
              <UILabel htmlFor="cardholder">カード名義</UILabel>
              <Input
                id="cardholder"
                value={v.cardholder || ''}
                onChange={(e) => updateTypedValue('cardholder', e.target.value)}
              />
            </div>
            <div>
              <UILabel htmlFor="number">カード番号</UILabel>
              <Input
                id="number"
                value={v.number || ''}
                onChange={(e) => updateTypedValue('number', e.target.value)}
                placeholder="1234 5678 9012 3456"
              />
            </div>
            <div>
              <UILabel htmlFor="expiry">有効期限</UILabel>
              <Input
                id="expiry"
                value={v.expiry || ''}
                onChange={(e) => updateTypedValue('expiry', e.target.value)}
                placeholder="MM/YY"
              />
            </div>
            <div>
              <UILabel htmlFor="cvv">CVV</UILabel>
              <Input
                id="cvv"
                type="password"
                value={v.cvv || ''}
                onChange={(e) => updateTypedValue('cvv', e.target.value)}
                placeholder="123"
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }, [entryType, typedValue, updateTypedValue])

  const renderCustomFields = useCallback(() => {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-text-primary">カスタムフィールド</h3>
        {customFields.map((field) => (
          <Card key={field.id} className="p-4">
            <div className="space-y-3">
              <div>
                <UILabel htmlFor={`field-name-${field.id}`}>フィールド名</UILabel>
                <Input
                  id={`field-name-${field.id}`}
                  value={field.name}
                  onChange={(e) => updateCustomField(field.id, { name: e.target.value })}
                  placeholder="例: セキュリティ質問"
                />
              </div>
              <div>
                <UILabel htmlFor={`field-type-${field.id}`}>フィールド種類</UILabel>
                <Select value={field.fieldType} onValueChange={(value) => updateCustomField(field.id, { fieldType: value as CustomFieldType })}>
                  <SelectTrigger id={`field-type-${field.id}`}>
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
              <div>
                <UILabel htmlFor={`field-value-${field.id}`}>値</UILabel>
                <Input
                  id={`field-value-${field.id}`}
                  type={field.fieldType === 'password' ? 'password' : 'text'}
                  value={field.value}
                  onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
                />
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteCustomField(field.id)}
                className="gap-2 w-full"
              >
                <Trash2 size={16} />
                削除
              </Button>
            </div>
          </Card>
        ))}
        <Button
          variant="secondary"
          onClick={addCustomField}
          className="w-full gap-2"
        >
          <Plus size={18} />
          フィールドを追加
        </Button>
      </div>
    )
  }, [customFields, updateCustomField, deleteCustomField])

  const getTypeLabel = () => {
    switch (entryType) {
      case 'login': return 'ログイン情報'
      case 'bank': return '銀行情報'
      case 'ssh_key': return 'キー情報'
      case 'secure_note': return 'ノート'
      case 'credit_card': return 'カード情報'
      default: return 'アイテム'
    }
  }

  return (
    <>
      {error && (
        <div className="mb-6 p-4 rounded-md bg-danger/10 border border-danger/20">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* 基本情報 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <Badge variant="secondary">{entryType}</Badge>
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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">{getTypeLabel()}</CardTitle>
        </CardHeader>
        <CardContent>
          {renderForm()}
        </CardContent>
      </Card>

      {/* カスタムフィールド */}
      <div className="mb-6">
        {renderCustomFields()}
      </div>

      {/* ラベル */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">ラベル</CardTitle>
        </CardHeader>
        <CardContent>
          {allLabels.length === 0 ? (
            <p className="text-sm text-text-muted">ラベルがありません</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allLabels.map(label => (
                <label key={label.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLabelIds.includes(label.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSelectedLabelIdsChange([...selectedLabelIds, label.id])
                      } else {
                        onSelectedLabelIdsChange(selectedLabelIds.filter(lid => lid !== label.id))
                      }
                    }}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span className="text-sm">{label.name}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* メモ */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">メモ</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="メモを入力（オプション）"
            className="min-h-32"
          />
        </CardContent>
      </Card>
    </>
  )
}
