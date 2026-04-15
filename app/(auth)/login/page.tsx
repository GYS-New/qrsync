'use client'
import ProataLogo from '@/components/brand/ProataLogo'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import QRCodePng from '@/components/ui/QRCodePng'

function AnimatedQrPreview() {
  return (
    <div className="relative h-[190px] w-[190px] overflow-hidden rounded-[14px] border border-[rgba(79,106,255,.12)] bg-white">
      <div
        className="absolute inset-0 rounded-[14px]"
        style={{
          background:
            'linear-gradient(180deg, rgba(240,249,240,.88), rgba(255,255,255,.92))',
          animation: 'qrPlateReveal 450ms ease-out both',
        }}
      />
      <div className="absolute inset-[10px] overflow-hidden rounded-[12px]">
        <QRCodePng
          value="https://app.qrsync.com/qr/lokasyon-merkez-depo-a1-kontrol-noktasi"
          size={170}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(180deg, rgba(255,255,255,.96) 0px, rgba(255,255,255,.96) 9px, rgba(255,255,255,0) 9px, rgba(255,255,255,0) 22px)',
            animation: 'qrBuildMask 1650ms ease-out 280ms both',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.12) 46%, rgba(255,255,255,.66) 50%, rgba(255,255,255,.12) 54%, rgba(255,255,255,0) 100%)',
            transform: 'translateX(-135%) skewX(-18deg)',
            animation: 'glassSweep 650ms ease-out 2250ms 1 both',
            mixBlendMode: 'screen',
          }}
        />
      </div>
    </div>
  )
}

function AnimatedNfcPreview() {
  return (
    <div className="relative h-[190px] w-[190px] overflow-hidden rounded-[14px] border border-[rgba(79,106,255,.12)] bg-white">
      <div
        className="absolute inset-0 rounded-[14px]"
        style={{
          background:
            'linear-gradient(180deg, rgba(240,249,240,.88), rgba(255,255,255,.92))',
          animation: 'qrPlateReveal 520ms ease-out both',
        }}
      />

      <div className="absolute inset-[10px] overflow-hidden rounded-[12px]">
        <div
          className="absolute left-1/2 top-1/2 h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border-[8px] border-[var(--green-700)] opacity-0"
          style={{ animation: 'nfcFrameIn 620ms ease-out 260ms both' }}
        />

        <div
          className="absolute left-[51%] top-1/2 h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--green-700)] opacity-0"
          style={{ animation: 'nfcDotIn 340ms ease-out 1120ms both' }}
        />

        {[52, 88, 124].map((size, index) => (
          <div
            key={size}
            className="absolute left-[51%] top-1/2 rounded-full border-[7px] border-transparent border-r-[var(--green-700)] border-t-[var(--green-700)] opacity-0"
            style={{
              width: size,
              height: size,
              transform: 'translate(-50%, -50%) rotate(45deg)',
              animation: `nfcWaveIn 420ms ease-out ${1380 + index * 220}ms both`,
            }}
          />
        ))}

        <div
          className="absolute left-[20%] top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 select-none text-[34px] font-black leading-none text-[var(--green-700)] opacity-0"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            letterSpacing: '.12em',
            animation: 'nfcTextIn 420ms ease-out 1840ms both',
          }}
        >
          NFC
        </div>

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.08) 46%, rgba(255,255,255,.62) 50%, rgba(255,255,255,.08) 54%, rgba(255,255,255,0) 100%)',
            transform: 'translateX(-135%) skewX(-18deg)',
            animation: 'glassSweep 700ms ease-out 2220ms 1 both',
            mixBlendMode: 'screen',
          }}
        />
      </div>
    </div>
  )
}

function ReadyCard({ title, subtitle, type }: { title: string; subtitle: string; type: 'qr' | 'nfc' }) {
  return (
    <div
      className="h-full w-full rounded-[16px] border border-[rgba(79,106,255,.15)] bg-white/75 p-3 shadow-[0_1px_4px_rgba(15,40,15,0.07),0_1px_2px_rgba(15,40,15,0.04)]"
      style={{ animation: 'fadeUp 750ms ease 220ms both' }}
    >
      <div className="grid place-items-center">{type === 'qr' ? <AnimatedQrPreview /> : <AnimatedNfcPreview />}</div>
      <div className="mt-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-black">{title}</div>
          <div className="mt-0.5 truncate text-[13px]" style={{ color: 'var(--text-400)' }}>
            {subtitle}
          </div>
        </div>
        <div
          className="h-[10px] w-[10px] shrink-0 rounded-full"
          style={{ background: '#4F6AFF', boxShadow: '0 0 0 6px rgba(79,106,255,.15)' }}
        />
      </div>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [appLogo, setAppLogo] = useState<string | null | undefined>(undefined) // undefined = henüz yüklenmedi
  const [appName, setAppName] = useState('QR-Sync')

  useEffect(() => {
    fetch('/api/public/app-config')
      .then(r => r.ok ? r.json() : null)
      .then(j => { setAppLogo(j?.logo ?? null); setAppName(j?.isim ?? 'QR-Sync') })
      .catch(() => setAppLogo(null))
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    void remember

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      const msg = authError.message?.toLowerCase() ?? ''
      if (
        msg.includes('rate limit') ||
        msg.includes('over_email_send_rate_limit') ||
        msg.includes('too many requests') ||
        authError.status === 429
      ) {
        setError('Çok fazla giriş denemesi yapıldı. Lütfen birkaç dakika bekleyip tekrar deneyin.')
      } else if (msg.includes('email not confirmed')) {
        setError('E-posta adresiniz henüz onaylanmamış. Lütfen gelen kutunuzu kontrol edin.')
      } else if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials') || msg.includes('wrong password')) {
        setError('E-posta veya şifre hatalı.')
      } else {
        setError(authError.message ?? 'Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.')
      }
      setLoading(false)
      return
    }

    if (data.user) {
      const { data: userData } = await supabase.from('users').select('rol').eq('id', data.user.id).single()
      const rol = userData?.rol
      if (rol === 'super_admin' || rol === 'alt_super_admin') router.push('/sa/dashboard')
      else if (rol === 'tenant_admin') router.push('/ta/dashboard')
      else router.push('/u/dashboard')  // tenant_user ve musteri
    }

    setLoading(false)
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <style jsx global>{`
        @keyframes qrPlateReveal {
          0% { opacity: 0; transform: scale(.965); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes qrBuildMask {
          0% { transform: translateY(0%); opacity: 1; }
          100% { transform: translateY(108%); opacity: 1; }
        }
        @keyframes nfcFrameIn {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.78); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes nfcDotIn {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.35); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes nfcWaveIn {
          0% { opacity: 0; transform: translate(-50%, -50%) rotate(45deg) scale(.55); }
          100% { opacity: 1; transform: translate(-50%, -50%) rotate(45deg) scale(1); }
        }
        @keyframes nfcTextIn {
          0% { opacity: 0; letter-spacing: .08em; transform: translateY(-50%) translateX(-6px) scale(.92); }
          100% { opacity: .78; letter-spacing: .16em; transform: translateY(-50%) translateX(0) scale(1); }
        }
        @keyframes glassSweep {
          0% { transform: translateX(-135%) skewX(-18deg); opacity: 0; }
          18% { opacity: 1; }
          68% { opacity: .9; }
          100% { transform: translateX(135%) skewX(-18deg); opacity: 0; }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(79,106,255,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(79,106,255,.12) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(60% 60% at 50% 40%, black 40%, transparent 72%)',
          animation: 'fadeIn 700ms ease forwards',
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-28 top-[18%] h-[320px] w-[320px] rounded-full blur-[18px] opacity-60"
        style={{ background: 'rgba(79,106,255,.18)', animation: 'fadeIn 600ms ease forwards' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-36 top-[8%] h-[380px] w-[380px] rounded-full blur-[18px] opacity-70"
        style={{ background: 'rgba(107,138,255,.30)', animation: 'fadeIn 600ms ease forwards' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[55%] -bottom-28 h-[260px] w-[260px] rounded-full blur-[18px] opacity-60"
        style={{ background: 'rgba(26,31,54,.15)', animation: 'fadeIn 600ms ease forwards' }}
      />

      <main className="relative mx-auto grid min-h-screen w-full max-w-[1000px] place-items-center px-4 py-10">
        <section className="grid w-full grid-cols-1 gap-5 md:grid-cols-[1.15fr_.85fr]">
          <aside
            className="hidden overflow-hidden rounded-[14px] border border-[rgba(79,106,255,.15)] bg-white/80 p-6 shadow-[0_14px_40px_rgba(26,31,54,0.10),0_2px_8px_rgba(26,31,54,0.06)] backdrop-blur-[10px] md:block"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,.85), rgba(240,244,255,.70)), radial-gradient(800px 420px at 20% 20%, rgba(79,106,255,.12), transparent 55%), radial-gradient(700px 420px at 80% 80%, rgba(107,138,255,.20), transparent 60%)',
              animation: 'fadeUp 700ms ease 60ms both',
            }}
          >
            <div className="flex items-center" style={{ minHeight: 52 }}>
              {appLogo === undefined ? null : appLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={appLogo} alt={appName} style={{ height: 'auto', maxHeight: 120, maxWidth: 420, objectFit: 'contain' }} />
              ) : (
                <ProataLogo variant="full" scale={1} />
              )}
            </div>

            <div className="mt-6 text-[26px] font-black leading-[1.18] tracking-[-1.1px]">
              Operasyonlarını tek ekranda yönet, QR ile hızlandır.
            </div>
            <div className="mt-3 max-w-[46ch] text-[16px] leading-[1.55]" style={{ color: 'var(--text-500)' }}>
              Lokasyon hiyerarşisi, kullanıcı atamaları ve hızlı aksiyonlar için sade, kurumsal ve güvenli bir deneyim.
            </div>

            <div className="mt-5 grid gap-3">
              {[
                {
                  t: 'Gelişmiş Lokasyon Hiyerarşisi',
                  d: 'Endüstriyel Tesisler İçin Yapılandırılabilir Lokasyonlar',
                },
                {
                  t: 'Gelişmiş Görev Yönetim Sistemi',
                  d: 'Frekansiyel ve Tasarlanabilir Görev Yapısı ',
                },
                {
                  t: 'Frekansiyel Görev İzleme Arayüzü',
                  d: 'Tüm Saha Aktivitelerinizi Anlık Olarak İzleyin ve Yönetin.',
                },
              ].map((x, i) => (
                <div
                  key={x.t}
                  className="flex gap-3 rounded-[12px] border border-[rgba(79,106,255,.15)] bg-white/80 p-3 shadow-[0_1px_2px_rgba(15,40,15,0.05)]"
                  style={{ animation: `fadeUp 700ms ease ${120 + i * 80}ms both` }}
                >
                  <div
                    className="mt-[6px] h-[10px] w-[10px] shrink-0 rounded-full"
                    style={{ background: '#4F6AFF', boxShadow: '0 0 0 5px rgba(79,106,255,.15)' }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-extrabold">{x.t}</div>
                    <div className="mt-[2px] text-[14px] leading-[1.35]" style={{ color: 'var(--text-500)' }}>
                      {x.d}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid w-full max-w-[520px] grid-cols-2 gap-4">
              <ReadyCard title="QR-Ready" subtitle="Lokasyon token & takip" type="qr" />
              <ReadyCard title="NFC-Ready" subtitle="Temassız okut & takip" type="nfc" />
            </div>
          </aside>

          <section
            className="relative overflow-hidden rounded-[14px] border border-[rgba(79,106,255,.12)] bg-white/85 p-7 shadow-[0_14px_40px_rgba(26,31,54,0.10),0_2px_8px_rgba(26,31,54,0.06)] backdrop-blur-[10px]"
            style={{ animation: 'fadeUp 700ms ease 100ms both' }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-[280px] w-[280px] blur-[6px]"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, rgba(79,106,255,.12), transparent 55%), radial-gradient(circle at 70% 70%, rgba(107,138,255,.20), transparent 58%)',
                transform: 'rotate(12deg)',
              }}
            />

            <div className="relative">
              <h1 className="text-[20px] font-black tracking-[-0.4px]" style={{ color: 'var(--text-900)' }}>
                Giriş Yap
              </h1>
              <p className="mt-1 text-[14px]" style={{ color: 'var(--text-400)' }}>
                Hesabınıza erişmek için bilgilerinizi girin.
              </p>

              {error && (
                <div
                  className="mt-4 rounded-[10px] border px-3 py-2 text-[14px] font-medium"
                  style={{ background: 'var(--red-l)', borderColor: '#fecaca', color: 'var(--red)' }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-5">
                <div className="mb-4">
                  <label className="verde-label">E-Posta</label>
                  <div
                    className="flex items-center gap-2 rounded-[6px] border px-3 py-[10px] transition-colors"
                    style={{ background: 'rgba(240,244,255,.9)', borderColor: 'rgba(214,228,214,.95)' }}
                  >
                    <Mail className="h-[18px] w-[18px]" style={{ color: 'var(--text-300)' }} />
                    <input
                      className="auth-input w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--text-300)]"
                      type="email"
                      placeholder="ornek@sirket.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="verde-label">Şifre</label>
                  <div
                    className="flex items-center gap-2 rounded-[6px] border px-3 py-[10px] transition-colors"
                    style={{ background: 'rgba(240,244,255,.9)', borderColor: 'rgba(214,228,214,.95)' }}
                  >
                    <Lock className="h-[18px] w-[18px]" style={{ color: 'var(--text-300)' }} />
                    <input
                      className="auth-input w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--text-300)]"
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="rounded-[6px] p-1 transition-colors hover:bg-[rgba(240,249,240,.9)]"
                      aria-label="Şifreyi göster/gizle"
                    >
                      {showPw ? (
                        <EyeOff className="h-[18px] w-[18px]" style={{ color: 'var(--text-500)' }} />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" style={{ color: 'var(--text-500)' }} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mb-12 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[16px]" style={{ color: 'var(--text-500)' }}>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Beni hatırla
                  </label>
                  <button
                    type="button"
                    className="text-[16px] font-bold hover:underline"
                    style={{ color: '#4F6AFF' }}
                    onClick={() => router.push('/forgot-password')}
                  >
                    Şifremi unuttum
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-[6px] px-4 py-3 text-[17px] font-medium text-white shadow-[0_16px_34px_rgba(79,106,255,.22)] transition-all hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-60 disabled:shadow-none"
                  style={{ background: 'linear-gradient(145deg, #1a1f36, #4F6AFF)' }}
                >
                  {loading ? 'Giriş yapılıyor...' : 'Giriş Yap →'}
                </button>

                <p className="mt-8 text-[14px] leading-[1.45]" style={{ color: 'var(--text-400)' }}>
                  Güvenlik: Giriş denemeleri izlenir. Sorun yaşarsanız yöneticinizle iletişime geçin.
                </p>

                <p className="mt-64 text-center text-[13px]" style={{ color: 'var(--text-400)' }}>
                  © 2026 İO Teknoloji · Tüm hakları saklıdır
                </p>
              </form>
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
