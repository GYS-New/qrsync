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

type AyarKey = 'gorev_suresi_hedef_orani' | 'arsiv_mesai_saat' | 'arsiv_musteri_saat' | 'arsiv_spesifik_saat' | 'arsiv_frekansiyel_saat'
type AyarValues = Record<AyarKey, number>

const DEFAULTS: AyarValues = {
  gorev_suresi_hedef_orani: 10,
  arsiv_mesai_saat: 24,
  arsiv_musteri_saat: 24,
  arsiv_spesifik_saat: 48,
  arsiv_frekansiyel_saat: 24,
}

export default function GenelAyarlarClient({ isSA, firmaId: propFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (propFirmaId ?? '')

  const [firmaDefaults, setFirmaDefaults] = useState<AyarValues>({ ...DEFAULTS })
  const [efektif, setEfektif]             = useState<AyarValues>({ ...DEFAULTS })
  const [overrides, setOverrides]         = useState<Record<AyarKey, boolean>>({ gorev_suresi_hedef_orani: false, arsiv_mesai_saat: false, arsiv_musteri_saat: false, arsiv_spesifik_saat: false, arsiv_frekansiyel_saat: false })
  const [loading, setLoading]             = useState(false)
  const [saving, setSaving]               = useState(false)

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
        // Hangi alanlar proje tarafından override edilmiş?
        const ov: Record<AyarKey, boolean> = {} as any
        for (const k of Object.keys(DEFAULTS) as AyarKey[]) {
          ov[k] = json.proje != null && json.proje[k] != null
        }
        setOverrides(ov)
      }
    } catch {}
    setLoading(false)
  }, [currentFirmaId, projeId])

  useEffect(() => { fetchAyarlar() }, [fetchAyarlar])

  const handleSave = async (key: AyarKey, value: number) => {
    if (!currentFirmaId) return
    setSaving(true)
    try {
      // Proje varsa proje bazlı, yoksa firma bazlı kaydet
      const hedef = projeId ? 'proje' : 'firma'
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
    setSaving(false)
  }

  const handleReset = async (key: AyarKey) => {
    if (!currentFirmaId || !projeId) return
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
    setSaving(false)
  }

  if (loading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor...</div>
  }

  const SaveBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} disabled={saving}
      style={{ height: 34, padding: '0 16px', borderRadius: 8, background: T.green, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap' }}>
      {saving ? '...' : 'Kaydet'}
    </button>
  )

  function OverrideBadge({ ayarKey }: { ayarKey: AyarKey }) {
    if (!projeId || !overrides[ayarKey]) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: T.purple, fontWeight: 600 }}>Proje özel ayarı aktif (Firma varsayılanı: {ayarKey === 'gorev_suresi_hedef_orani' ? `±%${firmaDefaults[ayarKey]}` : saatLabel(firmaDefaults[ayarKey])})</span>
        <button onClick={() => handleReset(ayarKey)} disabled={saving}
          style={{ fontSize: 11.5, color: T.textSoft, background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Varsayılana Dön
        </button>
      </div>
    )
  }

  function AyarSaatKart({ ayarKey, label, desc }: { ayarKey: AyarKey; label: string; desc: string }) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${overrides[ayarKey] ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>{label}</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>{desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <input type="number" min={1} max={720} value={efektif[ayarKey]}
              onChange={e => setEfektif(prev => ({ ...prev, [ayarKey]: Math.max(1, Math.min(720, Number(e.target.value) || 1)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>saat</span>
          </div>
          <SaveBtn onClick={() => handleSave(ayarKey, efektif[ayarKey])} />
          <span style={{ fontSize: 12, color: T.textSoft }}>= {saatLabel(efektif[ayarKey])}</span>
        </div>
        <OverrideBadge ayarKey={ayarKey} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640 }}>

      {/* ═══ GÖREVLER ═══ */}
      <SectionHead title="Görevler" color={T.green} />

      <div style={{ background: '#fff', border: `1px solid ${overrides.gorev_suresi_hedef_orani ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Görev Süresi Hedef Tolerans Oranı</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Görev tamamlanma süresinin, lokasyona tanımlı hedef süreye göre kabul edilebilir sapma yüzdesi.
            ±%X aralığındaki tamamlanmalar "Hedefe Uygun", dışındakiler sapma olarak değerlendirilir.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>±</span>
            <input type="number" min={0} max={100} value={efektif.gorev_suresi_hedef_orani}
              onChange={e => setEfektif(prev => ({ ...prev, gorev_suresi_hedef_orani: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>%</span>
          </div>
          <SaveBtn onClick={() => handleSave('gorev_suresi_hedef_orani', efektif.gorev_suresi_hedef_orani)} />
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
          <strong>Örnek:</strong> Hedef süre 60 dk, tolerans ±%{efektif.gorev_suresi_hedef_orani} →{' '}
          <span style={{ color: T.green, fontWeight: 700 }}>{Math.round(60 * (1 - efektif.gorev_suresi_hedef_orani / 100))} dk – {Math.round(60 * (1 + efektif.gorev_suresi_hedef_orani / 100))} dk</span>{' '}
          aralığı "Hedefe Uygun" sayılır.
        </div>
        <OverrideBadge ayarKey="gorev_suresi_hedef_orani" />
      </div>

      {/* ═══ ARŞİV ═══ */}
      <SectionHead title="Arşiv" color={T.blue} />

      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12.5, color: '#1e40af', lineHeight: 1.6 }}>
        Aşağıdaki süreler, ilgili verilerin ana tablodan arşiv tablosuna taşınma zamanını belirler.
        Arşivleme her 6 saatte bir otomatik çalışır. Arşivlenen veriler raporlarda görünmeye devam eder.
      </div>

      <AyarSaatKart ayarKey="arsiv_frekansiyel_saat" label="Frekansiyel Görev Arşiv Süresi"
        desc="Frekansiyel (tekrarlayan) görevlerin terminal duruma (Tamamlandı, İptal vb.) geçtikten kaç saat sonra arşive taşınacağını belirler." />

      <AyarSaatKart ayarKey="arsiv_spesifik_saat" label="Spesifik Görev Arşiv Süresi"
        desc="Spesifik (tek seferlik) görevlerin oluşturulduktan kaç saat sonra arşive taşınacağını belirler. Görevlere bağlı çeklist sonuçları da birlikte arşivlenir." />

      <AyarSaatKart ayarKey="arsiv_mesai_saat" label="Personel Mesai Arşiv Süresi"
        desc="Personel giriş/çıkış (mesai) kayıtlarının oluşturulduktan kaç saat sonra arşive taşınacağını belirler." />

      <AyarSaatKart ayarKey="arsiv_musteri_saat" label="Müşteri Değerlendirme Arşiv Süresi"
        desc="Müşteri memnuniyet değerlendirmelerinin oluşturulduktan kaç saat sonra arşive taşınacağını belirler." />
    </div>
  )
}
