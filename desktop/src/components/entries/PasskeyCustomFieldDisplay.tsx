import { KeyRound } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface PasskeyCustomFieldDisplayProps {
  label: string
  value: string
}

interface PasskeyFieldData {
  rp_id?: string
  rp_name?: string
  user_name?: string
  credential_id?: string
}

/**
 * Passkeyカスタムフィールドの読み取り専用表示。
 * `value`はvault-core専用APIが生成したJSON文字列で、private_keyを含むため
 * 絶対に画面に出さない（extension側のPasskeyCustomFieldDisplayと同じ方針）。
 */
export default function PasskeyCustomFieldDisplay({
  label,
  value,
}: PasskeyCustomFieldDisplayProps) {
  const { t } = useTranslation()

  const data = useMemo<PasskeyFieldData | null>(() => {
    try {
      return JSON.parse(value) as PasskeyFieldData
    } catch {
      return null
    }
  }, [value])

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md border-l-2 border-transparent">
      <span className="text-xs text-text-secondary w-24 shrink-0 pt-0.5 flex items-center gap-1">
        <KeyRound size={12} className="shrink-0" />
        {label}
      </span>
      <div className="flex-1 min-w-0 text-xs">
        {data ? (
          <div className="space-y-0.5">
            <div className="text-text-primary truncate">
              {data.rp_name || data.rp_id || t('customFieldTypes.passkey')}
            </div>
            {data.user_name && <div className="text-text-muted truncate">{data.user_name}</div>}
          </div>
        ) : (
          <span className="text-text-muted">{t('customFieldTypes.passkey')}</span>
        )}
      </div>
    </div>
  )
}
