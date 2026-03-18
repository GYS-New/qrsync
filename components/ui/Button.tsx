'use client'

import React from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; className?: string }) {
  const base = variant === 'primary'
    ? 'verde-btn-primary'
    : variant === 'danger'
      ? 'verde-btn-danger'
      : 'verde-btn-ghost'

  const sz = size === 'sm' ? ' btn-sm' : ''

  return <button {...props} className={`${base}${sz} ${className}`.trim()} />
}
