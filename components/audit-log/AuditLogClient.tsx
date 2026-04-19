'use client'

import React, { useEffect, useMemo, useState } from 'react'

interface AuditRow {
  id: number
  tarih: string
  tip: string
  tablo: string
  satir_sayisi: number
  basarili: boolean
  hata_mesaji: string | null
  firma_id: string | null
  proje_id: string | null
  kullanici_id: string | null
  kullanici_isim: string | null
  detay: any
}

const TIP_RENK: Record<string, string> = {
  kullanici_ekle: '#059669',
  kullanici_guncelle: '#0284c7',
  kullanici_sil: '#dc2626',
  kullanici_aktif_pasif: '#ca8a04',
  kullanici_sifre_degis: '#7c3aed',
  proje_ekle: '#059669',
  proje_guncelle: '#0284c7',
  proje_sil: '#dc2626',
  lokasyon_sil: '#dc2626',
  lokasyon_grup_sil: '#dc2626',
  gorev_sil: '#dc2626',
  gorev_toplu_sil: '#dc2626',
  canli_gorev_sil: '#dc2626',
  kural_ekle: '#059669',
  kural_guncelle: '#0284c7',
  kural_sil: '#dc2626',
  ceklist_arsiv_sil: '#dc2626',
  ceklist_arsiv_toplu_sil: '#dc2626',
  ayar_degis_firma: '#7c3aed',
  ayar_degis_proje: '#7c3aed',
  login_basarili: '#059669',
  login_basarisiz: '#dc2626',
  yetki_reddedildi: '#ea580c',
  manuel_yetim_temizlik: '#7c3aed',
  arsivle: '#0284c7',
  butunluk_kontrol: '#0284c7',
  manuel_butunluk_kontrol: '#7c3aed',
  cron_max_sure: '#0284c7',
  cron_simulasyon: '#0284c7',
  cron_personel_destek: '#0284c7',
  cron_bekleyen_islem: '#0284c7',
}

interface Props { isSA: boolean; firmalarListesi?: any[] }

export default function AuditLogClient({ isSA, firmalarListesi = [] }: Props) {
  const [data, setData] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tip, setTip] = useState('')
  const [gun, setGun] = useState(30)
  const [basarili, setBasarili] = useState<'' | 'true' | 'false'>('')
  const [q, setQ] = useState('')
  const [saFirma, setSaFirma] = useState<string | null>(null)
  const [detay, setDetay] = useState<AuditRow | null>(null)

  function yukle() {
    setLoading(true)
    const p = new URLSearchParams({ gun: String(gun) })
    if (tip) p.set('tip', tip)
    if (basarili) p.set('basarili', basarili)
    if (q.trim()) p.set('q', q.trim())
    if (isSA && saFirma) p.set('firmaId', saFirma)
    fetch(`/api/audit-log?${p}`)
      .then(r => r.json())
      .then(j => setData(Array.isArray(j?.data) ? j.data : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { yukle() }, [tip, gun, basarili, saFirma])

  function tarihFormat(iso: string) {
    try { return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  function tipEtiket(t: string) {
    const m: Record<string, string> = {
      kullanici_ekle: '👤 Kullanıcı Eklendi',
      kullanici_guncelle: '👤 Kullanıcı Güncellendi',
      kullanici_sil: '🗑 Kullanıcı Silindi',
      kullanici_aktif_pasif: '🔁 Kullanıcı Aktif/Pasif',
      kullanici_sifre_degis: '🔒 Şifre Değişimi',
      proje_ekle: '🗂 Proje Eklendi',
      proje_guncelle: '🗂 Proje Güncellendi',
      proje_sil: '🗑 Proje Silindi',
      lokasyon_sil: '📍 Lokasyon Silindi',
      lokasyon_grup_sil: '🗺️ Lokasyon Grubu Silindi',
      gorev_sil: '✓ Görev Silindi',
      gorev_toplu_sil: '✓ Görev Toplu Silindi',
      canli_gorev_sil: '⚡ Canlı Görev Silindi',
      kural_ekle: '⚡ Kural Eklendi',
      kural_guncelle: '⚡ Kural Güncellendi',
      kural_sil: '🗑 Kural Silindi',
      ceklist_arsiv_sil: '🗑 Çeklist Arşiv Sil',
      ceklist_arsiv_toplu_sil: '🗑 Çeklist Arşiv Toplu Sil',
      ayar_degis_firma: '🛠️ Firma Ayar Değişti',
      ayar_degis_proje: '🛠️ Proje Ayar Değişti',
      login_basarili: '✓ Giriş',
      login_basarisiz: '✕ Başarısız Giriş',
      yetki_reddedildi: '🚫 Yetki Reddedildi',
      manuel_yetim_temizlik: '🧹 Yetim Temizlik',
      arsivle: '🗃 Arşiv',
      butunluk_kontrol: '🔍 Bütünlük Kontrol',
      manuel_butunluk_kontrol: '🔍 Manuel Bütünlük',
      cron_max_sure: '⏰ Cron: Max Süre Kontrol',
      cron_simulasyon: '🤖 Cron: Simülasyon',
      cron_personel_destek: '👷 Cron: Personel Destek',
      cron_bekleyen_islem: '📬 Cron: Bekleyen İşlem',
    }
    return m[t] ?? t
  }

  const firmaAdiMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of firmalarListesi) m[f.id] = f.firma_adi ?? f.ticari_unvan ?? f.id
    return m
  }, [firmalarListesi])

  return (
    <div style={{ padding: '20px 24px' }}>
      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="verde-input" placeholder="Ara (tip, tablo, hata...)"
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') yukle() }}
            style={{ maxWidth: 220 }} />
          {isSA && firmalarListesi.length > 0 && (
            <select className="verde-select" value={saFirma ?? 'tumu'} onChange={e => setSaFirma(e.target.value === 'tumu' ? null : e.target.value)} style={{ width: 160 }}>
              <option value="tumu">Firma (Tümü)</option>
              {firmalarListesi.map(f => <option key={f.id} value={f.id}>{f.firma_adi ?? f.ticari_unvan}</option>)}
            </select>
          )}
          <select className="verde-select" value={tip} onChange={e => setTip(e.target.value)} style={{ width: 200 }}>
            <option value="">İşlem Tipi (Tümü)</option>
            <optgroup label="Kullanıcı">
              <option value="kullanici_ekle">Ekle</option>
              <option value="kullanici_guncelle">Güncelle</option>
              <option value="kullanici_sil">Sil</option>
              <option value="kullanici_aktif_pasif">Aktif/Pasif</option>
            </optgroup>
            <optgroup label="Proje">
              <option value="proje_ekle">Ekle</option>
              <option value="proje_guncelle">Güncelle</option>
              <option value="proje_sil">Sil</option>
            </optgroup>
            <optgroup label="Lokasyon">
              <option value="lokasyon_sil">Sil</option>
              <option value="lokasyon_grup_sil">Grup Sil</option>
            </optgroup>
            <optgroup label="Kural">
              <option value="kural_ekle">Ekle</option>
              <option value="kural_guncelle">Güncelle</option>
              <option value="kural_sil">Sil</option>
            </optgroup>
            <optgroup label="Ayar">
              <option value="ayar_degis_proje">Proje Ayar</option>
              <option value="ayar_degis_firma">Firma Ayar</option>
            </optgroup>
            <optgroup label="Arşiv & Bütünlük">
              <option value="arsivle">Arşivleme</option>
              <option value="butunluk_kontrol">Bütünlük Kontrol</option>
              <option value="manuel_yetim_temizlik">Yetim Temizlik</option>
              <option value="ceklist_arsiv_sil">Çeklist Arşiv Sil</option>
              <option value="ceklist_arsiv_toplu_sil">Çeklist Arşiv Toplu Sil</option>
            </optgroup>
            <optgroup label="Cron">
              <option value="cron_max_sure">Max Süre</option>
              <option value="cron_simulasyon">Simülasyon</option>
              <option value="cron_personel_destek">Personel Destek</option>
              <option value="cron_bekleyen_islem">Bekleyen İşlem</option>
            </optgroup>
          </select>
          <select className="verde-select" value={gun} onChange={e => setGun(Number(e.target.value))} style={{ width: 130 }}>
            <option value={1}>Son 1 gün</option>
            <option value={7}>Son 7 gün</option>
            <option value={30}>Son 30 gün</option>
            <option value={90}>Son 90 gün</option>
            <option value={365}>Son 1 yıl</option>
          </select>
          <select className="verde-select" value={basarili} onChange={e => setBasarili(e.target.value as any)} style={{ width: 130 }}>
            <option value="">Durum (Tümü)</option>
            <option value="true">✓ Başarılı</option>
            <option value="false">✕ Hata</option>
          </select>
          <button onClick={yukle} disabled={loading} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
            {loading ? 'Yükleniyor…' : '↻ Yenile'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7280' }}>
            <strong>{data.length}</strong> kayıt
          </span>
        </div>

        <div style={{ maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
          <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 140 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 150 }} />
              {isSA && <col style={{ width: 130 }} />}
              <col style={{ width: 70 }} />
              <col />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>İşlem</th>
                <th>Yapan</th>
                {isSA && <th>Firma</th>}
                <th style={{ textAlign: 'center' }}>Satır</th>
                <th>Özet</th>
                <th style={{ textAlign: 'center' }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading && data.length === 0 ? (
                <tr><td colSpan={isSA ? 7 : 6} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Yükleniyor…</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={isSA ? 7 : 6} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Kayıt bulunamadı</td></tr>
              ) : (
                data.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetay(r)}>
                    <td style={{ fontSize: 12.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{tarihFormat(r.tarih)}</td>
                    <td style={{ fontSize: 12.5, fontWeight: 600, color: TIP_RENK[r.tip] ?? '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.tip}>
                      {tipEtiket(r.tip)}
                    </td>
                    <td style={{ fontSize: 12.5, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.kullanici_isim ?? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>sistem</span>}
                    </td>
                    {isSA && (
                      <td style={{ fontSize: 12.5, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.firma_id ? (firmaAdiMap[r.firma_id] ?? '—') : '—'}
                      </td>
                    )}
                    <td style={{ fontSize: 12, textAlign: 'center', color: '#4b5563' }}>{r.satir_sayisi}</td>
                    <td style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.hata_mesaji || (r.detay ? JSON.stringify(r.detay).slice(0, 100) : r.tablo)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.basarili ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>✓</span>
                      ) : (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>✕</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDetay(null) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(680px, calc(100vw - 24px))', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800 }}>📜 Log Detayı #{detay.id}</div>
              <button onClick={() => setDetay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div><strong>Tarih:</strong> {tarihFormat(detay.tarih)}</div>
              <div><strong>İşlem Tipi:</strong> <code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{detay.tip}</code> · {tipEtiket(detay.tip)}</div>
              <div><strong>Tablo:</strong> {detay.tablo}</div>
              <div><strong>Satır Sayısı:</strong> {detay.satir_sayisi}</div>
              <div><strong>Durum:</strong> {detay.basarili ? <span style={{ color: '#166534', fontWeight: 700 }}>✓ Başarılı</span> : <span style={{ color: '#991b1b', fontWeight: 700 }}>✕ Başarısız</span>}</div>
              <div><strong>İşlemi Yapan:</strong> {detay.kullanici_isim ?? <em>sistem (cron)</em>}</div>
              {detay.firma_id && <div><strong>Firma:</strong> <code style={{ fontSize: 11 }}>{detay.firma_id}</code></div>}
              {detay.proje_id && <div><strong>Proje:</strong> <code style={{ fontSize: 11 }}>{detay.proje_id}</code></div>}
              {detay.hata_mesaji && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, color: '#991b1b' }}>
                  <strong>Hata:</strong> {detay.hata_mesaji}
                </div>
              )}
              {detay.detay && (
                <>
                  <div style={{ marginTop: 6 }}><strong>Detay:</strong></div>
                  <pre style={{ background: '#f9fafb', padding: 12, borderRadius: 8, fontSize: 11, overflow: 'auto', maxHeight: 300 }}>
                    {JSON.stringify(detay.detay, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
