import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'
import { CheckCircle2 } from 'lucide-react'

export default function SyncStatus() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="同期状態" />

      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <p className="font-semibold text-text-primary">同期準備完了</p>
                <p className="text-sm text-text-muted">クラウドストレージが正常に接続されています</p>
              </div>
            </div>

            <Button onClick={() => navigate('/entries')} className="w-full">
              戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
