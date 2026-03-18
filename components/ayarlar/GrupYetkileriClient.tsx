'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

const ROLLER = [
  { rol: 'alt_super_admin', label: '2.SA — Alt Süper Admin', renk: '#2e7d32', bg: '#e8f4e8' },
  { rol: 'tenant_admin',    label: 'TA — Firma Admini',      renk: '#e65100', bg: '#fff3e0' },
  { rol: 'musteri',         label: 'M — Müşteri',            renk: '#1565c0', bg: '#e3f2fd' },
  { rol: 'tenant_user',     label: 'U — Kullanıcı',          renk: '#6a1b9a', bg: '#f3e5f5' },
]

const SAYFALAR = [
  { kod: 'firmalar',             label: 'Firmalar',               grup: 'Yönetim' },
  { kod: 'projeler',             label: 'Projeler',               grup: 'Yönetim' },
  { kod: 'kullanicilar',         label: 'Kullanıcılar',           grup: 'Yönetim' },
  { kod: 'lokasyonlar',          label: 'Lokasyonlar',            grup: 'Yönetim' },
  { kod: 'lokasyon-gruplari',    label: 'Lokasyon Grupları',      grup: 'Yönetim' },
  { kod: 'gorevler',             label: 'Spesifik Görevler',      grup: 'Görevler' },
  { kod: 'checklist-sablonlari', label: 'Checklist Şablonları',   grup: 'Görevler' },
  { kod: 'canli-islemler',       label: 'Frekansiyel Görevler',   grup: 'Görevler' },
  { kod: 'tum-gorevler',         label: 'Tüm Görevler',           grup: 'Görevler' },
  { kod: 'arsiv',                label: 'Arşiv',                  grup: 'Görevler' },
  { kod: 'personel-takibi',      label: 'Personel Takibi',        grup: 'Raporlama' },
  { kod: 'raporlar',             label: 'Raporlar',               grup: 'Raporlama' },
]

const YETKILER: { key: 'gorebilir' | 'ekleyebilir' | 'duzenleyebilir' | 'silebilir'; label: string }[] = [
  { key: 'gorebilir',       label: 'Görebilir' },
  { key: 'ekleyebilir',     label: 'Ekleyebilir' },
  { key: 'duzenleyebilir',  label: 'Düzenleyebilir' },
  { key: 'silebilir',       label: 'Silebilir' },
]

type Yetki = {
  id?: string
  rol: string
  sayfa_kodu: string
  gorebilir: boolean
  ekleyebilir: boolean
  duzenleyebilir: boolean
  silebilir: boolean
}

function buildKey(rol: string, sayfa: string) { return `${rol}__${sayfa}` }

export default function GrupYetkileriClient({ initialYetkileri }: { initialYetkileri: Yetki[] }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [aktifRol, setAktifRol] = useState(ROLLER[0].rol)

  // Map: "rol__sayfa" → Yetki
  const [yetkileriMap, setYetkileriMap] = useState<Record<string, Yetki>>(() => {
    const m: Record<string, Yetki> = {}
    // Varsayılan boş
    for (const r of ROLLER) for (const s of SAYFALAR) {
      m[buildKey(r.rol, s.kod)] = { rol: r.rol, sayfa_kodu: s.kod, gorebilir: false, ekleyebilir: false, duzenleyebilir: false, silebilir: false }
    }
    // DB'den gelenleri üzerine yaz
    for (const y of initialYetkileri) {
      m[buildKey(y.rol, y.sayfa_kodu)] = y
    }
    return m
  })

  function toggle(rol: string, sayfa: string, key: 'gorebilir' | 'ekleyebilir' | 'duzenleyebilir' | 'silebilir') {
    const k = buildKey(rol, sayfa)
    setYetkileriMap(prev => {
      const cur = { ...prev[k] }
      cur[key] = !cur[key]
      // Göremiyorsa diğer yetkiler de kapalı olmalı
      if (key === 'gorebilir' && !cur.gorebilir) {
        cur.ekleyebilir = false; cur.duzenleyebilir = false; cur.silebilir = false
      }
      // Ekleme/düzenleme/silme için görme zorunlu
      if (key !== 'gorebilir' && cur[key]) cur.gorebilir = true
      return { ...prev, [k]: cur }
    })
  }

  async function kaydet() {
    setSaving(true)
    try {
      const rows = Object.values(yetkileriMap)
      const res = await fetch('/api/sa/grup-yetkileri', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yetkileri: rows }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Kaydedilemedi')
      toast({ type: 'success', title: 'Kaydedildi', message: 'Yetki ayarları güncellendi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  const aktifRolBilgi = ROLLER.find(r => r.rol === aktifRol)!

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* Rol seçim tabları */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {ROLLER.map(r => (
          <button
            key={r.rol}
            onClick={() => setAktifRol(r.rol)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: `2px solid ${aktifRol === r.rol ? r.renk : '#d6e4d6'}`,
              background: aktifRol === r.rol ? r.bg : '#fff',
              color: aktifRol === r.rol ? r.renk : '#506050',
              fontWeight: aktifRol === r.rol ? 800 : 500,
              fontSize: 13.5, cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Yetki tablosu */}
      <div className="verde-card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 900 }}>{aktifRolBilgi.label}</span>
            <span style={{ fontSize: 12.5, color: '#7a907a', marginLeft: 10 }}>Sayfa bazlı erişim yetkileri</span>
          </div>
        </div>

        <table className="verde-table">
          <thead>
            <tr>
              <th style={{ width: 220 }}>Sayfa</th>
              {YETKILER.map(y => (
                <th key={y.key} style={{ textAlign: 'center', width: 110 }}>{y.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              let lastGrup = ''
              return SAYFALAR.map(s => {
                const y = yetkileriMap[buildKey(aktifRol, s.kod)]
                const grupBaslik = (s as any).grup !== lastGrup ? (lastGrup = (s as any).grup, (s as any).grup) : null
                return [
                  grupBaslik && (
                    <tr key={`grup-${grupBaslik}`}>
                      <td colSpan={5} style={{ background: '#f0f9f0', fontWeight: 800, fontSize: 11.5, color: '#2e8b2e', padding: '8px 14px', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                        {grupBaslik}
                      </td>
                    </tr>
                  ),
                  <tr key={s.kod}>
                    <td style={{ fontWeight: 600, paddingLeft: 20 }}>{s.label}</td>
                    {YETKILER.map(yk => (
                      <td key={yk.key} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={y?.[yk.key] ?? false}
                          onChange={() => toggle(aktifRol, s.kod, yk.key)}
                          style={{ width: 17, height: 17, cursor: 'pointer', accentColor: aktifRolBilgi.renk }}
                        />
                      </td>
                    ))}
                  </tr>
                ]
              })
            })()}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={kaydet}
          disabled={saving}
          style={{
            padding: '10px 28px', borderRadius: 8, border: 'none',
            background: saving ? '#a0b4a0' : '#2e8b2e', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Kaydediliyor…' : '✓ Tüm Değişiklikleri Kaydet'}
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: '#7a907a' }}>
        Not: Bu yetki ayarları tüm firmalar için global varsayılan değerdir. Firma bazlı özel ayarlar ilerleyen sürümlerde eklenecektir.
      </div>
    </div>
  )
}
