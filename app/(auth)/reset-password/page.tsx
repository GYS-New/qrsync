'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Ensure a session exists from the recovery link (supports both code and hash token flows)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const access_token = hashParams.get('access_token')
        const refresh_token = hashParams.get('refresh_token')

        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
        } else if (code) {
          // @supabase/supabase-js v2 supports PKCE exchange for recovery links
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyAuth: any = supabase.auth
          if (typeof anyAuth.exchangeCodeForSession === 'function') {
            await anyAuth.exchangeCodeForSession(code)
          }
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [supabase])

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password.length < 8) {
      setError('Şifre en az 8 karakter olmalıdır.')
      return
    }
    if (password !== password2) {
      setError('Şifreler eşleşmiyor.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError('Şifre güncellenemedi. Bağlantınız süresi dolmuş olabilir. Lütfen tekrar deneyin.')
      setLoading(false)
      return
    }

    setMessage('Şifreniz güncellendi. Giriş sayfasına yönlendiriliyorsunuz...')
    await supabase.auth.signOut()
    setLoading(false)
    setTimeout(() => router.push('/login'), 650)
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(214,228,214,.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(214,228,214,.55) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(60% 60% at 50% 40%, black 40%, transparent 72%)',
          animation: 'fadeIn 700ms ease forwards',
        }}
      />

      <main className="relative mx-auto grid min-h-screen w-full max-w-[620px] place-items-center px-4 py-10">
        <section
          className="w-full overflow-hidden rounded-[14px] border border-[rgba(214,228,214,.95)] bg-white/85 p-7 shadow-[0_14px_40px_rgba(15,40,15,0.10),0_2px_8px_rgba(15,40,15,0.06)] backdrop-blur-[10px]"
          style={{ animation: 'fadeUp 700ms ease 100ms both' }}
        >
          <h1 className="text-[18px] font-black tracking-[-0.4px]" style={{ color: 'var(--text-900)' }}>
            Yeni Şifre Belirle
          </h1>
          <p className="mt-1 text-[12.75px]" style={{ color: 'var(--text-400)' }}>
            Lütfen yeni şifrenizi girin.
          </p>

          {!ready && (
            <div className="mt-4 text-[12.75px]" style={{ color: 'var(--text-500)' }}>
              Bağlantı doğrulanıyor...
            </div>
          )}

          {error && (
            <div
              className="mt-4 rounded-[10px] border px-3 py-2 text-[12.75px] font-medium"
              style={{ background: 'var(--red-l)', borderColor: '#fecaca', color: 'var(--red)' }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              className="mt-4 rounded-[10px] border px-3 py-2 text-[12.75px] font-medium"
              style={{ background: 'rgba(240,249,240,.9)', borderColor: 'rgba(46,139,46,.25)', color: 'var(--text-700)' }}
            >
              {message}
            </div>
          )}

          <form onSubmit={handleUpdate} className="mt-5">
            <div className="mb-3">
              <label className="verde-label">Yeni Şifre</label>
              <div
                className="flex items-center gap-2 rounded-[12px] border px-3 py-[10px] transition-colors"
                style={{ background: 'rgba(240,249,240,.9)', borderColor: 'rgba(214,228,214,.95)' }}
              >
                <Lock className="h-[18px] w-[18px]" style={{ color: 'var(--text-300)' }} />
                <input
                  className="w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--text-300)]"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  disabled={!ready || loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="rounded-[10px] p-1 transition-colors hover:bg-[rgba(240,249,240,.9)]"
                  aria-label="Şifreyi göster/gizle"
                >
                  {showPw ? (
                    <EyeOff className="h-[18px] w-[18px]" style={{ color: 'var(--text-500)' }} />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" style={{ color: 'var(--text-500)' }} />
                  )}
                </button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 4, display: 'block' }}>Minimum 8, maksimum 72 karakter</span>
            </div>

            <div className="mb-4">
              <label className="verde-label">Yeni Şifre (Tekrar)</label>
              <div
                className="flex items-center gap-2 rounded-[12px] border px-3 py-[10px] transition-colors"
                style={{ background: 'rgba(240,249,240,.9)', borderColor: 'rgba(214,228,214,.95)' }}
              >
                <Lock className="h-[18px] w-[18px]" style={{ color: 'var(--text-300)' }} />
                <input
                  className="w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--text-300)]"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  disabled={!ready || loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!ready || loading}
              className="w-full rounded-[12px] px-4 py-3 text-[13.5px] font-black text-white shadow-[0_16px_34px_rgba(46,139,46,.22)] transition-all hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-60 disabled:shadow-none"
              style={{ background: 'linear-gradient(145deg, var(--green-600), var(--green-500))' }}
            >
              {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle →'}
            </button>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                className="text-[12.75px] font-bold hover:underline"
                style={{ color: 'var(--green-700)' }}
                onClick={() => router.push('/login')}
              >
                ← Girişe dön
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
