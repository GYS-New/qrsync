'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/ToastProvider'

type Kural = {
  id: string
  tanim: string
  aktif_olma_saati: string
  aktif_gunler: number[]
  lokasyon_tanim?: string
  aktif: boolean
}
type Duraklat = { id: string; tanim: string; tarih: string; vardiya_no: number }
type TanimGrup = { tanim: string; kurallar: Kural[]; aktifOlmaSaati: string; aktifGunler: number[] }

const GUN_ISIMLERI = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
function gunEtiket(gunler: number[]) {
  if (!gunler?.length) return ''
  if (gunler.length === 7) return 'Her gün'
  return gunler.map(g => GUN_ISIMLERI[g] ?? g).join(', ')
}

export default function GorevDuraklatmalariClient({ firmaId, projeId }: { firmaId: string; projeId: string | null }) {
  const [kurallar, setKurallar] = useState<Kural[]>([])
  const [duraklatmalar, setDuraklatmalar] = useState<Duraklat[]>([])
  const [loading, setLoading] = useState(true)
  const [modalTanim, setModalTanim] = useState<TanimGrup | null>(null)
  const { toast } = useToast()

  // Kuralları ve duraklatmaları yükle
  useEffect(() => {
    if (!firmaId) return
    let alive = true

    async function yukle() {
      try {
        const [kuralRes, duraklatRes] = await Promise.all([
          fetch(`/api/gorev-kurallari?firma_id=${firmaId}${projeId ? `&proje_id=${projeId}` : ''}`),
          fetch(`/api/gorev-kurallari/duraklat-vardiya?firmaId=${firmaId}${projeId ? `&projeId=${projeId}` : ''}`),
        ])
        const kuralData = await kuralRes.json()
        const duraklatData = await duraklatRes.json()
        if (alive) {
          setKurallar(Array.isArray(kuralData) ? kuralData.filter((k: any) => k.aktif) : [])
          setDuraklatmalar(duraklatData.data ?? [])
        }
      } catch {}
      if (alive) setLoading(false)
    }

    yukle()
    return () => { alive = false }
  }, [firmaId, projeId])

  // Tanım bazlı grupla
  const tanimGruplari = useMemo(() => {
    const map = new Map<string, Kural[]>()
    for (const k of kurallar) {
      const arr = map.get(k.tanim) ?? []
      arr.push(k)
      map.set(k.tanim, arr)
    }
    const result: TanimGrup[] = []
    for (const [tanim, kList] of map) {
      result.push({
        tanim,
        kurallar: kList,
        aktifOlmaSaati: kList[0]?.aktif_olma_saati?.slice(0, 5) ?? '',
        aktifGunler: kList[0]?.aktif_gunler ?? [],
      })
    }
    return result.sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))
  }, [kurallar])

  // Tanım bazında duraklatma sayısı
  function duraklatmaSayisi(tanim: string) {
    return duraklatmalar.filter(d => d.tanim === tanim).length
  }

  async function refreshDuraklatmalar() {
    try {
      const res = await fetch(`/api/gorev-kurallari/duraklat-vardiya?firmaId=${firmaId}${projeId ? `&projeId=${projeId}` : ''}`)
      const j = await res.json()
      setDuraklatmalar(j.data ?? [])
    } catch {}
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="verde-spinner" />
      </div>
    )
  }

  if (tanimGruplari.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 14 }}>
        Henüz tanımlı görev kuralı bulunmuyor.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tanimGruplari.map(tg => {
          const dc = duraklatmaSayisi(tg.tanim)
          return (
            <div key={tg.tanim} className="verde-card" style={{ padding: '14px 20px', borderLeft: dc > 0 ? '3px solid #f59e0b' : undefined, background: dc > 0 ? '#fffdf7' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                    {dc > 0 ? '⏸ ' : '📋 '}{tg.tanim}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {tg.kurallar.length} lokasyon · {tg.aktifOlmaSaati} · {gunEtiket(tg.aktifGunler)}
                  </div>
                  {dc > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {dc} aktif duraklatma
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setModalTanim(tg)}
                  style={{ padding: '6px 16px', fontSize: 13, borderRadius: 8, border: '1px solid #fbbf24', background: '#fffbeb', cursor: 'pointer', color: '#92400e', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ⏸ Duraklat
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Duraklatma Modal */}
      {modalTanim && (
        <DuraklatModal
          tanim={modalTanim.tanim}
          firmaId={firmaId}
          projeId={projeId}
          aktifOlmaSaati={modalTanim.aktifOlmaSaati}
          onClose={() => { setModalTanim(null); refreshDuraklatmalar() }}
          toast={toast}
        />
      )}
    </div>
  )
}

/** Duraklatma popup — VardiyaDuraklatModal'ın bağımsız versiyonu */
function DuraklatModal({ tanim, firmaId, projeId, aktifOlmaSaati, onClose, toast }: {
  tanim: string; firmaId: string; projeId: string | null; aktifOlmaSaati: string
  onClose: () => void; toast: (o: any) => void
}) {
  const [vardiyalar, setVardiyalar] = useState<{ no: number; baslangic: string; bitis: string }[]>([])
  const [uygunVardiyaNo, setUygunVardiyaNo] = useState<number | null>(null)
  const [seciliTarihler, setSeciliTarihler] = useState<string[]>([])
  const [seciliVardiyalar, setSeciliVardiyalar] = useState<number[]>([])
  const [mevcutlar, setMevcutlar] = useState<any[]>([])
  const [tarihInput, setTarihInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/sistem-ayarlari/vardiya?firmaId=${firmaId}`)
      .then(r => r.json())
      .then(j => {
        const sayisi = j.vardiya_sayisi ?? 3
        const tumAyar = j.tum_vardiya_ayarlari
        const aktifSet = tumAyar?.[sayisi] ?? j.vardiya_saatleri ?? []
        setVardiyalar(aktifSet)
        for (const v of aktifSet) {
          const geceVardiya = v.bitis <= v.baslangic
          const eslesme = geceVardiya
            ? (aktifOlmaSaati >= v.baslangic || aktifOlmaSaati < v.bitis)
            : (aktifOlmaSaati >= v.baslangic && aktifOlmaSaati < v.bitis)
          if (eslesme) {
            setUygunVardiyaNo(v.no)
            setSeciliVardiyalar([v.no])
            break
          }
        }
      })
      .catch(() => {})

    const p = new URLSearchParams({ firmaId, tanim })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/gorev-kurallari/duraklat-vardiya?${p}`)
      .then(r => r.json())
      .then(j => setMevcutlar(j.data ?? []))
      .catch(() => {})
  }, [firmaId, projeId, tanim])

  function tarihEkle() {
    if (!tarihInput || seciliTarihler.includes(tarihInput)) return
    setSeciliTarihler(prev => [...prev, tarihInput].sort())
    setTarihInput('')
  }

  async function kaydet() {
    if (!seciliTarihler.length || !seciliVardiyalar.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/gorev-kurallari/duraklat-vardiya', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId, projeId, tanim, tarihler: seciliTarihler, vardiyalar: seciliVardiyalar }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      toast({ type: 'success', title: 'Duraklatıldı', message: `${j.eklenen} duraklatma eklendi.` })
      const p = new URLSearchParams({ firmaId, tanim })
      if (projeId) p.set('projeId', projeId)
      const r2 = await fetch(`/api/gorev-kurallari/duraklat-vardiya?${p}`)
      const j2 = await r2.json()
      setMevcutlar(j2.data ?? [])
      setSeciliTarihler([])
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  async function kaldir(id: string, t: string, v: number) {
    await fetch('/api/gorev-kurallari/duraklat-vardiya', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId, projeId, tanim, tarih: t, vardiya_no: v }),
    })
    setMevcutlar(prev => prev.filter(m => m.id !== id))
  }

  const haftaGunleri = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>⏸ Vardiya Duraklatma</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          <strong>{tanim}</strong> kuralı için belirli günlerde ve vardiyalarda görev üretimini duraklat.
        </div>

        {/* Tarih seçimi */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Tarih Seç</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={tarihInput} onChange={e => setTarihInput(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
            <button onClick={tarihEkle} disabled={!tarihInput}
              style={{ height: 36, padding: '0 14px', borderRadius: 8, background: '#1d4ed8', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: tarihInput ? 1 : 0.4 }}>
              Ekle
            </button>
          </div>
          {seciliTarihler.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {seciliTarihler.map(t => {
                const d = new Date(t + 'T00:00:00')
                const gun = haftaGunleri[d.getDay()]
                return (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                    {t} ({gun})
                    <span onClick={() => setSeciliTarihler(prev => prev.filter(x => x !== t))} style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 800 }}>×</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Vardiya — otomatik eşleşen */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Duraklatılacak Vardiya</div>
          {uygunVardiyaNo ? (
            <div style={{ padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, background: '#eff6ff', border: '2px solid #1d4ed8', color: '#1d4ed8', display: 'inline-block' }}>
              {uygunVardiyaNo}. Vardiya ({vardiyalar.find(v => v.no === uygunVardiyaNo)?.baslangic} - {vardiyalar.find(v => v.no === uygunVardiyaNo)?.bitis})
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginLeft: 8 }}>Aktif saat: {aktifOlmaSaati}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#dc2626' }}>Aktif olma saati ({aktifOlmaSaati}) hiçbir vardiyayla eşleşmiyor</div>
          )}
        </div>

        {/* Kaydet butonu */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={kaydet} disabled={saving || !seciliTarihler.length || !seciliVardiyalar.length}
            style={{ padding: '8px 20px', borderRadius: 8, background: '#92400e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (seciliTarihler.length && seciliVardiyalar.length) ? 1 : 0.4 }}>
            {saving ? 'Kaydediliyor...' : '⏸ Duraklat'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, background: '#fff', color: '#374151', border: '1px solid #e2e8f0', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Kapat
          </button>
        </div>

        {/* Mevcut duraklatmalar */}
        {mevcutlar.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Aktif Duraklatmalar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mevcutlar.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#92400e' }}>{m.tarih}</span>
                  <span style={{ color: '#6b7280' }}>·</span>
                  <span style={{ color: '#374151' }}>{m.vardiya_no}. Vardiya</span>
                  <button onClick={() => kaldir(m.id, m.tarih, m.vardiya_no)}
                    style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                    Kaldır
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
