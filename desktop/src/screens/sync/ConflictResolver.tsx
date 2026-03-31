import { useNavigate } from 'react-router-dom'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'

export default function ConflictResolver() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">コンフリクト解決</h1>
        <SyncHeaderActions />
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <Card>
          <CardContent className="px-3 pb-3 pt-2">
            <p className="text-text-muted mb-3">
              複数デバイスからの同時更新により、ローカルとクラウドストレージ間にコンフリクトが発生しました。
              以下から選択して解決してください。
            </p>

            <Button onClick={() => navigate('/sync')} className="w-full" size="sm">
              戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
