import type * as React from 'react'
import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
      {icon && <div className="text-5xl text-text-muted mb-4">{icon}</div>}
      <h2 className="text-xl font-semibold text-text-primary mb-2">{title}</h2>
      {description && (
        <p className="text-sm text-text-secondary text-center mb-6 max-w-sm">{description}</p>
      )}
      {action && action}
    </div>
  )
}
