'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = {
  green: '#1a5c2a', border: '#e2e8f0', text: '#0f172a', textSoft: '#64748b', grayLight: '#f8fafc',
  blue: '#1d4ed8', amber: '#d97706',
}

interface Props {
  isSA: boolean
  firmaId?: string | null
}

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

export default function GenelAyarlarClient({ isSA, firmaId: propFirmaId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (propFirmaId ?? '')

  const [hedefOrani, setHedefOrani]       = useState(10)
  const [arsivMesai, setArsivMesai]       = useState(24)
  const [arsivMusteri, setArsivMusteri]   = useState(24)
  const [arsivSpesifik, setArsivSpesifik] = useState(48)
  const [loading, setLoading]             = useState(false)
  const [saving, setSaving]               = useState(false)

  const fetchAyarlar = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sistem-ayarlari/genel?firmaId=${currentFirmaId}`)
      const json = await res.json()
      if (res.ok) {
        setHedefOrani(json.gorev_suresi_hedef_orani ?? 10)
        setArsivMesai(json.arsiv_mesai_saat ?? 24)
        setArsivMusteri(json.arsiv_musteri_saat ?? 24)
        setArsivSpesifik(json.arsiv_spesifik_saat ?? 48)
      }
    } catch {}
    setLoading(false)
  }, [currentFirmaId])

  useEffect(() => { fetchAyarlar() }, [fetchAyarlar])

  const handleSave = async (fields: Record<string, any>) => {
    if (!currentFirmaId) return
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId: currentFirmaId, ...fields }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Kaydetme hatası')
      toast({ type: 'success', title: 'Başarılı', message: 'Ayar kaydedildi.' })
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
      style={{ height: 38, padding: '0 20px', borderRadius: 8, background: T.green, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
      {saving ? 'Kaydediliyor...' : 'Kaydet'}
    </button>
  )

  return (
    <div style={{ maxWidth: 640 }}>

      {/* ═══ GÖREVLER ═══ */}
      <SectionHead title="Görevler" color={T.green} />

      <AyarKart
        label="Görev Süresi Hedef Tolerans Oranı"
        desc="Görev tamamlanma süresinin, lokasyona tanımlı hedef süreye göre kabul edilebilir sapma yüzdesi. Örneğin %10 seçilirse; hedef sürenin ±%10 aralığındaki tamamlanmalar 'Hedefe Uygun', bu aralığın dışındakiler sapma olarak değerlendirilir. Süre Analiz Raporlarında kullanılır."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 200 }}>
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>±</span>
            <input type="number" min={0} max={100} value={hedefOrani}
              onChange={e => setHedefOrani(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>%</span>
          </div>
          <SaveBtn onClick={() => handleSave({ gorev_suresi_hedef_orani: hedefOrani })} />
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
          <strong>Örnek:</strong> Hedef süre 60 dk ise → ±%{hedefOrani} toleransla{' '}
          <span style={{ color: T.green, fontWeight: 700 }}>{Math.round(60 * (1 - hedefOrani / 100))} dk – {Math.round(60 * (1 + hedefOrani / 100))} dk</span>{' '}
          aralığı "Hedefe Uygun" sayılır.
        </div>
      </AyarKart>

      {/* ═══ ARŞİV ═══ */}
      <SectionHead title="Arşiv" color={T.blue} />

      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12.5, color: '#1e40af', lineHeight: 1.6 }}>
        Aşağıdaki süreler, ilgili verilerin ana tablodan arşiv tablosuna taşınma zamanını belirler.
        Arşivleme işlemi her 6 saatte bir otomatik çalışır. Arşivlenen veriler raporlarda görünmeye devam eder,
        ancak ana tablodan kaldırılarak sistem performansı korunur.
      </div>

      <AyarKart
        label="Personel Mesai Arşiv Süresi"
        desc="Personel giriş/çıkış (mesai) kayıtlarının oluşturulduktan kaç saat sonra arşive taşınacağını belirler. Arşivlenen mesai kayıtları Personel Raporları > Arşiv sekmesinden görüntülenebilir."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 200 }}>
            <input type="number" min={1} max={720} value={arsivMesai}
              onChange={e => setArsivMesai(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>saat</span>
          </div>
          <SaveBtn onClick={() => handleSave({ arsiv_mesai_saat: arsivMesai })} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: T.textSoft }}>= {saatLabel(arsivMesai)}</div>
      </AyarKart>

      <AyarKart
        label="Müşteri Değerlendirme Arşiv Süresi"
        desc="Müşteri memnuniyet değerlendirmelerinin oluşturulduktan kaç saat sonra arşive taşınacağını belirler. Arşivlenen değerlendirmeler Müşteri Raporları > Arşiv sekmesinden görüntülenebilir."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 200 }}>
            <input type="number" min={1} max={720} value={arsivMusteri}
              onChange={e => setArsivMusteri(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>saat</span>
          </div>
          <SaveBtn onClick={() => handleSave({ arsiv_musteri_saat: arsivMusteri })} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: T.textSoft }}>= {saatLabel(arsivMusteri)}</div>
      </AyarKart>

      <AyarKart
        label="Spesifik Görev Arşiv Süresi"
        desc="Spesifik (tek seferlik) görevlerin oluşturulduktan kaç saat sonra arşive taşınacağını belirler. Görevlere bağlı çeklist sonuçları da birlikte arşivlenir. Arşivlenen görevler ilgili raporlarda görünmeye devam eder."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 200 }}>
            <input type="number" min={1} max={720} value={arsivSpesifik}
              onChange={e => setArsivSpesifik(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>saat</span>
          </div>
          <SaveBtn onClick={() => handleSave({ arsiv_spesifik_saat: arsivSpesifik })} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: T.textSoft }}>= {saatLabel(arsivSpesifik)}</div>
      </AyarKart>

      <div style={{ padding: '10px 14px', background: T.grayLight, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.textSoft, lineHeight: 1.6 }}>
        <strong>Not:</strong> Frekansiyel görevler gün sonu otomatik arşivlenir (terminal duruma geçen görevler aynı gece taşınır). Bu süre sistem tarafından yönetilir ve değiştirilemez.
      </div>
    </div>
  )
}
