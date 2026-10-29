import { useTranslation } from 'react-i18next'
import { PasswordInput } from '../../components/ui/password-input'

interface UserVerificationFieldProps {
  password: string
  onChange: (password: string) => void
  error: string | null
  disabled?: boolean
}

/**
 * Master password re-entry shown when the relying party requires user
 * verification (userVerification: "required"). Only after this succeeds does
 * kura set the UV flag in the authenticator data.
 */
export default function UserVerificationField({
  password,
  onChange,
  error,
  disabled,
}: UserVerificationFieldProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-text-secondary">{t('webauthn.ritual.verifyDescription')}</p>
      <PasswordInput
        value={password}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('common.passwordPlaceholder')}
        disabled={disabled}
        autoFocus
        className="text-sm"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
