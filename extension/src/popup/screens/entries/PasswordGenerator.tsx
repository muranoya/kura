import PasswordGeneratorPanel from '../../components/entries/PasswordGeneratorPanel'
import { PageHeader } from '../../components/layout/PageHeader'

export default function PasswordGenerator() {
  return (
    <div className="h-full overflow-y-auto pb-20">
      <PageHeader title="パスワード生成" showBackButton={false} />
      <div className="p-4">
        <PasswordGeneratorPanel />
      </div>
    </div>
  )
}
