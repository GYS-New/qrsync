'use client'

import React, { useState, useCallback } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

const ROLLER = [
  { rol: 'alt_super_admin', label: '2.SA — Alt Süper Admin', renk: '#2e7d32', bg: '#e8f4e8' },
  { rol: 'tenant_admin',    label: 'TA — Firma Admini',      renk: '#e65100', bg: '#fff3e0' },
  { rol: 'musteri',         label: 'M — Müşteri',            renk: '#1565c0', bg: '#e3f2fd' },
  { rol: 'tenant_user',     label: 'U — Kullanıcı',          renk: '#6a1b9a', bg: '#f3e5f5' },
]

const SAYFALAR = [
  // Yönetim
  { kod: 'firmalar',              label: 'Firmalar',                   grup: 'Yönetim' },
  { kod: 'projeler',              label: 'Projeler',                   grup: 'Yönetim' },
  { kod: 'kullanicilar',          label: 'Kullanıcılar',               grup: 'Yönetim' },
  { kod: 'lokasyonlar',           label: 'Lokasyonlar',                grup: 'Yönetim' },
  { kod: 'lokasyon-gruplari',     label: 'Lokasyon Grupları',          grup: 'Yönetim' },
  { kod: 'birim-fiyatlar',        label: 'Birim Fiyatlar',             grup: 'Yönetim' },
  // Görevler
  { kod: 'gorevler',              label: 'Spesifik Görevler',          grup: 'Görevler' },
  { kod: 'canli-islemler',        label: 'Frekansiyel Görevler',       grup: 'Görevler' },
  { kod: 'tum-gorevler',          label: 'Tüm Görevler',               grup: 'Görevler' },
  { kod: 'checklist-sablonlari',  label: 'Checklist Şablonları',       grup: 'Görevler' },
  { kod: 'arsiv',                 label: 'Arşiv',                      grup: 'Görevler' },
  // Raporlama
  { kod: 'musteri-degerlendirme', label: 'Müşteri Değerlendirmeleri',  grup: 'Raporlama' },
  { kod: 'personel-takibi',       label: 'Personel Takibi',            grup: 'Raporlama' },
  // Raporlar
  { kod: 'ham-veri-raporlari',    label: 'Ham Veri Raporları',         grup: 'Raporlar' },
  { kod: 'grafiksel-raporlar',    label: 'Grafiksel Raporlar',         grup: 'Raporlar' },
  { kod: 'ceklist-raporlari',     label: 'Checklist Raporları',        grup: 'Raporlar' },
  { kod: 'rapor-ozellestir',      label: 'Rapor Özelleştir',           grup: 'Raporlar' },
  { kod: 'sure-analiz-raporlari', label: 'Süre Analiz Raporları',      grup: 'Raporlar' },
  { kod: 'hakedis-raporu',        label: 'Hakediş Raporu',             grup: 'Raporlar' },
]

const YETKILER = [
  { key: 'gorebilir'      as const, label: 'Görebilir' },
  { key: 'ekleyebilir'    as const, label: 'Ekleyebilir' },
  { key: 'duzenleyebilir' as const, label: 'Düzenleyebilir' },
  { key: 'silebilir'      as const, label: 'Silebilir' },
]

type YetkiKey = 'gorebilir' | 'ekleyebilir' | 'duzenleyebilir' | 'silebilir'

type Yetki = {
  rol: string
  sayfa_kodu: string
  gorebilir: boolean
  ekleyebilir: boolean
  duzenleyebilir: boolean
  silebilir: boolean
}

function buildKey(rol: string, sayfa: string) { return `${rol}__${sayfa}` }

function buildInitialMap(initialYetkileri: Yetki[]): Record<string, Yetki> {
  const m: Record<string, Yetki> = {}
  for (const r of ROLLER) {
    for (const s of SAYFALAR) {
      m[buildKey(r.rol, s.kod)] = {
        rol: r.rol, sayfa_kodu: s.kod,
        gorebilir: false, ekleyebilir: false, duzenleyebilir: false, silebilir: false,
      }
    }
  }
  for (const y of initialYetkileri) {
    const k = buildKey(y.rol, y.sayfa_kodu)
    if (k in m) {
      m[k] = {
        rol: y.rol,
        sayfa_kodu: y.sayfa_kodu,
        gorebilir: y.gorebilir === true,
        ekleyebilir: y.ekleyebilir === true,
        duzenleyebilir: y.duzenleyebilir === true,
        silebilir: y.silebilir === true,
      }
    }
  }
  return m
}

// Sayfa listesini gruplara ayır — render sırasında mutate etmek yerine önceden hesapla
const SAYFALAR_GROUPED: { grup: string; sayfalar: typeof SAYFALAR }[] = []
for (const s of SAYFALAR) {
  const last = SAYFALAR_GROUPED[SAYFALAR_GROUPED.length - 1]
  if (!last || last.grup !== s.grup) {
    SAYFALAR_GROUPED.push({ grup: s.grup, sayfalar: [s] })
  } else {
    last.sayfalar.push(s)
  }
}

export default function GrupYetkileriClient({
  initialYetkileri,
  firmaId = null,
  apiEndpoint = '/api/sa/grup-yetkileri',
  limitRoller,
  gizliSayfalar,
  firmalar,
  currentPath,
}: {
  initialYetkileri: Yetki[]
  firmaId?: string | null
  apiEndpoint?: string
  limitRoller?: string[]
  gizliSayfalar?: string[]
  firmalar?: { id: string; firma_adi?: string; ticari_unvan?: string }[]
  currentPath?: string
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const gorünürRoller = limitRoller ? ROLLER.filter(r => limitRoller.includes(r.rol)) : ROLLER
  const [aktifRol, setAktifRol] = useState(gorünürRoller[0]?.rol ?? ROLLER[0].rol)
  const gorünürSayfalarGrouped = gizliSayfalar
    ? SAYFALAR_GROUPED.map(g => ({
        ...g,
        sayfalar: g.sayfalar.filter(s => !gizliSayfalar.includes(s.kod)),
      })).filter(g => g.sayfalar.length > 0)
    : SAYFALAR_GROUPED
  const [dirty, setDirty] = useState(false)

  const [yetkileriMap, setYetkileriMap] = useState<Record<string, Yetki>>(
    () => buildInitialMap(initialYetkileri)
  )

  const toggle = useCallback((rol: string, sayfa: string, key: YetkiKey) => {
    setDirty(true)
    setYetkileriMap(prev => {
      const k = buildKey(rol, sayfa)
      const cur = { ...prev[k] }
      cur[key] = !cur[key]
      // Göremiyorsa diğer yetkiler de kapalı
      if (key === 'gorebilir' && !cur.gorebilir) {
        cur.ekleyebilir = false
        cur.duzenleyebilir = false
        cur.silebilir = false
      }
      // Ekleme/düzenleme/silme açılırsa görme de açılır
      if (key !== 'gorebilir' && cur[key]) cur.gorebilir = true
      return { ...prev, [k]: cur }
    })
  }, [])

  async function kaydet() {
    setSaving(true)
    try {
      const rows = Object.values(yetkileriMap)
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yetkileri: rows, firma_id: firmaId }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Kaydedilemedi')

      // POST response'unda güncel veri geliyor — ayrı GET isteğine gerek yok
      if (j.ok && Array.isArray(j.yetkileri)) {
        setYetkileriMap(buildInitialMap(j.yetkileri))
      }

      setDirty(false)
      toast({ type: 'success', title: 'Kaydedildi', message: `${j.count ?? rows.length} yetki satırı güncellendi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  const aktifRolBilgi = ROLLER.find(r => r.rol === aktifRol) ?? ROLLER[0]

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* Firma seçici — SA için */}
      {firmalar && firmalar.length > 0 && currentPath && (
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, background: '#f0f9f0', border: '1px solid #d6e4d6', borderRadius: 10, padding: '12px 16px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1f6b1f', whiteSpace: 'nowrap' }}>Firma Bazlı Yetki:</span>
          <select
            defaultValue={firmaId ?? ''}
            onChange={e => {
              const val = e.target.value
              window.location.href = val ? `${currentPath}?firma_id=${val}` : currentPath
            }}
            style={{ flex: 1, maxWidth: 320, height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #d6e4d6', fontSize: 13, background: '#fff' }}
          >
            <option value="">🌐 Global (tüm firmalar için varsayılan)</option>
            {firmalar.map(f => (
              <option key={f.id} value={f.id}>
                {f.firma_adi || f.ticari_unvan}
              </option>
            ))}
          </select>
          {firmaId && (
            <span style={{ fontSize: 12, color: '#e65100', fontWeight: 700, background: '#fff3e0', padding: '3px 10px', borderRadius: 6, border: '1px solid #ffd0a0', whiteSpace: 'nowrap' }}>
              Firmaya Özel
            </span>
          )}
        </div>
      )}

      {/* Rol seçim tabları */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {gorünürRoller.map(r => (
          <button
            key={r.rol}
            onClick={() => setAktifRol(r.rol)}
            style={{
              padding: '8px 18px', borderRadius: 8,
              border: `2px solid ${aktifRol === r.rol ? r.renk : '#d6e4d6'}`,
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
          {dirty && (
            <span style={{ fontSize: 12, color: '#e65100', fontWeight: 700, background: '#fff3e0', padding: '3px 10px', borderRadius: 6, border: '1px solid #ffd0a0' }}>
              ● Kaydedilmemiş değişiklik
            </span>
          )}
        </div>

        <table className="verde-table">
          <thead>
            <tr>
              <th style={{ width: 240 }}>Sayfa</th>
              {YETKILER.map(y => (
                <th key={y.key} style={{ textAlign: 'center', width: 110 }}>{y.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gorünürSayfalarGrouped.map(({ grup, sayfalar }) => (
              <React.Fragment key={grup}>
                <tr>
                  <td colSpan={5} style={{
                    background: '#f0f9f0', fontWeight: 800, fontSize: 11.5,
                    color: '#2e8b2e', padding: '8px 14px', letterSpacing: '0.8px', textTransform: 'uppercase',
                  }}>
                    {grup}
                  </td>
                </tr>
                {sayfalar.map(s => {
                  const y = yetkileriMap[buildKey(aktifRol, s.kod)]
                  return (
                    <tr key={`${aktifRol}__${s.kod}`}>
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
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: '#7a907a' }}>
          {firmaId ? 'Bu firmaya özel yetki ayarları. Global ayarlar üzerine öncelik kazanır.' : 'Global yetki ayarları. Firma bazlı ayarlar bunların üzerine yazılabilir.'}
        </div>
        <button
          onClick={kaydet}
          disabled={saving}
          style={{
            padding: '10px 28px', borderRadius: 8, border: 'none',
            background: saving ? '#a0b4a0' : dirty ? '#2e8b2e' : '#7aaa7a',
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Kaydediliyor…' : '✓ Tüm Değişiklikleri Kaydet'}
        </button>
      </div>
    </div>
  )
}
