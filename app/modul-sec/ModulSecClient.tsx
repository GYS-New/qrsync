'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Car, Building2, LogOut, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ModulBilgisi, ModulKodu } from '@/lib/modul/yetkiliModuller'

interface Props {
  moduller: ModulBilgisi[]
  kullaniciAdi: string
}

const IKON_MAP: Record<string, any> = {
  shield:   Shield,
  car:      Car,
  building: Building2,
}

const MODUL_AKLAMA: Record<ModulKodu, string> = {
  gys:        'Görev yönetim sistemi — lokasyonlar, frekansiyel görevler, raporlar.',
  oto_yikama: 'Araç yıkama planlama ve takibi — günlük plan, plaka eşleştirme, raporlar.',
  fms:        'Tesis yönetim sistemi — bakım, varlık, talep yönetimi.',
}

export default function ModulSecClient({ moduller, kullaniciAdi }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState<ModulKodu | null>(null)
  const [hata, setHata] = useState('')

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
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '40px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Login sayfasıyla tutarlı gradient + grid arka plan */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, opacity: 0.6, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(to right, rgba(79,106,255,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(79,106,255,.12) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(60% 60% at 50% 40%, black 40%, transparent 72%)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', left: -120, top: '18%', width: 320, height: 320,
        background: 'rgba(79,106,255,.18)', borderRadius: '50%', filter: 'blur(18px)', opacity: 0.6, pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', right: -140, top: '8%', width: 380, height: 380,
        background: 'rgba(107,138,255,.30)', borderRadius: '50%', filter: 'blur(18px)', opacity: 0.7, pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        maxWidth: 980,
        margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-400)', marginBottom: 4 }}>Hoş geldin</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-900)' }}>
              {kullaniciAdi || 'Kullanıcı'}
            </div>
          </div>
          <button
            type="button"
            onClick={cikisYap}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px',
              background: '#fff',
              border: '1px solid rgba(214,228,214,.95)',
              borderRadius: 8,
              fontSize: 14, fontWeight: 600,
              color: 'var(--text-500)',
              cursor: 'pointer',
            }}
          >
            <LogOut size={16} /> Çıkış
          </button>
        </div>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.8px', color: 'var(--text-900)', margin: 0 }}>
            Modül seç
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-400)', marginTop: 6 }}>
            Erişim yetkin olan modülü seçerek devam et. Modülü daha sonra Topbar'dan değiştirebilirsin.
          </p>
        </div>

        {hata && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--red-l)',
            border: '1px solid #fecaca',
            borderRadius: 10,
            fontSize: 14, fontWeight: 600, color: 'var(--red)',
          }}>{hata}</div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}>
          {moduller.map(m => {
            const Icon = IKON_MAP[m.ikon] ?? Shield
            const yuklenmekte = loading === m.kod
            const disabled = !m.aktif || yuklenmekte
            return (
              <button
                key={m.kod}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && modulSec(m.kod)}
                style={{
                  position: 'relative',
                  background: '#fff',
                  border: m.aktif ? '1px solid rgba(79,106,255,.18)' : '1px solid rgba(214,228,214,.6)',
                  borderRadius: 14,
                  padding: 24,
                  textAlign: 'left',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: m.aktif ? 1 : 0.5,
                  transition: 'all .15s',
                  boxShadow: m.aktif ? '0 4px 16px rgba(26,31,54,0.06)' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 14,
                  minHeight: 200,
                }}
                onMouseEnter={(e) => {
                  if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                }}
              >
                {!m.aktif && (
                  <span style={{
                    position: 'absolute', top: 14, right: 14,
                    background: 'rgba(214,228,214,.7)', color: 'var(--text-500)',
                    fontSize: 11, fontWeight: 700,
                    padding: '4px 10px', borderRadius: 999,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>Yakında</span>
                )}

                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: 'linear-gradient(145deg, rgba(79,106,255,.12), rgba(107,138,255,.18))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#4F6AFF',
                }}>
                  <Icon size={28} strokeWidth={2.2} />
                </div>

                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-900)', marginBottom: 4 }}>
                    {m.ad}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-500)', lineHeight: 1.5 }}>
                    {MODUL_AKLAMA[m.kod]}
                  </div>
                </div>

                <div style={{
                  marginTop: 'auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 13, fontWeight: 700,
                  color: m.aktif ? '#4F6AFF' : 'var(--text-400)',
                }}>
                  <span>{yuklenmekte ? 'Açılıyor…' : (m.aktif ? 'Devam Et' : 'Henüz aktif değil')}</span>
                  {m.aktif && !yuklenmekte && <ChevronRight size={18} />}
                </div>
              </button>
            )
          })}
        </div>

        <p style={{ marginTop: 36, fontSize: 12, color: 'var(--text-400)', textAlign: 'center' }}>
          Modül listesi, hesabınız ve firmanız için tanımlı yetkilere göre gösteriliyor.
        </p>
      </div>
    </div>
  )
}
