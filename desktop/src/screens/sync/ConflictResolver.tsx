import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import SyncHeaderActions from '../../components/layout/SyncHeaderActions'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'

export default function ConflictResolver() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col h-screen bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary flex-1">
          {t('sync.conflict.title')}
        </h1>
        <SyncHeaderActions />
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <Card>
          <CardContent className="px-3 pb-3 pt-2">
            <p className="text-text-muted mb-3">{t('sync.conflict.description')}</p>

            <Button onClick={() => navigate('/sync')} className="w-full" size="sm">
              {t('common.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
