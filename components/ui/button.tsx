'use client'

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

const variantClasses: Record<string, string> = {
  primary: 'bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[#16211f] focus:ring-[color:var(--accent)]',
  secondary:
    'border border-[color:var(--line)] bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)] hover:bg-[#ecd4c5] focus:ring-[color:var(--accent)]',
  outline:
    'border border-[color:var(--line-strong)] bg-[color:var(--panel)] text-[color:var(--ink)] hover:bg-[color:var(--paper-soft)] focus:ring-[color:var(--accent)]',
  ghost: 'text-[color:var(--ink-soft)] hover:bg-[rgba(191,108,70,0.08)] focus:ring-[color:var(--accent)]',
  gradient:
    'bg-gradient-to-r from-[#c6734d] to-[#a65335] text-white hover:from-[#b86742] hover:to-[#92472e] focus:ring-[color:var(--accent)]',
}

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantClasses
  size?: keyof typeof sizeClasses
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={twMerge(
          clsx(
            'inline-flex items-center justify-center rounded-full font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[color:var(--paper)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
            variantClasses[variant],
            sizeClasses[size]
          ),
          className
        )}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export { Button }
