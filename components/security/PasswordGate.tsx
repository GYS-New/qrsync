'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'

type Props = {
  storageKey: string
  ttlMs: number
  title: string
  description: string
  children: React.ReactNode
}

function nowMs() {
  return Date.now()
}

function readOk(storageKey: string, ttlMs: number) {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return nowMs() - ts < ttlMs
  } catch {
    return false
  }
}

function writeOk(storageKey: string) {
  try {
    sessionStorage.setItem(storageKey, String(nowMs()))
  } catch {}
}

export default function PasswordGate({ storageKey, ttlMs, title, description, children }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [ok, setOk] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setOk(readOk(storageKey, ttlMs))
  }, [storageKey, ttlMs])

  async function verify() {
    if (!password) return
    setLoading(true)
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr || !userRes?.user?.email) throw new Error('Oturum bilgisi okunamadı.')

      const { error } = await supabase.auth.signInWithPassword({
        email: userRes.user.email,
        password,
      })

      if (error) {
        const msg = error.message?.toLowerCase() ?? ''
        if (msg.includes('rate limit') || msg.includes('too many') || error.status === 429) {
          throw new Error('Çok fazla deneme yapıldı. Lütfen birkaç dakika bekleyin.')
        }
        throw new Error('Şifre hatalı. Lütfen tekrar deneyin.')
      }

      writeOk(storageKey)
      setOk(true)
      setPassword('')
      toast({ type: 'success', title: 'Onaylandı', message: 'Arşiv erişimi açıldı.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Doğrulama Hatası', message: e?.message ?? 'Doğrulanamadı.' })
    } finally {
      setLoading(false)
    }
  }

  if (ok) return <>{children}</>

  return (
    <div className="verde-card" style={{ margin: '24px 28px', padding: 18, maxWidth: 620 }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#0f1a0f' }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 13.5, color: '#506050', lineHeight: 1.5 }}>{description}</div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="verde-input"
          type="password"
          placeholder="Şifreniz"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') verify()
          }}
          style={{ maxWidth: 320 }}
        />
        <Button variant="primary" onClick={verify} disabled={loading || !password}>
          {loading ? 'Kontrol ediliyor…' : 'Onayla'}
        </Button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#7a907a' }}>
        Not: Bu onay tarayıcı oturumu içinde \(~{Math.round(ttlMs / 60000)} dk\) geçerlidir.
      </div>
    </div>
  )
}

