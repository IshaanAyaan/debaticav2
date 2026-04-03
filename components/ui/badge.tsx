import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'outline'

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-[color:var(--ink)] text-[color:var(--paper)]',
  secondary: 'border-transparent bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]',
  outline: 'border-[color:var(--line-strong)] bg-transparent text-[color:var(--ink-soft)]',
}

type BadgeProps = HTMLAttributes<HTMLDivElement> & {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}
