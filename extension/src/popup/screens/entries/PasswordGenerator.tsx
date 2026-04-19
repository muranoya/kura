import { useTranslation } from 'react-i18next'
import PasswordGeneratorPanel from '../../components/entries/PasswordGeneratorPanel'
import { PageHeader } from '../../components/layout/PageHeader'
import { SyncActions } from '../../components/layout/SyncActions'

export default function PasswordGenerator() {
  const { t } = useTranslation()
  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={t('passwordGenerator.title')}
        showBackButton={false}
        action={<SyncActions />}
      />
      <div className="p-4">
        <PasswordGeneratorPanel />
      </div>
    </div>
  )
}
