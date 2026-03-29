import PasswordGeneratorPanel from '../../components/entries/PasswordGeneratorPanel'

export default function PasswordGenerator() {
  return (
    <div className="flex flex-col h-full bg-bg-base">
      {/* sticky ヘッダー */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-surface shrink-0">
        <h1 className="text-sm font-semibold text-text-primary">パスワードジェネレータ</h1>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <PasswordGeneratorPanel />
      </div>
    </div>
  )
}
