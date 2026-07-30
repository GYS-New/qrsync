'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Car, Building2, LogOut, ArrowRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ProataLogo from '@/components/brand/ProataLogo'
import type { ModulBilgisi, ModulKodu } from '@/lib/modul/yetkiliModuller'

interface Props {
  moduller: ModulBilgisi[]
  kullaniciAdi: string
  hataMesaji?: string | null  // server tarafından iletilen loop-kırıcı hata mesajı
}

const IKON_MAP: Record<string, any> = {
  shield:   Shield,
  car:      Car,
  building: Building2,
}

const MODUL_ACIKLAMA: Record<ModulKodu, string> = {
  gys:        'Görev yönetim sistemi — lokasyonlar, frekansiyel görevler, raporlar.',
  oto_yikama: 'Araç yıkama planlama ve takibi — günlük plan, plaka eşleştirme, raporlar.',
  fms:        'Tesis yönetim sistemi — bakım, varlık, talep yönetimi.',
}

// Her modülün tema rengi
const MODUL_RENK: Record<ModulKodu, { hex: string; rgb: string; name: string }> = {
  gys:        { hex: '#4F6AFF', rgb: '79, 106, 255',  name: 'mavi' },
  oto_yikama: { hex: '#6366f1', rgb: '99, 102, 241',  name: 'indigo' },
  fms:        { hex: '#8b5cf6', rgb: '139, 92, 246',  name: 'mor' },
}

// Modül için pazarlama etiketi (loginteki "feature card" gibi)
const MODUL_ETIKET: Record<ModulKodu, string> = {
  gys:        'Endüstriyel görev yönetimi',
  oto_yikama: 'Yıkama operasyonu özel',
  fms:        'Tesis & bakım yönetimi',
}

export default function ModulSecClient({ moduller, kullaniciAdi, hataMesaji }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState<ModulKodu | null>(null)
  const [hata, setHata] = useState(hataMesaji ?? '')
  const [appLogo, setAppLogo] = useState<string | null | undefined>(undefined)
  const [appName, setAppName] = useState('iO-GYS')

  useEffect(() => {
    fetch('/api/public/app-config')
      .then(r => r.ok ? r.json() : null)
      .then(j => { setAppLogo(j?.logo ?? null); setAppName(j?.isim ?? 'iO-GYS') })
      .catch(() => setAppLogo(null))
  }, [])

  async function modulSec(modul: ModulKodu) {
    setLoading(modul)
    setHata('')
    const res = await fetch('/api/modul/sec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modul }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setHata(data?.error ?? 'Modül seçilemedi')
      setLoading(null)
      return
    }
    router.push(data.url)
  }

  async function cikisYap() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <style jsx global>{`
        @keyframes modulFadeUp {
          0%   { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes modulIconFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-4px) rotate(-2deg); }
        }
        @keyframes modulShine {
          0%   { transform: translateX(-150%) skewX(-22deg); opacity: 0; }
          15%  { opacity: 0.95; }
          80%  { opacity: 0.6; }
          100% { transform: translateX(170%) skewX(-22deg); opacity: 0; }
        }
        @keyframes modulPulseRing {
          0%   { transform: scale(1); opacity: 0.55; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes modulOrb {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(12px, -10px); }
        }
        .modul-card {
          animation: modulFadeUp 700ms cubic-bezier(.22,.61,.36,1) both;
        }
        .modul-card-active::before {
          content: '';
          position: absolute; inset: -1px;
          border-radius: inherit;
          padding: 1.5px;
          background: linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>

      {/* Grid mask + gradient orbs (login estetiği) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{
        backgroundImage:
          'linear-gradient(to right, rgba(79,106,255,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(79,106,255,.12) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(55% 55% at 50% 30%, black 40%, transparent 75%)',
      }} />
      <div aria-hidden className="pointer-events-none absolute -left-32 top-[10%] h-[360px] w-[360px] rounded-full opacity-60"
        style={{ background: 'rgba(79,106,255,.20)', filter: 'blur(18px)', animation: 'modulOrb 9s ease-in-out infinite' }} />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-[4%] h-[420px] w-[420px] rounded-full opacity-70"
        style={{ background: 'rgba(107,138,255,.30)', filter: 'blur(20px)', animation: 'modulOrb 11s ease-in-out infinite reverse' }} />
      <div aria-hidden className="pointer-events-none absolute left-[55%] -bottom-32 h-[300px] w-[300px] rounded-full opacity-55"
        style={{ background: 'rgba(99,102,241,.18)', filter: 'blur(20px)', animation: 'modulOrb 13s ease-in-out infinite' }} />

      <main className="relative mx-auto w-full max-w-[1180px] px-5 py-9">

        {/* ─── ÜST BAR: logo + kullanıcı + çıkış ─── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 18, marginBottom: 40, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {appLogo === undefined ? null : appLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appLogo} alt={appName} style={{ height: 'auto', maxHeight: 130, maxWidth: 480, objectFit: 'contain' }} />
            ) : (
              <ProataLogo variant="full" scale={1.8} />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
              <div style={{ fontSize: 15, color: 'var(--text-400)', fontWeight: 600, marginBottom: 2 }}>Hoş geldin</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-900)', letterSpacing: '-0.5px' }}>
                {kullaniciAdi || 'Kullanıcı'}
              </div>
            </div>
            <button
              type="button"
              onClick={cikisYap}
              className="inline-flex items-center gap-2"
              style={{
                padding: '12px 20px',
                background: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(214,228,214,.95)',
                borderRadius: 12,
                fontSize: 15, fontWeight: 700,
                color: 'var(--text-500)',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 1px 3px rgba(15,40,15,0.06)',
              }}
            >
              <LogOut size={17} /> Çıkış
            </button>
          </div>
        </div>

        {/* ─── BAŞLIK BLOĞU ─── */}
        <div style={{ marginBottom: 30, maxWidth: 760, animation: 'modulFadeUp 600ms ease both' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 999,
            background: 'rgba(79,106,255,.10)', border: '1px solid rgba(79,106,255,.20)', color: '#4F6AFF',
            fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 14 }}>
            <Sparkles size={13} /> MODÜL SEÇİMİ
          </div>
          <h1 style={{
            fontSize: 38, fontWeight: 900, color: 'var(--text-900)',
            letterSpacing: '-1.4px', lineHeight: 1.05, margin: 0,
          }}>
            Hangi modülde <span style={{
              background: 'linear-gradient(135deg, #4F6AFF, #6366f1)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>çalışacaksın</span>?
          </h1>
          <p style={{
            marginTop: 10, fontSize: 15, color: 'var(--text-400)', lineHeight: 1.55, maxWidth: 580,
          }}>
            Erişim yetkin olan modülü seç; daha sonra üst paneldeki kullanıcı menüsünden istediğin
            zaman değiştirebilirsin.
          </p>
        </div>

        {hata && (
          <div style={{
            marginBottom: 16,
            padding: '11px 16px',
            background: 'var(--red-l)',
            border: '1px solid #fecaca',
            borderRadius: 12,
            fontSize: 13.5, fontWeight: 600, color: 'var(--red)',
            animation: 'modulFadeUp 350ms ease',
          }}>{hata}</div>
        )}

        {/* ─── MODÜL KARTLARI ─── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: 18,
        }}>
          {moduller.map((m, i) => {
            const Icon = IKON_MAP[m.ikon] ?? Shield
            const yuklenmekte = loading === m.kod
            const disabled = !m.aktif || yuklenmekte
            const renk = MODUL_RENK[m.kod]
            return (
              <button
                key={m.kod}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && modulSec(m.kod)}
                className="modul-card"
                style={{
                  position: 'relative',
                  background: m.aktif
                    ? 'linear-gradient(155deg, rgba(255,255,255,0.95), rgba(255,255,255,0.78))'
                    : 'linear-gradient(155deg, rgba(248,250,252,0.85), rgba(241,245,249,0.7))',
                  border: m.aktif
                    ? `1px solid rgba(${renk.rgb}, 0.22)`
                    : '1px solid rgba(214,228,214,0.6)',
                  borderRadius: 18,
                  padding: 24,
                  textAlign: 'left',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: m.aktif ? 1 : 0.6,
                  transition: 'transform .25s cubic-bezier(.22,.61,.36,1), box-shadow .25s, border-color .25s',
                  boxShadow: m.aktif
                    ? `0 14px 40px rgba(15,40,15,0.08), 0 2px 6px rgba(15,40,15,0.04), inset 0 1px 0 rgba(255,255,255,0.9)`
                    : 'inset 0 1px 0 rgba(255,255,255,0.6)',
                  display: 'flex', flexDirection: 'column', gap: 14,
                  minHeight: 240,
                  overflow: 'hidden',
                  animationDelay: `${i * 90}ms`,
                  backdropFilter: 'blur(10px)',
                }}
                onMouseEnter={(e) => {
                  if (!disabled) {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = `0 22px 60px rgba(${renk.rgb}, 0.18), 0 4px 12px rgba(15,40,15,0.06), inset 0 1px 0 rgba(255,255,255,0.9)`
                    e.currentTarget.style.borderColor = `rgba(${renk.rgb}, 0.45)`
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled) {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = `0 14px 40px rgba(15,40,15,0.08), 0 2px 6px rgba(15,40,15,0.04), inset 0 1px 0 rgba(255,255,255,0.9)`
                    e.currentTarget.style.borderColor = `rgba(${renk.rgb}, 0.22)`
                  }
                }}
              >
                {/* Glass shine animation (sadece aktif kartlarda) */}
                {m.aktif && (
                  <div aria-hidden style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                    pointerEvents: 'none',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,.6) 50%, transparent 100%)',
                    transform: 'translateX(-150%) skewX(-22deg)',
                    animation: `modulShine 2.4s ease ${0.4 + i * 0.15}s 1`,
                  }} />
                )}

                {/* "Yakında" badge */}
                {!m.aktif && (
                  <div style={{
                    position: 'absolute', top: 16, right: 16,
                    background: 'rgba(15,23,42,0.08)',
                    color: 'var(--text-500)',
                    fontSize: 10.5, fontWeight: 800,
                    padding: '4px 11px', borderRadius: 999,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>Yakında</div>
                )}

                {/* İkon + aura */}
                <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
                  {m.aktif && (
                    <>
                      <span aria-hidden style={{
                        position: 'absolute', inset: -6, borderRadius: 18,
                        background: `radial-gradient(circle, rgba(${renk.rgb}, 0.35), transparent 70%)`,
                        filter: 'blur(10px)',
                      }} />
                      {/* pulse ring */}
                      <span aria-hidden style={{
                        position: 'absolute', inset: 0, borderRadius: 16,
                        border: `2px solid rgba(${renk.rgb}, 0.55)`,
                        animation: `modulPulseRing 2.4s ease ${0.5 + i * 0.2}s infinite`,
                      }} />
                    </>
                  )}
                  <div style={{
                    position: 'relative',
                    width: 62, height: 62, borderRadius: 16,
                    background: m.aktif
                      ? `linear-gradient(145deg, rgba(${renk.rgb}, 0.18), rgba(${renk.rgb}, 0.32))`
                      : 'rgba(241,245,249,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: m.aktif ? renk.hex : 'var(--text-400)',
                    boxShadow: m.aktif ? `inset 0 1px 0 rgba(255,255,255,0.55)` : 'none',
                    animation: m.aktif ? `modulIconFloat 4.5s ease-in-out ${i * 0.4}s infinite` : 'none',
                  }}>
                    <Icon size={30} strokeWidth={2.2} />
                  </div>
                </div>

                {/* Etiket — mini pill */}
                <div style={{
                  fontSize: 10.5, fontWeight: 700, color: m.aktif ? renk.hex : 'var(--text-400)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  {MODUL_ETIKET[m.kod]}
                </div>

                <div>
                  <div style={{
                    fontSize: 22, fontWeight: 900, color: 'var(--text-900)',
                    marginBottom: 6, letterSpacing: '-0.5px', lineHeight: 1.1,
                  }}>{m.ad}</div>
                  <div style={{
                    fontSize: 13, color: 'var(--text-500)', lineHeight: 1.55, minHeight: 60,
                  }}>{MODUL_ACIKLAMA[m.kod]}</div>
                </div>

                {/* CTA */}
                <div style={{
                  marginTop: 'auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: 10, borderTop: '1px dashed rgba(214,228,214,0.7)',
                }}>
                  <span style={{
                    fontSize: 13.5, fontWeight: 800,
                    color: m.aktif ? renk.hex : 'var(--text-400)',
                  }}>
                    {yuklenmekte ? 'Açılıyor…' : (m.aktif ? 'Devam Et' : 'Henüz aktif değil')}
                  </span>
                  {m.aktif && (
                    <span style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: yuklenmekte ? `rgba(${renk.rgb}, 0.15)` : `linear-gradient(145deg, ${renk.hex}, ${renk.hex}dd)`,
                      color: yuklenmekte ? renk.hex : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: yuklenmekte ? 'none' : `0 4px 14px rgba(${renk.rgb}, 0.35)`,
                      transition: 'all 0.2s',
                    }}>
                      {yuklenmekte
                        ? <div style={{ width: 12, height: 12, border: `2px solid ${renk.hex}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        : <ArrowRight size={15} strokeWidth={2.5} />
                      }
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p style={{
          marginTop: 36, fontSize: 12.5, color: 'var(--text-400)', textAlign: 'center',
          animation: 'modulFadeUp 700ms ease 400ms both',
        }}>
          Modül listesi, hesabınız ve firmanız için tanımlı yetkilere göre gösteriliyor.
        </p>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
