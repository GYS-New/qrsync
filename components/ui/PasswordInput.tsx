'use client'

import { useState } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'

function generatePassword(length = 12): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '!@#$%&*'
  const all = upper + lower + digits + special
  // En az 1 büyük, 1 küçük, 1 rakam, 1 özel karakter
  let pw = ''
  pw += upper[Math.floor(Math.random() * upper.length)]
  pw += lower[Math.floor(Math.random() * lower.length)]
  pw += digits[Math.floor(Math.random() * digits.length)]
  pw += special[Math.floor(Math.random() * special.length)]
  for (let i = 4; i < length; i++) pw += all[Math.floor(Math.random() * all.length)]
  // Shuffle
  return pw.split('').sort(() => Math.random() - 0.5).join('')
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = '••••••••',
  autoComplete = 'new-password',
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          className="verde-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={8}
          maxLength={72}
          style={{ paddingRight: 68 }}
        />
        <div style={{ position: 'absolute', right: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={() => { const pw = generatePassword(); onChange(pw); setShow(true) }}
            title="Otomatik şifre oluştur"
            style={{
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'transparent', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#6b7280',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            title={show ? 'Gizle' : 'Göster'}
            style={{
              width: 28, height: 28, borderRadius: 6, border: 'none',
              background: 'transparent', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#6b7280',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'block' }}>Minimum 8, maksimum 72 karakter</span>
    </div>
  )
}
