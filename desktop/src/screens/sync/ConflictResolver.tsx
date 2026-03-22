import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { PageHeader } from '../../components/layout/PageHeader'

export default function ConflictResolver() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg-base">
      <PageHeader title="コンフリクト解決" />

      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-text-muted mb-6">
              複数デバイスからの同時更新により、ローカルとクラウドストレージ間にコンフリクトが発生しました。
              以下から選択して解決してください。
            </p>

            <Button onClick={() => navigate('/sync')} className="w-full">
              戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
