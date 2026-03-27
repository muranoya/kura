import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:
          'border border-border bg-bg-elevated text-text-primary',
        primary:
          'bg-accent text-white',
        secondary:
          'bg-accent-subtle text-accent',
        destructive:
          'bg-danger/10 text-danger',
        success:
          'bg-success/10 text-success',
        muted:
          'bg-bg-elevated text-text-secondary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
