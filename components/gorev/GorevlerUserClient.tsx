'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, GOREV_DURUM_LABEL } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'

const DURUM_RENK: Record<string, string> = {
  ACIK: 'status-acik',
  ISLEMDE: 'status-islemde',
  TAMAMLANDI: 'status-tamamlandi',
  IPTAL: 'status-iptal',
}

export default function GorevlerUserClient({
  meId,
  firmaId,
  initialGorevler,
}: {
  meId: string
  firmaId: string | null
  initialGorevler: any[]
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const [gorevler, setGorevler] = useState<any[]>(initialGorevler)
  const [locMap, setLocMap] = useState<Record<string, { tanim: string; parent_id: string | null }>>({})
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const getLocPath = useMemo(() => {
    return (lokasyonId: string | null | undefined, fallbackName?: string | null) => {
      if (!lokasyonId) return fallbackName ?? '—'
      const parts: string[] = []
      let cur: string | null = lokasyonId
      let guard = 0
      while (cur && guard < 8) {
        const node: { tanim: string; parent_id: string | null } | undefined = locMap[cur]
        if (!node) break
        parts.push(node.tanim)
        cur = node.parent_id
        guard++
      }
      return parts.reverse().join(' / ') || (fallbackName ?? '—')
    }
  }, [locMap])

  useEffect(() => {
    if (!firmaId) return
    let alive = true
    supabase
      .from('lokasyonlar')
      .select('id,tanim,parent_id')
      .eq('firma_id', firmaId)
      .then(({ data }) => {
        if (!alive || !data) return
        const map: Record<string, { tanim: string; parent_id: string | null }> = {}
        data.forEach((l: any) => { map[l.id] = { tanim: l.tanim, parent_id: l.parent_id ?? null } })
        setLocMap(map)
      })
    return () => { alive = false }
  }, [firmaId])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return gorevler
    return gorevler.filter(g =>
      (g.tanim ?? '').toLowerCase().includes(s) ||
      (getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim) ?? '').toLowerCase().includes(s) ||
      (g.atanan?.isim_soyisim ?? '').toLowerCase().includes(s)
    )
  }, [q, gorevler, getLocPath])

  async function refresh() {
    if (!firmaId) return
    setLoading(true)
    const { data } = await supabase
      .from('gorevler')
      .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim)')
      .eq('firma_id', firmaId)
      .order('olusturma_tarihi', { ascending: false })
      .limit(500)
    if (data) setGorevler(data)
    setLoading(false)
  }

  async function setDurum(g: any, durum: 'TAMAMLANDI') {
    setLoading(true)
    const { error: err } = await supabase
      .from('gorevler')
      .update({ durum, durum_degisim_tarihi: new Date().toISOString(), islemi_yapan_id: meId })
      .eq('id', g.id)
    if (err) toast({ type: 'error', title: 'Hata', message: err.message })
    else toast({ type: 'success', title: 'Başarılı', message: 'Görev tamamlandı.' })
    await refresh()
    setLoading(false)
  }

  const isMine = (g: any) => g.atanan_kullanici_id === meId

  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="verde-input"
            placeholder="Görev ara (ad, lokasyon, atanan...)"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 300 }}
            autoComplete="off"
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: '#6b7280' }}>
              Toplam <strong style={{ color: '#374151' }}>{filtered.length}</strong> görev
            </span>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </Button>
          </div>
        </div>

        <table className="verde-table">
          <thead>
            <tr>
              <th>Görev</th>
              <th>Lokasyon</th>
              <th>Atanan</th>
              <th>Durum</th>
              <th>Tarih</th>
              <th style={{ textAlign: 'center' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g: any) => {
              const mine = isMine(g)
              return (
                <tr key={g.id} style={mine ? {} : { opacity: 0.7 }}>
                  <td style={{ fontWeight: mine ? 600 : 400 }}>
                    {g.tanim}
                    {mine && (
                      <span style={{
                        marginLeft: 6, fontSize: 11, fontWeight: 700,
                        background: '#e5e7eb', color: '#1f2937',
                        borderRadius: 4, padding: '1px 5px',
                      }}>Bana Atandı</span>
                    )}
                  </td>
                  <td style={{ color: '#4b5563' }}>{getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}</td>
                  <td style={{ color: '#4b5563', fontSize: 13 }}>{g.atanan?.isim_soyisim ?? '—'}</td>
                  <td>
                    <span className={`verde-badge ${DURUM_RENK[g.durum] ?? 'status-acik'}`}>
                      {GOREV_DURUM_LABEL[g.durum] ?? g.durum}
                    </span>
                  </td>
                  <td style={{ color: '#6b7280', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {formatDateTime(g.olusturma_tarihi)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {mine && g.durum === 'ISLEMDE' && (
                        <Button variant="primary" size="sm" onClick={() => setDurum(g, 'TAMAMLANDI')}>
                          Tamamla
                        </Button>
                      )}
                      {mine && g.durum === 'ACIK' && (
                        <span style={{ fontSize: 11.5, color: '#6b7280' }}>Bildirimden kabul/ret</span>
                      )}
                      {!mine && (
                        <span style={{ fontSize: 11.5, color: '#b0c4b0' }}>Sadece görüntüleme</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#6b7280', padding: '36px 0' }}>
                  Görev bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
