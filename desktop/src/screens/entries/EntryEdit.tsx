import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import * as commands from '../../commands'
import { getFromStorage } from '../../shared/storage'
import { Entry, CustomField, CustomFieldType, Label } from '../../shared/types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Label as UILabel } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { PageHeader } from '../../components/layout/PageHeader'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

export default function EntryEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState<string | null>(null)
  const [typedValue, setTypedValue] = useState<Record<string, any>>({})
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [allLabels, setAllLabels] = useState<Label[]>([])
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      if (id) {
        try {
          const data = await commands.getEntry(id)
          const labels = await commands.listLabels()
          setEntry(data)
          setName(data.name)
          setNotes(data.notes)
          setTypedValue(data.typedValue)
          setCustomFields(data.customFields || [])
          setSelectedLabelIds(data.labels || [])
          setAllLabels(labels)
        } catch (err) {
          setError(`アイテム読み込み失敗: ${err}`)
        } finally {
          setLoading(false)
        }
      }
    }
    load()
  }, [id])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('名前を入力してください')
      return
    }

    setSaving(true)
    try {
      const typedValueJson = JSON.stringify(typedValue)
      const customFieldsJson = customFields.length > 0 ? JSON.stringify(customFields) : undefined
      await commands.updateEntry(id!, name, typedValueJson, notes || undefined, selectedLabelIds, customFieldsJson)
      const vaultBytes = await commands.getVaultBytes()
      await commands.writeVaultFile(vaultBytes)
      // S3にプッシュ
      const s3Config = await getFromStorage<any>('s3Config')
      if (s3Config) {
        await commands.pushVault(JSON.stringify(s3Config))
      }
      navigate(`/entries/${id}`)
    } catch (err) {
      setError(`保存失敗: ${err}`)
    } finally {
      setSaving(false)
    }
  }, [id, name, notes, typedValue, customFields, selectedLabelIds, navigate])

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

  const updateCustomField = useCallback((fieldId: string, field: Partial<CustomField>) => {
    setCustomFields(prev =>
      prev.map(f => (f.id === fieldId ? { ...f, ...field } : f))
    )
  }, [])

  const deleteCustomField = useCallback((fieldId: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== fieldId))
  }, [])

  const renderForm = useCallback(() => {
    if (!entry) return null
    const v = typedValue

    switch (entry.entryType) {
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
  }, [entry, typedValue, updateTypedValue])

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

  if (loading) return <div className="p-6 text-center text-text-secondary">読み込み中...</div>
  if (!entry) return <div className="p-6 text-center text-danger">アイテムが見つかりません</div>

  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="アイテム編集" />

      <div className="max-w-2xl mx-auto p-6">
        {/* エラー表示 */}
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
              <UILabel htmlFor="name">名前</UILabel>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <UILabel>アイテム種別</UILabel>
              <Badge variant="secondary">{entry.entryType}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* アイテム種別別フォーム */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">
              {entry.entryType === 'login'
                ? 'ログイン情報'
                : entry.entryType === 'bank'
                ? '銀行情報'
                : entry.entryType === 'ssh_key'
                ? 'キー情報'
                : entry.entryType === 'secure_note'
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
                          setSelectedLabelIds(prev => [...prev, label.id])
                        } else {
                          setSelectedLabelIds(prev => prev.filter(lid => lid !== label.id))
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
              onChange={(e) => setNotes(e.target.value)}
              placeholder="メモを入力（オプション）"
              className="min-h-32"
            />
          </CardContent>
        </Card>

        {/* アクション */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1"
          >
            {saving ? '保存中...' : '保存'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(`/entries/${id}`)}
            className="flex-1"
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}
