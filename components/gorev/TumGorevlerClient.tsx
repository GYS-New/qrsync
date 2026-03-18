'use client'

import { useMemo, useState } from 'react'
import { formatDateTime, GOREV_DURUM_LABEL } from '@/lib/utils'

const DURUM_RENK: Record<string, string> = {
  ACIK: 'status-acik',
  ISLEMDE: 'status-islemde',
  TAMAMLANDI: 'status-tamamlandi',
  IPTAL: 'status-iptal',
}

export default function TumGorevlerClient({
  base,
  readonly,
  lokasyonlar,
  kullanicilar,
  initialGorevler,
}: {
  base: '/sa' | '/ta' | '/u'
  readonly: boolean
  lokasyonlar: { id: string; tanim: string }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
  initialGorevler: any[]
}) {
  const [q, setQ] = useState('')
  const [lokasyonId, setLokasyonId] = useState('')
  const [kullaniciId, setKullaniciId] = useState('')
  const [durum, setDurum] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const fromD = from ? new Date(from + 'T00:00:00') : null
    const toD = to ? new Date(to + 'T23:59:59') : null

    return (initialGorevler ?? []).filter((g: any) => {
      if (s) {
        const hay = [
          g.tanim ?? '',
          g.lokasyonlar?.tanim ?? '',
          g.users?.isim_soyisim ?? '',
        ].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }

      if (lokasyonId && g.lokasyon_id !== lokasyonId) return false
      if (kullaniciId && g.atanan_kullanici_id !== kullaniciId) return false
      if (durum && g.durum !== durum) return false

      if (fromD || toD) {
        const d = g.olusturma_tarihi ? new Date(g.olusturma_tarihi) : null
        if (!d) return false
        if (fromD && d < fromD) return false
        if (toD && d > toD) return false
      }

      return true
    })
  }, [q, lokasyonId, kullaniciId, durum, from, to, initialGorevler])

  function clear() {
    setQ('')
    setLokasyonId('')
    setKullaniciId('')
    setDurum('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="verde-card" style={{ padding: 16 }}>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap: 12, flexWrap:'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f1a0f' }}>FREKANSİYEL GÖREV YÖNETİMİ</div>
          <div style={{ fontSize: 14, color: '#7a907a', marginTop: 2 }}>
            Başlıklara göre filtrele • Tarih aralığı + kişi filtresi birlikte uygulanır
          </div>
        </div>

        <a href={`${base}/dashboard/canli-islemler`} className="text-[14px] underline" style={{ color:'#2e8b2e' }}>
          Canlı Görevler'e Dön
        </a>
      </div>

      <div style={{ display:'flex', gap: 10, flexWrap:'wrap', marginBottom: 14 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara (görev, lokasyon, kişi)"
          className="verde-input"
          style={{ minWidth: 220 }}
        />

        <select className="verde-select" value={lokasyonId} onChange={(e) => setLokasyonId(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">Lokasyon (Tümü)</option>
          {lokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
        </select>

        <select className="verde-select" value={kullaniciId} onChange={(e) => setKullaniciId(e.target.value)} style={{ minWidth: 200 }}>
          <option value="">Atanan (Tümü)</option>
          {kullanicilar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
        </select>

        <select className="verde-select" value={durum} onChange={(e) => setDurum(e.target.value)} style={{ minWidth: 170 }}>
          <option value="">Durum (Tümü)</option>
          <option value="ACIK">Açık</option>
          <option value="ISLEMDE">İşlemde</option>
          <option value="TAMAMLANDI">Tamamlandı</option>
          <option value="IPTAL">İptal</option>
        </select>

        <div style={{ display:'flex', gap: 8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontSize: 13, color:'#506050' }}>Tarih:</div>
          <input type="date" className="verde-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          <div style={{ fontSize: 13, color:'#506050' }}>—</div>
          <input type="date" className="verde-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <button
          type="button"
          onClick={clear}
          className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[14px] hover:bg-[#f3faf3]"
        >
          Temizle
        </button>
      </div>

      <div className="verde-table-wrap">
        <table className="verde-table">
          <thead>
            <tr>
              <th>Görev</th>
              <th>Lokasyon</th>
              <th>Atanan</th>
              <th>Aktif Saat</th>
              <th>Durum</th>
              <th>İşlemi Yapan</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g: any) => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.tanim}</td>
                <td style={{ color:'#506050' }}>{g.lokasyonlar?.tanim ?? '—'}</td>
                <td style={{ color:'#506050' }}>{g.users?.isim_soyisim ?? '—'}</td>
                <td style={{ color:'#7a907a', whiteSpace:'nowrap', fontSize: 14 }}>{g.olusturma_tarihi ? formatDateTime(g.olusturma_tarihi) : '—'}</td>
                <td>
                  <span className={`verde-badge ${DURUM_RENK[g.durum] ?? 'status-acik'}`}>
                    {GOREV_DURUM_LABEL[g.durum] ?? g.durum}
                  </span>
                </td>
                <td style={{ color:'#7a907a' }}>—</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6} style={{ textAlign:'center', color:'#7a907a', padding:'26px 0', fontSize: 14 }}>
                  Kriterlere uygun görev bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
