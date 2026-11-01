import { Navigate, useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { RecoveryForm } from '../../components/RecoveryForm'
import {
  isOnboardingDraftComplete,
  useOnboardingDraft,
} from '../../contexts/OnboardingDraftContext'

export default function RecoverExistingVault() {
  const navigate = useNavigate()
  const { draft } = useOnboardingDraft()

  // サイドバーをリロードするとメモリ上のS3設定が消えるため、入力し直してもらう
  if (!isOnboardingDraftComplete(draft)) {
    return <Navigate to="/onb/storage" replace state={{ fromOnboarding: true }} />
  }

  return (
    <RecoveryForm
      onBack={() => navigate('/onb/unlock-existing', { state: { fromOnboarding: true } })}
      onRecover={async (recoveryKey, newPassword) => {
        await commands.recoverExistingVault(recoveryKey, newPassword, {
          region: draft.region,
          bucket: draft.bucket,
          key: draft.key,
          accessKeyId: draft.accessKeyId,
          secretAccessKey: draft.secretAccessKey,
          ...(draft.endpoint ? { endpoint: draft.endpoint } : {}),
        })
        navigate('/entries')
      }}
    />
  )
}
