'use client'

import React from 'react'

export type RowActionButtonVariant = 'base' | 'success' | 'warning' | 'danger'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: RowActionButtonVariant
}

const stylesByVariant: Record<RowActionButtonVariant, React.CSSProperties> = {
  base: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    color: '#111827',
  },
  success: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    color: '#166534',
  },
  warning: {
    background: '#f9fafb',
    border: '1px solid #fed7aa',
    color: '#c2610c',
  },
  danger: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
  },
}

export default function RowActionButton({
  variant = 'base',
  style,
  disabled,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        borderRadius: 4,
        padding: '5px 9px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 15,
        lineHeight: '20px',
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        ...(stylesByVariant[variant] ?? stylesByVariant.base),
        ...style,
      }}
    />
  )
}
