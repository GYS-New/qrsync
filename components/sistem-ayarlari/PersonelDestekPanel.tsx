'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

type Ayar = {
  id: string
  ust_lokasyon_id: string
  hedef_oran: number
  aktif: boolean
}

type Lokasyon = {
  id: string
  tanim: string
  parent_id?: string | null
}

export default function PersonelDestekPanel({ firmaId, projeId, lokasyonlar }: {
  firmaId: string
  projeId: string | null
  lokasyonlar: Lokasyon[]
}) {
  const [ayarlar, setAyarlar] = useState<Ayar[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const { toast } = useToast()

  // Üst lokasyonları bul (parent_id null veya firma kök)
  const ustLokasyonlar = lokasyonlar.filter(l => !l.parent_id)

  useEffect(() => {
    yukle()
  }, [firmaId, projeId])

  async function yukle() {
    try {
      const qp = new URLSearchParams({ firma_id: firmaId })
      if (projeId) qp.set('proje_id', projeId)
      const res = await fetch(`/api/personel-destek?${qp}`)
      const j = await res.json()
      setAyarlar(j.data ?? [])
    } catch {}
    setLoading(false)
  }

  function getAyar(ustLokId: string): Ayar | undefined {
    return ayarlar.find(a => a.ust_lokasyon_id === ustLokId)
  }

  async function kaydetVeya(ustLokId: string, hedefOran: number) {
    const mevcut = getAyar(ustLokId)
    setSaving(ustLokId)
    try {
      if (mevcut) {
        await fetch('/api/personel-destek', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mevcut.id, hedef_oran: hedefOran }),
        })
      } else {
        await fetch('/api/personel-destek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, ust_lokasyon_id: ustLokId, hedef_oran: hedefOran }),
        })
      }
      await yukle()
      toast({ type: 'success', title: 'Kaydedildi', message: `Hedef oran %${hedefOran} olarak güncellendi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(null)
  }

  async function toggle(ustLokId: string) {
    const mevcut = getAyar(ustLokId)
    setSaving(ustLokId)
    try {
      if (mevcut) {
        await fetch('/api/personel-destek', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mevcut.id, aktif: !mevcut.aktif }),
        })
      } else {
        // Önce oluştur, sonra aktif yap
        await fetch('/api/personel-destek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, ust_lokasyon_id: ustLokId, hedef_oran: 80 }),
        })
        // Yeniden yükle ve aktif yap
        const qp = new URLSearchParams({ firma_id: firmaId })
        if (projeId) qp.set('proje_id', projeId)
        const r = await fetch(`/api/personel-destek?${qp}`)
        const j = await r.json()
        const yeni = (j.data ?? []).find((a: any) => a.ust_lokasyon_id === ustLokId)
        if (yeni) {
          await fetch('/api/personel-destek', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: yeni.id, aktif: true }),
          })
        }
      }
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(null)
  }

  async function sil(id: string) {
    if (!confirm('Bu destek kaydını silmek istediğinize emin misiniz?')) return
    setSaving(id)
    try {
      await fetch('/api/personel-destek', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await yukle()
      toast({ type: 'success', title: 'Silindi', message: 'Destek kaydı kaldırıldı.' })
    } catch {}
    setSaving(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="verde-spinner" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Personel Görev Desteği</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
          Her vardiya sonunda açık kalan görevleri otomatik tamamlar.
          Üst lokasyon bazında hedef oran belirleyerek çalışır.
          Çeklistler dahil, doğal sürelerde tamamlanır.
        </div>
      </div>

      {ustLokasyonlar.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 14 }}>
          Üst lokasyon bulunamadı.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ustLokasyonlar.map(lok => {
            const ayar = getAyar(lok.id)
            const aktif = ayar?.aktif ?? false
            const hedef = ayar?.hedef_oran ?? 80
            const isSaving = saving === lok.id || saving === ayar?.id

            return (
              <div key={lok.id} className="verde-card" style={{
                padding: '16px 20px',
                borderLeft: aktif ? '3px solid #22c55e' : '3px solid #e5e7eb',
                background: aktif ? '#f0fdf4' : undefined,
                opacity: isSaving ? 0.7 : 1,
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Lokasyon adı */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                      {aktif ? '🟢 ' : '⚪ '}{lok.tanim}
                    </div>
                    {aktif && (
                      <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>
                        Aktif — Vardiya sonunda otomatik tamamlayacak
                      </div>
                    )}
                  </div>

                  {/* Hedef oran */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Hedef:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={hedef}
                      onChange={e => {
                        const val = Math.min(100, Math.max(1, parseInt(e.target.value) || 80))
                        setAyarlar(prev => {
                          if (ayar) return prev.map(a => a.id === ayar.id ? { ...a, hedef_oran: val } : a)
                          return [...prev, { id: `temp-${lok.id}`, ust_lokasyon_id: lok.id, hedef_oran: val, aktif: false }]
                        })
                      }}
                      onBlur={() => kaydetVeya(lok.id, hedef)}
                      style={{
                        width: 56,
                        height: 32,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        fontSize: 14,
                        fontWeight: 700,
                        textAlign: 'center',
                        color: '#111827',
                      }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>%</span>
                  </div>

                  {/* AÇ / KAPAT toggle */}
                  <button
                    onClick={() => toggle(lok.id)}
                    disabled={isSaving}
                    style={{
                      padding: '6px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      background: aktif ? '#dc2626' : '#22c55e',
                      color: '#fff',
                      minWidth: 80,
                      transition: 'all 0.15s',
                    }}
                  >
                    {aktif ? 'KAPAT' : 'AÇ'}
                  </button>

                  {/* Sil */}
                  {ayar && (
                    <button
                      onClick={() => sil(ayar.id)}
                      disabled={isSaving}
                      style={{
                        padding: '6px 10px',
                        fontSize: 11,
                        borderRadius: 6,
                        border: '1px solid #fca5a5',
                        background: '#fef2f2',
                        cursor: 'pointer',
                        color: '#dc2626',
                        fontWeight: 600,
                      }}
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
