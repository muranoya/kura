import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
  showBackButton?: boolean
  onBack?: () => void
  size?: 'default' | 'compact'
}

export function PageHeader({
  title,
  subtitle,
  action,
  className,
  showBackButton = false,
  onBack,
  size = 'default',
}: PageHeaderProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }

  const isCompact = size === 'compact'
  const paddingClass = isCompact ? 'px-4 py-2' : 'px-4 py-3'
  const titleClass = isCompact ? 'text-base font-semibold' : 'text-lg font-bold'

  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-border', paddingClass, className)}>
      <div className="min-w-0 flex-1 flex items-center gap-2">
        {showBackButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="h-8 w-8 p-0 flex-shrink-0"
          >
            <ChevronLeft size={18} />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className={cn('text-text-primary truncate', titleClass)}>{title}</h1>
          {subtitle && <p className="text-sm text-text-secondary mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
    </div>
  )
}
