'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { RefreshCw, Users, Clock, CheckCircle2, AlertTriangle, Search, Filter, XCircle, Zap } from 'lucide-react'

type Mesai = {
  id: string
  user_id: string | null
  kayit_tarihi: string
  giris_saati: string | null
  cikis_saati: string | null
  giris_tipi: string | null
  cikis_tipi: string | null
  arsivlendi?: boolean
  arsivleme_tarihi?: string | null
  isim_soyisim?: string | null
  users?: { isim_soyisim: string } | null
  cikis_devam_flag?: boolean
  cikis_bildirim_gonderildi?: boolean
}

function trSaat(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
}
function trTarih(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function trTarihSaat(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
}
function sureFmt(giris: string | null, cikis: string | null): string {
  if (!giris) return '—'
  const bas = new Date(giris).getTime()
  const bit = cikis ? new Date(cikis).getTime() : Date.now()
  const dk = Math.max(0, Math.floor((bit - bas) / 60000))
  const s = Math.floor(dk / 60), m = dk % 60
  return `${s}s ${String(m).padStart(2, '0')}dk`
}

const CIKIS_TIPI_STIL: Record<string, { label: string; bg: string; color: string; border: string; icon?: string }> = {
  MOBIL:                  { label: 'Mobil',            bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', icon: '📱' },
  QR:                     { label: 'QR',               bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', icon: '📱' },
  NFC:                    { label: 'NFC',              bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', icon: '📱' },
  OTOMATIK_ONAY:          { label: 'Otomatik (Onay)',  bg: '#fef3c7', color: '#92400e', border: '#fcd34d', icon: '✅' },
  OTOMATIK_ZAMAN_ASIMI:   { label: 'Otomatik (Zaman)', bg: '#fef3c7', color: '#92400e', border: '#fcd34d', icon: '⏱' },
  MANUEL_DUZELTME:        { label: 'Manuel Düzeltme',  bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4', icon: '✏️' },
}
function cikisBadge(tipi: string | null) {
  if (!tipi) return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
  const s = CIKIS_TIPI_STIL[tipi] ?? { label: tipi, bg: '#e5e7eb', color: '#374151', border: '#d1d5db' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {s.icon && <span>{s.icon}</span>}{s.label}
    </span>
  )
}

export default function PersonelMesaiPage() {
  const { firmaId } = useFirma()
  const { aktifProje } = useProje()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  const [baslangic, setBaslangic] = useState<string>(bugun)
  const [bitis, setBitis] = useState<string>(bugun)
  const [arama, setArama] = useState<string>('')
  const [durumFiltre, setDurumFiltre] = useState<'tum' | 'sahada' | 'tamamlanan' | 'otomatik'>('tum')
  const [kayitlar, setKayitlar] = useState<Mesai[]>([])
  const [loading, setLoading] = useState(false)
  const [aksiyonBusy, setAksiyonBusy] = useState<string | null>(null)

  const yukle = useCallback(async () => {
    if (!firmaId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId, baslangic, bitis })
      if (aktifProje?.id) p.set('proje_id', aktifProje.id)
      const res = await fetch(`/api/mesai/liste?${p}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Yüklenemedi')
      setKayitlar(json.data ?? [])
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
    setLoading(false)
  }, [firmaId, aktifProje, baslangic, bitis, toast])

  useEffect(() => { yukle() }, [yukle])

  // Sahada olan (cikis_saati null, arsivlenmemis) — tarih filtresinden bagimsiz her zaman
  const [sahadaOlan, setSahadaOlan] = useState<Mesai[]>([])
  useEffect(() => {
    if (!firmaId) return
    const p = new URLSearchParams({ firma_id: firmaId, baslangic: bugun, bitis: bugun })
    if (aktifProje?.id) p.set('proje_id', aktifProje.id)
    fetch(`/api/mesai/liste?${p}`).then(r => r.json()).then(j => {
      if (j.ok) {
        const acik = (j.data ?? []).filter((r: Mesai) => !r.cikis_saati && !r.arsivlendi)
        setSahadaOlan(acik)
      }
    }).catch(() => {})
  }, [firmaId, aktifProje, bugun, kayitlar])

  const filtreliListe = useMemo(() => {
    const q = arama.trim().toLowerCase()
    return kayitlar.filter(r => {
      const isim = (r.isim_soyisim ?? r.users?.isim_soyisim ?? '').toLowerCase()
      if (q && !isim.includes(q)) return false
      if (durumFiltre === 'sahada' && r.cikis_saati) return false
      if (durumFiltre === 'tamamlanan' && (!r.cikis_saati || (r.cikis_tipi ?? '').startsWith('OTOMATIK'))) return false
      if (durumFiltre === 'otomatik' && !(r.cikis_tipi ?? '').startsWith('OTOMATIK') && r.cikis_tipi !== 'MANUEL_DUZELTME') return false
      return true
    })
  }, [kayitlar, arama, durumFiltre])

  const metrikler = useMemo(() => {
    const bugunKayit = kayitlar.filter(r => r.kayit_tarihi === bugun)
    const otomatikSayi = kayitlar.filter(r => (r.cikis_tipi ?? '').startsWith('OTOMATIK')).length
    const toplamCalismaDk = kayitlar
      .filter(r => r.cikis_saati && r.giris_saati)
      .reduce((s, r) => s + Math.max(0, Math.floor((new Date(r.cikis_saati!).getTime() - new Date(r.giris_saati!).getTime()) / 60000)), 0)
    const tamamlananSayi = kayitlar.filter(r => r.cikis_saati).length
    const ortalamaDk = tamamlananSayi > 0 ? Math.floor(toplamCalismaDk / tamamlananSayi) : 0
    return {
      sahada: sahadaOlan.length,
      bugunGiris: bugunKayit.length,
      otomatik: otomatikSayi,
      ortalamaSaat: ortalamaDk > 0 ? `${Math.floor(ortalamaDk / 60)}s ${ortalamaDk % 60}dk` : '—',
    }
  }, [kayitlar, sahadaOlan, bugun])

  async function manuelKapat(row: Mesai) {
    const isim = row.isim_soyisim ?? row.users?.isim_soyisim ?? '—'
    const ok = await confirm({
      title: 'Mesai Manuel Kapama',
      message: `${isim} kişisinin açık mesai kaydını şimdiye kapatmak istiyor musunuz?\ncikis_tipi = MANUEL_DUZELTME olarak işaretlenir.`,
      confirmText: 'Kapat',
      variant: 'danger',
    })
    if (!ok) return
    setAksiyonBusy(row.id)
    try {
      const res = await fetch('/api/mesai/manuel-kapat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesai_id: row.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Kapatılamadı')
      toast({ type: 'success', title: 'Kapatıldı', message: `${isim} mesaisi manuel kapatıldı.` })
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setAksiyonBusy(null)
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#0f172a' }}>Personel Mesai Takibi</h1>
          <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>İş başı / çıkış kayıtları, otomatik kapama durumları</div>
        </div>
        <button onClick={yukle} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <RefreshCw size={14} style={loading ? { animation: 'spin 0.8s linear infinite' } : {}} /> Yenile
        </button>
      </div>

      {/* Metrik kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        <MetrikKart icon={<Users size={16} />} label="Sahada Olan" value={metrikler.sahada} tone="green" alt="Şu an mesaisi açık personel" />
        <MetrikKart icon={<CheckCircle2 size={16} />} label="Bugün Giriş" value={metrikler.bugunGiris} tone="blue" alt="Bugün iş başı yapan" />
        <MetrikKart icon={<Clock size={16} />} label="Ortalama Süre" value={metrikler.ortalamaSaat} tone="slate" alt="Tamamlanan mesailerin ortalaması (seçili aralık)" />
        <MetrikKart icon={<Zap size={16} />} label="Otomatik/Manuel Kapama" value={metrikler.otomatik} tone="amber" alt="Sistem tarafından kapatılan kayıtlar (seçili aralık)" />
      </div>

      {/* Filtre paneli */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} color="#64748b" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Filtre:</span>
        </div>
        <label style={inputLbl}>Başlangıç:
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inp} />
        </label>
        <label style={inputLbl}>Bitiş:
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} style={inp} />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', padding: 2, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          {(['tum','sahada','tamamlanan','otomatik'] as const).map(f => (
            <button key={f} onClick={() => setDurumFiltre(f)}
              style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: durumFiltre === f ? '#0f172a' : 'transparent', color: durumFiltre === f ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {f === 'tum' ? 'Tümü' : f === 'sahada' ? 'Sahada' : f === 'tamamlanan' ? 'Tamamlanan' : 'Otomatik/Manuel'}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 200 }}>
          <Search size={12} color="#94a3b8" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
          <input placeholder="Personel ara…" value={arama} onChange={e => setArama(e.target.value)}
            style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12.5, background: '#fff' }} />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
          <strong style={{ color: '#0f172a' }}>{filtreliListe.length}</strong> / {kayitlar.length} kayıt
        </span>
      </div>

      {/* Ana tablo */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
              <tr>
                <th style={th}>Personel</th>
                <th style={th}>Tarih</th>
                <th style={th}>Giriş</th>
                <th style={th}>Çıkış</th>
                <th style={th}>Süre</th>
                <th style={th}>Çıkış Tipi</th>
                <th style={th}>Durum</th>
                <th style={{ ...th, textAlign: 'center', width: 100 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading && filtreliListe.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Yükleniyor…</td></tr>
              )}
              {!loading && filtreliListe.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Kayıt yok</td></tr>
              )}
              {filtreliListe.map(r => {
                const acik = !r.cikis_saati
                const bilgi = r.cikis_devam_flag ? 'Devam Ediyor' : (r.cikis_bildirim_gonderildi ? 'Push Atıldı' : '')
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: acik ? '#f0fdf4' : '#fff' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.isim_soyisim ?? r.users?.isim_soyisim ?? '—'}</div>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#475569' }}>{trTarih(r.kayit_tarihi)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', color: '#0f172a', fontWeight: 600 }}>{trSaat(r.giris_saati)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', color: r.cikis_saati ? '#0f172a' : '#cbd5e1', fontWeight: 600 }}>
                      {r.cikis_saati ? trSaat(r.cikis_saati) : '—'}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: acik ? '#16a34a' : '#475569', fontWeight: acik ? 700 : 400 }}>
                      {sureFmt(r.giris_saati, r.cikis_saati)}
                    </td>
                    <td style={td}>{cikisBadge(r.cikis_tipi)}</td>
                    <td style={td}>
                      {acik ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                          Sahada {bilgi ? `· ${bilgi}` : ''}
                        </span>
                      ) : r.arsivlendi ? (
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#64748b', border: '1px solid #d1d5db' }}>Arşivde</span>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>Tamamlandı</span>
                      )}
                      {r.arsivleme_tarihi && (
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }} title={trTarihSaat(r.arsivleme_tarihi)}>arşiv: {trTarihSaat(r.arsivleme_tarihi)}</div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {acik && (
                        <button onClick={() => manuelKapat(r)} disabled={aksiyonBusy === r.id}
                          title="Mesaiyi şimdi kapat"
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <XCircle size={12} />
                          {aksiyonBusy === r.id ? '...' : 'Kapat'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bilgilendirme */}
      <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#78350f' }}>
        <strong>Arşiv sistemi:</strong> Mesai kayıtları 24+ saat sonra otomatik olarak <code>personel_mesai_kayitlari_arsiv</code> tablosuna
        taşınır (6 saatte bir çalışan cron ile). Tarih filtresi hem canlı hem arşiv kayıtlarını birlikte tarar — geçmiş her tarih için
        aynı sayfa üzerinden sorgulayabilirsiniz.
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const inp: React.CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12.5, background: '#fff' }
const inputLbl: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 600 }
const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e2e8f0' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }

function MetrikKart({ icon, label, value, tone, alt }: { icon: React.ReactNode; label: string; value: string | number; tone: 'green' | 'blue' | 'slate' | 'amber'; alt?: string }) {
  const tones = {
    green: { bg: '#f0fdf4', border: '#bbf7d0', accent: '#166534' },
    blue:  { bg: '#eff6ff', border: '#bfdbfe', accent: '#1e40af' },
    slate: { bg: '#f8fafc', border: '#e2e8f0', accent: '#334155' },
    amber: { bg: '#fffbeb', border: '#fde68a', accent: '#92400e' },
  }[tone]
  return (
    <div title={alt} style={{ background: tones.bg, border: `1px solid ${tones.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: tones.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  )
}
