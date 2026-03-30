import { useLocation, Link } from 'react-router-dom'
import { KeyRound, Star, Wand2, Tags, Settings } from 'lucide-react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TAB_ROUTES = [
  { path: '/entries', icon: KeyRound, label: 'アイテム' },
  { path: '/favorites', icon: Star, label: 'お気に入り' },
  { path: '/labels', icon: Tags, label: 'ラベル' },
  { path: '/password-generator', icon: Wand2, label: '生成' },
  { path: '/settings', icon: Settings, label: '設定' },
]

export function BottomNav() {
  const location = useLocation()

  const isActiveTab = (tabPath: string) => {
    return location.pathname === tabPath
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-bg-surface">
      <div className="flex w-full justify-around">
        {TAB_ROUTES.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            className={cn(
              'flex flex-col items-center justify-center gap-1 px-4 py-3 transition-colors',
              'flex-1 text-center text-sm',
              isActiveTab(path)
                ? 'text-accent border-t-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
