import { useNavigate, useLocation } from 'react-router-dom'
import { Separator } from './ui/separator'
import { KeyRound, Star, Tags, RefreshCw, Settings, Trash2, Wand2 } from 'lucide-react'
import { cn } from '../lib/utils'

interface SidebarProps {}

interface NavItem {
  icon: React.ReactNode
  label: string
  path: string
}

const navItems: NavItem[] = [
  { icon: <KeyRound size={18} />, label: '全てのアイテム', path: '/entries' },
  { icon: <Star size={18} />, label: 'お気に入り', path: '/favorites' },
  { icon: <Tags size={18} />, label: 'ラベル', path: '/labels' },
  { icon: <Wand2 size={18} />, label: 'パスワード生成', path: '/password-generator' },
  { icon: <RefreshCw size={18} />, label: '同期', path: '/sync' },
  { icon: <Settings size={18} />, label: '設定', path: '/settings' },
]

export default function Sidebar({}: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex flex-col w-sidebar h-screen bg-bg-sidebar border-r border-border">
      {/* ロゴ・ブランドエリア */}
      <div className="px-4 py-6 border-b border-border">
        <h1 className="text-2xl font-bold text-text-primary">kura</h1>
        <p className="text-xs text-text-muted mt-1">パスワードマネージャー</p>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-2 py-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path)
            return (
              <li key={item.path}>
                <button
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* 下部セクション */}
      <div className="border-t border-border px-2 py-4 space-y-2">
        {/* ゴミ箱ボタン */}
        <button
          onClick={() => navigate('/trash')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
            location.pathname === '/trash'
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          )}
        >
          <Trash2 size={18} />
          <span>ゴミ箱</span>
        </button>
      </div>
    </div>
  )
}
