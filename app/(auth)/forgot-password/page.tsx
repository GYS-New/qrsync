'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const redirectTo = `${window.location.origin}/reset-password`

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (resetError) {
      setError('Şifre sıfırlama e-postası gönderilemedi. Lütfen tekrar deneyin.')
      setLoading(false)
      return
    }

    setMessage('E-posta adresinize şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.')
    setLoading(false)
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
            Şifremi Unuttum
          </h1>
          <p className="mt-1 text-[12.75px]" style={{ color: 'var(--text-400)' }}>
            E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.
          </p>

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

          <form onSubmit={handleSend} className="mt-5">
            <div className="mb-4">
              <label className="verde-label">E-Posta</label>
              <div
                className="flex items-center gap-2 rounded-[12px] border px-3 py-[10px] transition-colors"
                style={{ background: 'rgba(240,249,240,.9)', borderColor: 'rgba(214,228,214,.95)' }}
              >
                <Mail className="h-[18px] w-[18px]" style={{ color: 'var(--text-300)' }} />
                <input
                  className="w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--text-300)]"
                  type="email"
                  placeholder="ornek@sirket.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[12px] px-4 py-3 text-[13.5px] font-black text-white shadow-[0_16px_34px_rgba(46,139,46,.22)] transition-all hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-60 disabled:shadow-none"
              style={{ background: 'linear-gradient(145deg, var(--green-600), var(--green-500))' }}
            >
              {loading ? 'Gönderiliyor...' : 'Sıfırlama Linki Gönder →'}
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
