'use client'

import { useRef, useState } from 'react'

/** Logo: kare ise kare, dikdörtgen ise dikdörtgen — yükseklik sabit */
export default function DynamicLogo({ src, alt, height = 48 }: { src: string; alt: string; height?: number }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [w, setW] = useState(height * 1.5)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      onLoad={() => {
        const img = imgRef.current
        if (!img) return
        const ratio = img.naturalWidth / img.naturalHeight
        setW(ratio < 1.2 ? height : height * ratio)
      }}
      style={{
        width: w, height, borderRadius: 8, objectFit: 'contain',
        border: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, padding: 2,
        transition: 'width 0.2s ease',
      }}
    />
  )
}
