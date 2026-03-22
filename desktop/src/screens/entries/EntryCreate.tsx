import { useNavigate } from 'react-router-dom'
import { useState, useCallback, useMemo } from 'react'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { CustomField, CustomFieldType } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { PageHeader } from '../../components/layout/PageHeader'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

export default function EntryCreate() {
  const navigate = useNavigate()
  const [entryType, setEntryType] = useState('login')
  const [name, setName] = useState('')
  const [typedValue, setTypedValue] = useState<Record<string, any>>({})
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!name) {
      alert('名前を入力してください')
      return
    }

    setLoading(true)
    try {
      const typedValueJson = JSON.stringify(typedValue)
      const customFieldsJson = customFields.length > 0 ? JSON.stringify(customFields) : undefined
      const id = await commands.createEntry(entryType, name, typedValueJson, undefined, [], customFieldsJson)

      // Save vault to file and push to S3
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }

      navigate(`/entries/${id}`)
    } catch (err) {
      alert(`アイテム作成失敗: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const updateTypedValue = useCallback((key: string, value: any) => {
    setTypedValue(prev => ({ ...prev, [key]: value }))
  }, [])

  const addCustomField = useCallback(() => {
    const newField: CustomField = {
      id: Math.random().toString(36).substring(7),
      name: '',
      fieldType: 'text',
      value: '',
    }
    setCustomFields(prev => [...prev, newField])
  }, [])

  const updateCustomField = useCallback((id: string, field: Partial<CustomField>) => {
    setCustomFields(prev =>
      prev.map(f => (f.id === id ? { ...f, ...field } : f))
    )
  }, [])

  const deleteCustomField = useCallback((id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id))
  }, [])

  const renderForm = useCallback(() => {
    const v = typedValue

    switch (entryType) {
      case 'login':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={v.url || ''}
                onChange={(e) => updateTypedValue('url', e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <Label htmlFor="username">ユーザー名</Label>
              <Input
                id="username"
                value={v.username || ''}
                onChange={(e) => updateTypedValue('username', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={v.password || ''}
                onChange={(e) => updateTypedValue('password', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="totp">TOTP（オプション）</Label>
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
              <Label htmlFor="bank_name">銀行名</Label>
              <Input
                id="bank_name"
                value={v.bank_name || ''}
                onChange={(e) => updateTypedValue('bank_name', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="account_number">口座番号</Label>
              <Input
                id="account_number"
                value={v.account_number || ''}
                onChange={(e) => updateTypedValue('account_number', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pin">PIN</Label>
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
              <Label htmlFor="private_key">秘密鍵</Label>
              <Textarea
                id="private_key"
                value={v.private_key || ''}
                onChange={(e) => updateTypedValue('private_key', e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="passphrase">パスフレーズ（オプション）</Label>
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
            <Label htmlFor="content">内容</Label>
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
              <Label htmlFor="cardholder">カード名義</Label>
              <Input
                id="cardholder"
                value={v.cardholder || ''}
                onChange={(e) => updateTypedValue('cardholder', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="number">カード番号</Label>
              <Input
                id="number"
                value={v.number || ''}
                onChange={(e) => updateTypedValue('number', e.target.value)}
                placeholder="1234 5678 9012 3456"
              />
            </div>
            <div>
              <Label htmlFor="expiry">有効期限</Label>
              <Input
                id="expiry"
                value={v.expiry || ''}
                onChange={(e) => updateTypedValue('expiry', e.target.value)}
                placeholder="MM/YY"
              />
            </div>
            <div>
              <Label htmlFor="cvv">CVV</Label>
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
                <Label htmlFor={`field-name-${field.id}`}>フィールド名</Label>
                <Input
                  id={`field-name-${field.id}`}
                  value={field.name}
                  onChange={(e) => updateCustomField(field.id, { name: e.target.value })}
                  placeholder="例: セキュリティ質問"
                />
              </div>
              <div>
                <Label htmlFor={`field-type-${field.id}`}>フィールド種類</Label>
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
                <Label htmlFor={`field-value-${field.id}`}>値</Label>
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

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="新規アイテム" />

      <div className="max-w-2xl mx-auto p-6">
        {/* 基本情報 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="entry-type">アイテム種別</Label>
              <Select value={entryType} onValueChange={setEntryType}>
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
            </div>
            <div>
              <Label htmlFor="name">名前</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: Gmail アカウント"
              />
            </div>
          </CardContent>
        </Card>

        {/* アイテム種別別フォーム */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">
              {entryType === 'login'
                ? 'ログイン情報'
                : entryType === 'bank'
                ? '銀行情報'
                : entryType === 'ssh_key'
                ? 'キー情報'
                : entryType === 'secure_note'
                ? 'ノート'
                : 'カード情報'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderForm()}
          </CardContent>
        </Card>

        {/* カスタムフィールド */}
        <div className="mb-6">
          {renderCustomFields()}
        </div>

        {/* アクション */}
        <div className="flex gap-3">
          <Button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1"
          >
            {loading ? '作成中...' : '作成'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate('/entries')}
            className="flex-1"
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}
