'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = {
  green: '#1a5c2a', border: '#e2e8f0', text: '#0f172a', textSoft: '#64748b', grayLight: '#f8fafc',
  blue: '#1d4ed8', amber: '#d97706', purple: '#7c3aed',
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

function AyarKart({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>{label}</label>
        <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>{desc}</div>
      </div>
      {children}
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

  const [firma, setFirma]     = useState<AyarValues>({ ...DEFAULTS })
  const [proje, setProje]     = useState<Record<AyarKey, number | null>>({ gorev_suresi_hedef_orani: null, arsiv_mesai_saat: null, arsiv_musteri_saat: null, arsiv_spesifik_saat: null, arsiv_frekansiyel_saat: null })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  const fetchAyarlar = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const q = new URLSearchParams({ firmaId: currentFirmaId })
      if (projeId) q.set('projeId', projeId)
      const res = await fetch(`/api/sistem-ayarlari/genel?${q}`)
      const json = await res.json()
      if (res.ok) {
        setFirma(json.firma)
        if (json.proje) setProje(json.proje)
        else setProje({ gorev_suresi_hedef_orani: null, arsiv_mesai_saat: null, arsiv_musteri_saat: null, arsiv_spesifik_saat: null, arsiv_frekansiyel_saat: null })
      }
    } catch {}
    setLoading(false)
  }, [currentFirmaId, projeId])

  useEffect(() => { fetchAyarlar() }, [fetchAyarlar])

  const handleSave = async (key: AyarKey, value: number | null, hedef: 'firma' | 'proje') => {
    if (!currentFirmaId) return
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId: currentFirmaId, projeId, hedef, [key]: value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Kaydetme hatası')
      if (hedef === 'firma') setFirma(prev => ({ ...prev, [key]: value! }))
      else setProje(prev => ({ ...prev, [key]: value }))
      toast({ type: 'success', title: 'Başarılı', message: 'Ayar kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor...</div>
  }

  const hasProje = !!projeId

  // Efektif değer: proje override > firma default
  const efektif = (key: AyarKey) => proje[key] != null ? proje[key]! : firma[key]

  const SaveBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} disabled={saving}
      style={{ height: 34, padding: '0 16px', borderRadius: 8, background: T.green, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap' }}>
      {saving ? '...' : 'Kaydet'}
    </button>
  )

  function AyarSaatField({ ayarKey, label }: { ayarKey: AyarKey; label: string }) {
    const firmaVal = firma[ayarKey]
    const projeVal = proje[ayarKey]
    const hasOverride = projeVal != null

    return (
      <AyarKart label={label}
        desc={ayarKey === 'arsiv_frekansiyel_saat'
          ? 'Frekansiyel (tekrarlayan) görevlerin terminal duruma (Tamamlandı, İptal vb.) geçtikten kaç saat sonra arşive taşınacağını belirler. Arşivlenen görevler raporlarda görünmeye devam eder.'
          : ayarKey === 'arsiv_mesai_saat'
          ? 'Personel giriş/çıkış (mesai) kayıtlarının oluşturulduktan kaç saat sonra arşive taşınacağını belirler.'
          : ayarKey === 'arsiv_musteri_saat'
          ? 'Müşteri memnuniyet değerlendirmelerinin oluşturulduktan kaç saat sonra arşive taşınacağını belirler.'
          : 'Spesifik (tek seferlik) görevlerin oluşturulduktan kaç saat sonra arşive taşınacağını belirler. Görevlere bağlı çeklist sonuçları da birlikte arşivlenir.'}
      >
        {/* Firma default */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasProje ? 10 : 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.textSoft, width: 90 }}>Firma{hasProje ? ' (default)' : ''}:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 160 }}>
            <input type="number" min={1} max={720} value={firmaVal}
              onChange={e => setFirma(prev => ({ ...prev, [ayarKey]: Math.max(1, Math.min(720, Number(e.target.value) || 1)) }))}
              style={{ ...inpStyle, fontSize: 14, height: 34 }} />
            <span style={{ fontSize: 13, color: T.textSoft, whiteSpace: 'nowrap' }}>saat</span>
          </div>
          <SaveBtn onClick={() => handleSave(ayarKey, firma[ayarKey], 'firma')} />
          <span style={{ fontSize: 11.5, color: T.textSoft }}>= {saatLabel(firmaVal)}</span>
        </div>

        {/* Proje override */}
        {hasProje && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: hasOverride ? '#f5f3ff' : T.grayLight, border: `1px solid ${hasOverride ? '#c4b5fd' : T.border}`, borderRadius: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: hasOverride ? T.purple : T.textSoft, width: 90 }}>Proje:</span>
            {hasOverride ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 160 }}>
                  <input type="number" min={1} max={720} value={projeVal!}
                    onChange={e => setProje(prev => ({ ...prev, [ayarKey]: Math.max(1, Math.min(720, Number(e.target.value) || 1)) }))}
                    style={{ ...inpStyle, fontSize: 14, height: 34, borderColor: '#c4b5fd' }} />
                  <span style={{ fontSize: 13, color: T.textSoft, whiteSpace: 'nowrap' }}>saat</span>
                </div>
                <SaveBtn onClick={() => handleSave(ayarKey, proje[ayarKey], 'proje')} />
                <button onClick={() => handleSave(ayarKey, null, 'proje')}
                  style={{ fontSize: 12, color: T.textSoft, background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Sıfırla
                </button>
                <span style={{ fontSize: 11.5, color: T.purple }}>= {saatLabel(projeVal!)}</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12.5, color: T.textSoft }}>Firma default kullanılıyor ({saatLabel(firmaVal)})</span>
                <button onClick={() => setProje(prev => ({ ...prev, [ayarKey]: firmaVal }))}
                  style={{ fontSize: 12, color: T.purple, background: '#f5f3ff', border: `1px solid #c4b5fd`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  Özelleştir
                </button>
              </>
            )}
          </div>
        )}
      </AyarKart>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>

      {/* ═══ GÖREVLER ═══ */}
      <SectionHead title="Görevler" color={T.green} />

      <AyarKart
        label="Görev Süresi Hedef Tolerans Oranı"
        desc="Görev tamamlanma süresinin, lokasyona tanımlı hedef süreye göre kabul edilebilir sapma yüzdesi. ±%X aralığındaki tamamlanmalar 'Hedefe Uygun', dışındakiler sapma olarak değerlendirilir."
      >
        {/* Firma */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasProje ? 10 : 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.textSoft, width: 90 }}>Firma{hasProje ? ' (default)' : ''}:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 160 }}>
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>±</span>
            <input type="number" min={0} max={100} value={firma.gorev_suresi_hedef_orani}
              onChange={e => setFirma(prev => ({ ...prev, gorev_suresi_hedef_orani: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
              style={{ ...inpStyle, fontSize: 14, height: 34 }} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>%</span>
          </div>
          <SaveBtn onClick={() => handleSave('gorev_suresi_hedef_orani', firma.gorev_suresi_hedef_orani, 'firma')} />
        </div>
        {/* Proje override */}
        {hasProje && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: proje.gorev_suresi_hedef_orani != null ? '#f5f3ff' : T.grayLight, border: `1px solid ${proje.gorev_suresi_hedef_orani != null ? '#c4b5fd' : T.border}`, borderRadius: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: proje.gorev_suresi_hedef_orani != null ? T.purple : T.textSoft, width: 90 }}>Proje:</span>
            {proje.gorev_suresi_hedef_orani != null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 160 }}>
                  <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>±</span>
                  <input type="number" min={0} max={100} value={proje.gorev_suresi_hedef_orani}
                    onChange={e => setProje(prev => ({ ...prev, gorev_suresi_hedef_orani: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                    style={{ ...inpStyle, fontSize: 14, height: 34, borderColor: '#c4b5fd' }} />
                  <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>%</span>
                </div>
                <SaveBtn onClick={() => handleSave('gorev_suresi_hedef_orani', proje.gorev_suresi_hedef_orani, 'proje')} />
                <button onClick={() => handleSave('gorev_suresi_hedef_orani', null, 'proje')}
                  style={{ fontSize: 12, color: T.textSoft, background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Sıfırla
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12.5, color: T.textSoft }}>Firma default: ±%{firma.gorev_suresi_hedef_orani}</span>
                <button onClick={() => setProje(prev => ({ ...prev, gorev_suresi_hedef_orani: firma.gorev_suresi_hedef_orani }))}
                  style={{ fontSize: 12, color: T.purple, background: '#f5f3ff', border: `1px solid #c4b5fd`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  Özelleştir
                </button>
              </>
            )}
          </div>
        )}
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
          <strong>Örnek:</strong> Hedef süre 60 dk, tolerans ±%{efektif('gorev_suresi_hedef_orani')} →{' '}
          <span style={{ color: T.green, fontWeight: 700 }}>{Math.round(60 * (1 - efektif('gorev_suresi_hedef_orani') / 100))} dk – {Math.round(60 * (1 + efektif('gorev_suresi_hedef_orani') / 100))} dk</span>{' '}
          aralığı "Hedefe Uygun" sayılır.
        </div>
      </AyarKart>

      {/* ═══ ARŞİV ═══ */}
      <SectionHead title="Arşiv" color={T.blue} />

      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12.5, color: '#1e40af', lineHeight: 1.6 }}>
        Aşağıdaki süreler, ilgili verilerin ana tablodan arşiv tablosuna taşınma zamanını belirler.
        Arşivleme her 6 saatte bir otomatik çalışır. Arşivlenen veriler raporlarda görünmeye devam eder.
        {hasProje && <><br /><strong>Proje bazında farklı süre tanımlamak için "Özelleştir" butonunu kullanın.</strong></>}
      </div>

      <AyarSaatField ayarKey="arsiv_frekansiyel_saat" label="Frekansiyel Görev Arşiv Süresi" />
      <AyarSaatField ayarKey="arsiv_spesifik_saat"    label="Spesifik Görev Arşiv Süresi" />
      <AyarSaatField ayarKey="arsiv_mesai_saat"        label="Personel Mesai Arşiv Süresi" />
      <AyarSaatField ayarKey="arsiv_musteri_saat"      label="Müşteri Değerlendirme Arşiv Süresi" />
    </div>
  )
}
