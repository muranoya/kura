import { Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PasswordGeneratorPanel from '../../components/entries/PasswordGeneratorPanel'
import { PageHeader } from '../../components/layout/PageHeader'
import { SyncActions } from '../../components/layout/SyncActions'
import { Button } from '../../components/ui/button'

export default function PasswordGenerator() {
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-y-auto pb-20">
      <PageHeader
        title="パスワード生成"
        showBackButton={false}
        action={
          <>
            <SyncActions />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/settings')}
              className="h-8 w-8 p-0"
              title="設定"
            >
              <Settings size={16} />
            </Button>
          </>
        }
      />
      <div className="p-4">
        <PasswordGeneratorPanel />
      </div>
    </div>
  )
}
