'use client'

import { useEffect, useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = { text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0', blue: '#1d4ed8', amber: '#d97706', amberLight: '#fef3c7', greenLight: '#dcfce7', green: '#16a34a' }

type Vardiya = { no: number; baslangic: string; bitis: string }
type TumAyarlar = {
  [key: number]: Vardiya[]
}

const BOS_AYARLAR: TumAyarlar = {
  1: [{ no: 1, baslangic: '', bitis: '' }],
  2: [{ no: 1, baslangic: '', bitis: '' }, { no: 2, baslangic: '', bitis: '' }],
  3: [{ no: 1, baslangic: '', bitis: '' }, { no: 2, baslangic: '', bitis: '' }, { no: 3, baslangic: '', bitis: '' }],
  4: [{ no: 1, baslangic: '', bitis: '' }, { no: 2, baslangic: '', bitis: '' }, { no: 3, baslangic: '', bitis: '' }, { no: 4, baslangic: '', bitis: '' }],
}

export default function VardiyaAyarlariPanel({ firmaId: propFirmaId }: { firmaId?: string | null }) {
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje } = useProje()
  const firmaIdEfektif = propFirmaId || saFirmaId
  const projeId = aktifProje?.id ?? null
  const projeAd = aktifProje?.ad ?? null
  const { toast } = useToast()

  // Hedef: 'firma' (firma default) veya 'proje' (proje override)
  const [hedef, setHedef] = useState<'firma' | 'proje'>('firma')
  const [sayisi, setSayisi] = useState(3)
  const [ayarlar, setAyarlar] = useState<TumAyarlar>(BOS_AYARLAR)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  // Data state — ham firma/proje ayarları (toggle değiştirince yüklenmek yerine cache'den okur)
  const [rawFirma, setRawFirma] = useState<any>(null)
  const [rawProje, setRawProje] = useState<any>(null)
  const [projeOverrideAktif, setProjeOverrideAktif] = useState(false)

  // Fetch
  useEffect(() => {
    if (!firmaIdEfektif) return
    setLoading(true)
    const qp = new URLSearchParams({ firmaId: firmaIdEfektif })
    if (projeId) qp.set('projeId', projeId)
    fetch(`/api/sistem-ayarlari/vardiya?${qp}`)
      .then(r => r.json())
      .then(j => {
        setRawFirma(j.firma)
        setRawProje(j.proje)
        const projeAktif = j.proje && (
          j.proje.vardiya_sayisi != null ||
          j.proje.vardiya_saatleri != null ||
          j.proje.tum_vardiya_ayarlari != null
        )
        setProjeOverrideAktif(!!projeAktif)
        // Default görünüm: override varsa proje, yoksa firma
        const baslangicHedef: 'firma' | 'proje' = projeAktif ? 'proje' : 'firma'
        setHedef(baslangicHedef)
        applyData(baslangicHedef === 'proje' ? j.proje : j.firma)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [firmaIdEfektif, projeId])

  function applyData(data: any) {
    setSayisi(data?.vardiya_sayisi ?? 3)
    const tumAyar = data?.tum_vardiya_ayarlari
    const yeni = { ...BOS_AYARLAR }
    if (tumAyar && typeof tumAyar === 'object') {
      for (const k of [1, 2, 3, 4]) {
        if (tumAyar[k]) yeni[k] = tumAyar[k]
      }
    } else if (data?.vardiya_saatleri && Array.isArray(data.vardiya_saatleri)) {
      // Legacy: tek dizi, sadece aktif sayıyı doldur
      const s = data?.vardiya_sayisi ?? 3
      if (yeni[s]) yeni[s] = data.vardiya_saatleri
    }
    setAyarlar(yeni)
  }

  // Hedef değişince ilgili kaynaktan veri yükle
  function hedefDegistir(yeni: 'firma' | 'proje') {
    setHedef(yeni)
    if (yeni === 'proje' && rawProje) {
      // Proje değerleri varsa onları yükle; yoksa firma'dan başla
      applyData(projeOverrideAktif ? rawProje : rawFirma)
    } else {
      applyData(rawFirma)
    }
  }

  function saatGuncelle(sayi: number, idx: number, field: 'baslangic' | 'bitis', val: string) {
    setAyarlar(prev => {
      const yeni = { ...prev }
      yeni[sayi] = yeni[sayi].map((v, i) => i === idx ? { ...v, [field]: val } : v)
      return yeni
    })
  }

  async function kaydet() {
    if (!firmaIdEfektif) return
    if (hedef === 'proje' && !projeId) {
      toast({ type: 'error', title: 'Hata', message: 'Proje override için önce bir proje seçili olmalı.' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/vardiya', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmaId: firmaIdEfektif,
          projeId,
          hedef,
          vardiya_sayisi: sayisi,
          vardiya_saatleri: ayarlar[sayisi],
          tum_vardiya_ayarlari: ayarlar,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Kaydedilemedi')
      }
      toast({
        type: 'success',
        title: 'Başarılı',
        message: hedef === 'proje'
          ? `Vardiya ayarları "${projeAd}" projesine özel kaydedildi.`
          : 'Vardiya ayarları firma seviyesinde kaydedildi.',
      })
      if (hedef === 'proje') setProjeOverrideAktif(true)
      // Refresh raw data
      const qp = new URLSearchParams({ firmaId: firmaIdEfektif })
      if (projeId) qp.set('projeId', projeId)
      const j2 = await fetch(`/api/sistem-ayarlari/vardiya?${qp}`).then(r => r.json())
      setRawFirma(j2.firma)
      setRawProje(j2.proje)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  async function projeOverrideKaldir() {
    if (!firmaIdEfektif || !projeId) return
    if (!confirm(`"${projeAd}" projesindeki vardiya override'ı kaldırılacak — proje artık firma default'unu kullanır. Emin misiniz?`)) return
    setResetting(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/vardiya', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmaId: firmaIdEfektif,
          projeId,
          hedef: 'proje',
          vardiya_sayisi: '__reset__',
          vardiya_saatleri: '__reset__',
          tum_vardiya_ayarlari: '__reset__',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Kaldırılamadı')
      }
      toast({ type: 'success', title: 'Override kaldırıldı', message: `"${projeAd}" artık firma default'unu kullanıyor.` })
      setProjeOverrideAktif(false)
      setHedef('firma')
      applyData(rawFirma)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setResetting(false)
  }

  if (loading) return <div style={{ padding: 20, color: T.textSoft }}>Yükleniyor...</div>

  const ti: React.CSSProperties = { flex: 1, height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, textAlign: 'center' }
  const aktifVardiyalar = ayarlar[sayisi] ?? []

  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Vardiya Tanımları</label>
        <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
          Her vardiya sayısı için ayrı saat aralığı tanımlayın. Sayı seçimi değiştiğinde saatler bağımsız kalır.
        </div>
      </div>

      {/* Hedef seçici — Firma vs Proje override */}
      {projeId && (
        <div style={{ padding: '12px 14px', background: '#f9fafb', border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 8 }}>
            Hedef
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => hedefDegistir('firma')}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 7, border: `1.5px solid ${hedef === 'firma' ? T.blue : T.border}`,
                background: hedef === 'firma' ? '#eff6ff' : '#fff', color: hedef === 'firma' ? T.blue : T.text,
                cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textAlign: 'left',
              }}>
              🏢 Firma Default
              <div style={{ fontSize: 10.5, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>
                Tüm projeler için geçerli (override yoksa)
              </div>
            </button>
            <button onClick={() => hedefDegistir('proje')}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 7, border: `1.5px solid ${hedef === 'proje' ? T.amber : T.border}`,
                background: hedef === 'proje' ? T.amberLight : '#fff', color: hedef === 'proje' ? T.amber : T.text,
                cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textAlign: 'left', position: 'relative',
              }}>
              📋 Sadece Bu Proje
              <div style={{ fontSize: 10.5, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>
                {projeAd}
              </div>
              {projeOverrideAktif && (
                <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: T.green, color: '#fff' }}>
                  AKTİF
                </span>
              )}
            </button>
          </div>
          {hedef === 'proje' && projeOverrideAktif && (
            <button onClick={projeOverrideKaldir} disabled={resetting}
              style={{
                padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff',
                color: T.textSoft, fontSize: 11, fontWeight: 600, cursor: resetting ? 'wait' : 'pointer',
              }}>
              {resetting ? 'Kaldırılıyor…' : '↺ Proje override\'ını kaldır (firma default\'a dön)'}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Vardiya Sayısı:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4].map(n => (
            <button key={n} onClick={() => setSayisi(n)}
              style={{
                width: 36, height: 36, borderRadius: 8, border: `2px solid ${sayisi === n ? T.blue : T.border}`,
                background: sayisi === n ? '#eff6ff' : '#fff', color: sayisi === n ? T.blue : T.text,
                fontWeight: 800, fontSize: 15, cursor: 'pointer',
              }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${aktifVardiyalar.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {aktifVardiyalar.map((v, idx) => (
          <div key={`${sayisi}-${v.no}`} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>{v.no}. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={v.baslangic} onChange={e => saatGuncelle(sayisi, idx, 'baslangic', e.target.value)} style={ti} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input type="time" value={v.bitis} onChange={e => saatGuncelle(sayisi, idx, 'bitis', e.target.value)} style={ti} />
            </div>
          </div>
        ))}
      </div>

      <button onClick={kaydet} disabled={saving}
        style={{
          padding: '8px 20px', borderRadius: 8,
          background: hedef === 'proje' ? T.amber : '#111827',
          color: '#fff', border: 'none', fontWeight: 700, fontSize: 13,
          cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
        {saving ? 'Kaydediliyor...' : hedef === 'proje' ? '💾 Sadece Bu Projeye Kaydet' : '💾 Firma Default Olarak Kaydet'}
      </button>
    </div>
  )
}
