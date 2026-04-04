'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = {
  green: '#1a5c2a', border: '#e2e8f0', text: '#0f172a', textSoft: '#64748b', grayLight: '#f8fafc',
  blue: '#1d4ed8', purple: '#7c3aed',
}

interface Props { isSA: boolean; firmaId?: string | null; projeId?: string | null }

const inpStyle: React.CSSProperties = {
  height: 38, padding: '0 12px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff',
  fontSize: 15, fontWeight: 700, width: '100%', textAlign: 'center',
}

function SectionHead({ title, color }: { title: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, marginTop: 8 }}>
      <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
      <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>{title}</h3>
    </div>
  )
}

function saatLabel(saat: number): string {
  if (saat < 24) return `${saat} saat`
  const gun = Math.floor(saat / 24)
  const kalan = saat % 24
  return kalan > 0 ? `${gun} gün ${kalan} saat` : `${gun} gün`
}

type AllKey = string
type AllValues = Record<string, number | boolean>

const NUM_DEFAULTS: Record<string, number> = {
  gorev_suresi_hedef_orani: 10,
  ardisik_baslatma_suresi_dk: 0,
  personel_takip_bildirim_dk: 0,
  arsiv_mesai_saat: 24, arsiv_musteri_saat: 24, arsiv_spesifik_saat: 48, arsiv_frekansiyel_saat: 24,
}
const BOOL_DEFAULTS: Record<string, boolean> = {
  spesifik_ceklist_aktif: true, spesifik_personel_atama_aktif: true, frekansiyel_personel_atama_aktif: true,
}
const ALL_DEFAULTS: AllValues = { ...NUM_DEFAULTS, ...BOOL_DEFAULTS }

export default function GenelAyarlarClient({ isSA, firmaId: propFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (propFirmaId ?? '')

  const [firmaDefaults, setFirmaDefaults] = useState<AllValues>({ ...ALL_DEFAULTS })
  const [efektif, setEfektif]             = useState<AllValues>({ ...ALL_DEFAULTS })
  const [overrides, setOverrides]         = useState<Record<string, boolean>>({})
  const [loading, setLoading]             = useState(false)
  const [savingKey, setSavingKey]         = useState<string | null>(null)

  const fetchAyarlar = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const q = new URLSearchParams({ firmaId: currentFirmaId })
      if (projeId) q.set('projeId', projeId)
      const res = await fetch(`/api/sistem-ayarlari/genel?${q}`)
      const json = await res.json()
      if (res.ok) {
        setFirmaDefaults(json.firma)
        setEfektif(json.efektif)
        const ov: Record<string, boolean> = {}
        for (const k of Object.keys(ALL_DEFAULTS)) ov[k] = json.proje != null && json.proje[k] != null
        setOverrides(ov)
      }
    } catch {}
    setLoading(false)
  }, [currentFirmaId, projeId])

  useEffect(() => { fetchAyarlar() }, [fetchAyarlar])

  const handleSave = async (key: AllKey, value: number | boolean) => {
    if (!currentFirmaId) return
    setSavingKey(key)
    try {
      const hedef = projeId ? 'proje' : 'firma'
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId: currentFirmaId, projeId, hedef, [key]: value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Kaydetme hatası')
      setEfektif(prev => ({ ...prev, [key]: value }))
      if (projeId) setOverrides(prev => ({ ...prev, [key]: true }))
      else setFirmaDefaults(prev => ({ ...prev, [key]: value }))
      toast({ type: 'success', title: 'Başarılı', message: 'Ayar kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSavingKey(null)
  }

  const handleReset = async (key: AllKey) => {
    if (!currentFirmaId || !projeId) return
    setSavingKey(`${key}_reset`)
    try {
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId: currentFirmaId, projeId, hedef: 'proje', [key]: null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sıfırlama hatası')
      setEfektif(prev => ({ ...prev, [key]: firmaDefaults[key] }))
      setOverrides(prev => ({ ...prev, [key]: false }))
      toast({ type: 'success', title: 'Başarılı', message: 'Firma varsayılanına döndürüldü.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSavingKey(null)
  }

  if (loading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor...</div>
  }

  const SaveBtn = ({ onClick, id }: { onClick: () => void; id: string }) => {
    const busy = savingKey === id
    return (
      <button onClick={onClick} disabled={savingKey != null}
        style={{ height: 34, padding: '0 16px', borderRadius: 8, background: T.green, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: savingKey != null ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
        {busy ? '...' : 'Kaydet'}
      </button>
    )
  }

  function OverrideBadge({ ayarKey }: { ayarKey: string }) {
    if (!projeId || !overrides[ayarKey]) return null
    const fVal = firmaDefaults[ayarKey]
    const label = typeof fVal === 'boolean' ? (fVal ? 'Aktif' : 'Pasif') : (ayarKey === 'gorev_suresi_hedef_orani' ? `±%${fVal}` : saatLabel(fVal as number))
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: T.purple, fontWeight: 600 }}>Proje özel ayarı aktif (Firma varsayılanı: {label})</span>
        <button onClick={() => handleReset(ayarKey)} disabled={savingKey != null}
          style={{ fontSize: 11.5, color: T.textSoft, background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 10px', cursor: savingKey != null ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
          Varsayılana Dön
        </button>
      </div>
    )
  }

  // ── Toggle Kart ────────────────────────────────────────────────────────
  function ToggleKart({ ayarKey, label, desc }: { ayarKey: string; label: string; desc: string }) {
    const val = efektif[ayarKey] as boolean
    return (
      <div style={{ background: '#fff', border: `1px solid ${overrides[ayarKey] ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5 }}>{desc}</div>
          </div>
          <button
            onClick={() => handleSave(ayarKey, !val)}
            disabled={savingKey != null}
            style={{
              width: 52, height: 28, borderRadius: 14, border: 'none', cursor: savingKey != null ? 'not-allowed' : 'pointer',
              background: val ? T.green : '#cbd5e1', position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: '#fff', position: 'absolute', top: 3,
              left: val ? 27 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </button>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: val ? T.green : T.textSoft }}>
          {val ? 'Aktif' : 'Pasif'}
        </div>
        <OverrideBadge ayarKey={ayarKey} />
      </div>
    )
  }

  // ── Saat Ayar Kart ─────────────────────────────────────────────────────
  function AyarSaatKart({ ayarKey, label, desc }: { ayarKey: string; label: string; desc: string }) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${overrides[ayarKey] ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>{label}</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>{desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <input type="number" min={1} max={720} value={efektif[ayarKey] as number}
              onChange={e => setEfektif(prev => ({ ...prev, [ayarKey]: Math.max(1, Math.min(720, Number(e.target.value) || 1)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>saat</span>
          </div>
          <SaveBtn id={ayarKey} onClick={() => handleSave(ayarKey, efektif[ayarKey] as number)} />
          <span style={{ fontSize: 12, color: T.textSoft }}>= {saatLabel(efektif[ayarKey] as number)}</span>
        </div>
        <OverrideBadge ayarKey={ayarKey} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>

      {/* ═══ GÖREVLER ═══ */}
      <SectionHead title="Görevler" color={T.green} />

      {/* Hedef Tolerans */}
      <div style={{ background: '#fff', border: `1px solid ${overrides.gorev_suresi_hedef_orani ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Görev Süresi Hedef Tolerans Oranı</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Görev tamamlanma süresinin, hedef süreye göre kabul edilebilir sapma yüzdesi. ±%X aralığı dışındakiler sapma olarak değerlendirilir.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>±</span>
            <input type="number" min={0} max={100} value={efektif.gorev_suresi_hedef_orani as number}
              onChange={e => setEfektif(prev => ({ ...prev, gorev_suresi_hedef_orani: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>%</span>
          </div>
          <SaveBtn id="gorev_suresi_hedef_orani" onClick={() => handleSave('gorev_suresi_hedef_orani', efektif.gorev_suresi_hedef_orani)} />
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
          <strong>Örnek:</strong> Hedef 60 dk, tolerans ±%{efektif.gorev_suresi_hedef_orani as number} →{' '}
          <span style={{ color: T.green, fontWeight: 700 }}>{Math.round(60 * (1 - (efektif.gorev_suresi_hedef_orani as number) / 100))} – {Math.round(60 * (1 + (efektif.gorev_suresi_hedef_orani as number) / 100))} dk</span> aralığı uygun.
        </div>
        <OverrideBadge ayarKey="gorev_suresi_hedef_orani" />
      </div>

      {/* Ardışık Başlatma Süresi */}
      <div style={{ background: '#fff', border: `1px solid ${overrides.ardisik_baslatma_suresi_dk ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Ardışık Başlatma Süresi</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Görevlerin ard arda başlatılmasını engeller. Son görevin tamamlanmasının ardından yeni bir görev başlatılabilmesi için buradaki süre kadar beklenmesi gerekir.
            0 girilirse kontrol devre dışı kalır.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <input type="number" min={0} max={1440} value={efektif.ardisik_baslatma_suresi_dk as number}
              onChange={e => setEfektif(prev => ({ ...prev, ardisik_baslatma_suresi_dk: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>dk</span>
          </div>
          <SaveBtn id="ardisik_baslatma_suresi_dk" onClick={() => handleSave('ardisik_baslatma_suresi_dk', efektif.ardisik_baslatma_suresi_dk)} />
        </div>
        {(efektif.ardisik_baslatma_suresi_dk as number) > 0 && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
            Kullanıcı bir görevi tamamladıktan sonra <strong style={{ color: T.green }}>{efektif.ardisik_baslatma_suresi_dk as number} dakika</strong> boyunca yeni görev başlatamaz.
            Erken denerse "<em>Henüz yeni görev süreniz başlamadı! Kalan süre: X dakika</em>" uyarısı alır.
          </div>
        )}
        <OverrideBadge ayarKey="ardisik_baslatma_suresi_dk" />
      </div>

      {/* Personel Takip Bildirim Süresi */}
      <div style={{ background: '#fff', border: `1px solid ${overrides.personel_takip_bildirim_dk ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Personel Takip Bildirim Süresi</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Personel iş başı yaptıktan (QR/NFC ile mesai girişi) sonra belirtilen süre içinde görev başlatmazsa bildirim gönderilir.
            Her aralıkta tekrar bildirim gider. 3. bildirimde yöneticiye (TA) "personel işte ama görev yapmıyor" bildirimi gönderilir.
            0 girilirse bildirim gönderilmez.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <input type="number" min={0} max={1440} value={efektif.personel_takip_bildirim_dk as number}
              onChange={e => setEfektif(prev => ({ ...prev, personel_takip_bildirim_dk: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>dk</span>
          </div>
          <SaveBtn id="personel_takip_bildirim_dk" onClick={() => handleSave('personel_takip_bildirim_dk', efektif.personel_takip_bildirim_dk)} />
        </div>
        {(efektif.personel_takip_bildirim_dk as number) > 0 && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
            İş başı yaptıktan <strong style={{ color: T.green }}>{efektif.personel_takip_bildirim_dk as number} dk</strong> sonra görev başlatılmamışsa 1. hatırlatma,
            <strong style={{ color: T.green }}> {(efektif.personel_takip_bildirim_dk as number) * 2} dk</strong> sonra 2. hatırlatma,
            <strong style={{ color: T.green }}> {(efektif.personel_takip_bildirim_dk as number) * 3} dk</strong> sonra 3. hatırlatma + yöneticiye bildirim gönderilir.
          </div>
        )}
        <OverrideBadge ayarKey="personel_takip_bildirim_dk" />
      </div>

      {/* Toggle'lar — 2'li grid */}
      <div style={{ fontSize: 13, fontWeight: 700, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Spesifik Görevler</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <ToggleKart
          ayarKey="spesifik_ceklist_aktif"
          label="Çeklist Kullanımı"
          desc="Pasif yapılırsa spesifik görevlerde lokasyonda tanımlı çeklist olsa dahi gösterilmez."
        />
        <ToggleKart
          ayarKey="spesifik_personel_atama_aktif"
          label="Personel Atama"
          desc="Pasif yapılırsa spesifik görev oluştururken personel atama alanı ve zorunluluğu kaldırılır."
        />
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekansiyel Görevler</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        <ToggleKart
          ayarKey="frekansiyel_personel_atama_aktif"
          label="Personel Atama"
          desc="Pasif yapılırsa frekansiyel görev kuralı oluştururken personel atama alanı ve zorunluluğu kaldırılır."
        />
      </div>

      {/* ═══ ARŞİV ═══ */}
      <SectionHead title="Arşiv" color={T.blue} />

      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12.5, color: '#1e40af', lineHeight: 1.6 }}>
        Verilerin ana tablodan arşiv tablosuna taşınma süresi. Arşivleme her 6 saatte bir otomatik çalışır, arşivlenen veriler raporlarda görünmeye devam eder.
      </div>

      <AyarSaatKart ayarKey="arsiv_frekansiyel_saat" label="Frekansiyel Görev Arşiv Süresi"
        desc="Terminal duruma geçen frekansiyel görevlerin kaç saat sonra arşive taşınacağını belirler." />
      <AyarSaatKart ayarKey="arsiv_spesifik_saat" label="Spesifik Görev Arşiv Süresi"
        desc="Spesifik görevlerin oluşturulduktan kaç saat sonra arşive taşınacağını belirler. Çeklist sonuçları birlikte taşınır." />
      <AyarSaatKart ayarKey="arsiv_mesai_saat" label="Personel Mesai Arşiv Süresi"
        desc="Personel giriş/çıkış kayıtlarının kaç saat sonra arşive taşınacağını belirler." />
      <AyarSaatKart ayarKey="arsiv_musteri_saat" label="Müşteri Değerlendirme Arşiv Süresi"
        desc="Müşteri memnuniyet değerlendirmelerinin kaç saat sonra arşive taşınacağını belirler." />
    </div>
  )
}
