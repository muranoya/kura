import { KeyRound, Settings, Star, Tag, Tags, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as commands from '../commands'
import { useSyncVersion } from '../contexts/SyncContext'
import { cn } from '../lib/utils'
import type { Label } from '../shared/types'

type SidebarProps = Record<string, never>

interface NavItem {
  icon: React.ReactNode
  label: string
  path: string
}

const mainNavItems: NavItem[] = [
  { icon: <KeyRound size={18} />, label: '全てのアイテム', path: '/entries' },
  { icon: <Star size={18} />, label: 'お気に入り', path: '/favorites' },
  { icon: <Tags size={18} />, label: 'ラベル', path: '/labels' },
  { icon: <Wand2 size={18} />, label: 'パスワード生成', path: '/password-generator' },
]

const bottomNavItems: NavItem[] = [
  { icon: <Settings size={18} />, label: '設定', path: '/settings' },
]

export default function Sidebar(_props: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const syncVersion = useSyncVersion()
  const [labels, setLabels] = useState<Label[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-fetch labels on navigation and sync
  useEffect(() => {
    commands
      .listLabels()
      .then(setLabels)
      .catch(() => {})
  }, [location.pathname, syncVersion])

  return (
    <div className="flex flex-col w-sidebar h-screen bg-bg-sidebar border-r border-border">
      {/* ロゴ・ブランドエリア */}
      <div className="px-4 py-6 border-b border-border">
        <h1 className="text-2xl font-bold text-text-primary">kura</h1>
        <p className="text-xs text-text-muted mt-1">パスワードマネージャー</p>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        <ul className="space-y-2">
          {mainNavItems.map((item) => {
            // ラベル行は厳密一致で判定（/labels/:id/entries との区別のため）
            const isActive =
              item.path === '/labels'
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)

            return (
              <div key={item.path}>
                <li>
                  <button
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-white'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                </li>

                {/* ラベルサブリスト */}
                {item.path === '/labels' && labels.length > 0 && (
                  <ul className="mt-1 ml-4 space-y-0.5">
                    {labels.map((label) => {
                      const isLabelActive = location.pathname === `/labels/${label.id}/entries`
                      return (
                        <li key={label.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/labels/${label.id}/entries`)}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                              isLabelActive
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                            )}
                          >
                            <Tag size={12} />
                            <span className="truncate">{label.name}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </ul>
      </nav>

      {/* 下部セクション */}
      <div className="border-t border-border px-2 py-4 space-y-2">
        {/* ゴミ箱ボタン */}
        <button
          type="button"
          onClick={() => navigate('/trash')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
            location.pathname === '/trash'
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
          )}
        >
          <Trash2 size={18} />
          <span>ゴミ箱</span>
        </button>

        {/* 設定 */}
        {bottomNavItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path)
          return (
            <button
              type="button"
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
