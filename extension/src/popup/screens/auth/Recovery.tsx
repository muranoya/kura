import { useNavigate } from 'react-router-dom'
import * as commands from '../../commands'
import { RecoveryForm } from '../../components/RecoveryForm'

export default function Recovery() {
  const navigate = useNavigate()

  return (
    <RecoveryForm
      onBack={() => navigate('/auth/lock')}
      onRecover={async (recoveryKey, newPassword) => {
        await commands.recoverWithRecoveryKey(recoveryKey, newPassword)
        window.location.reload()
      }}
    />
  )
}
