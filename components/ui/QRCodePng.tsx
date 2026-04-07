'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'

type Props = {
  value: string
  size?: number
  className?: string
}

export default function QRCodePng({ value, size = 220, className }: Props) {
  const [dataUrl, setDataUrl] = useState<string>('')

  const opts = useMemo(
    () => ({
      errorCorrectionLevel: 'M' as const,
      margin: 1,
      width: size,
      color: {
        dark: '#1f2937',
        light: '#ffffff',
      },
    }),
    [size]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const url = await QRCode.toDataURL(value, opts)
        if (!cancelled) setDataUrl(url)
      } catch {
        if (!cancelled) setDataUrl('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [value, opts])

  if (!dataUrl) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          border: '1px dashed rgba(46,139,46,.35)',
          background: 'linear-gradient(180deg, rgba(240,249,240,.9), rgba(255,255,255,.9))',
        }}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt="QR"
      src={dataUrl}
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        border: '1px solid rgba(214,228,214,.95)',
        background: '#fff',
      }}
    />
  )
}
