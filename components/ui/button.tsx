'use client'

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

const variantClasses: Record<string, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
  outline:
    'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-blue-500',
  ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-blue-500',
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
            'inline-flex items-center justify-center rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
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
