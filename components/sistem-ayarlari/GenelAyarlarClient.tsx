'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import VardiyaAyarlariPanel from './VardiyaAyarlariPanel'

const T = {
  green: '#111827', border: '#e2e8f0', text: '#0f172a', textSoft: '#64748b', grayLight: '#f8fafc',
  blue: '#1d4ed8', purple: '#7c3aed',
}

interface Props { isSA: boolean; firmaId?: string | null; projeId?: string | null; kullanicilar?: { id: string; isim_soyisim: string }[] }

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

type AllKey = string
type AllValues = Record<string, number | boolean | null>

const NUM_DEFAULTS: Record<string, number> = {
  gorev_suresi_hedef_orani: 10,
  ardisik_baslatma_suresi_dk: 0,
  personel_takip_bildirim_dk: 0,
  acik_bekleme_saat: 8, bekleme_gecmis_saat: 12, canli_akis_sure_saat: 8,
  arsiv_mesai_saat: 24, arsiv_musteri_saat: 24, arsiv_spesifik_saat: 48, arsiv_frekansiyel_saat: 24,
}
const NULLABLE_DEFAULTS: Record<string, null> = {
  haftalik_acik_bekleme_saat: null, haftalik_bekleme_gecmis_saat: null,
}
const BOOL_DEFAULTS: Record<string, boolean> = {
  spesifik_ceklist_aktif: true, spesifik_personel_atama_aktif: true, frekansiyel_personel_atama_aktif: true,
  islem_sureleri_aktif: true,
}
const ALL_DEFAULTS: AllValues = { ...NUM_DEFAULTS, ...BOOL_DEFAULTS, ...NULLABLE_DEFAULTS }

/** Üst lokasyon bazlı bildirim alıcıları bileşeni */
function LokasyonBazliBildirimAlicilar({ firmaId, projeId, kullanicilar }: { firmaId: string; projeId?: string | null; kullanicilar: { id: string; isim_soyisim: string }[] }) {
  const { toast } = useToast()
  const [ustLoklar, setUstLoklar] = useState<{ id: string; tanim: string }[]>([])
  const [aliciMap, setAliciMap] = useState<Record<string, string[]>>({}) // ust_lok_id → [user_id]
  const [savingLok, setSavingLok] = useState<string | null>(null)

  // Üst lokasyonlar + mevcut eşleştirmeler
  useEffect(() => {
    if (!firmaId) return
    const q = new URLSearchParams({ firmaId })
    if (projeId) q.set('projeId', projeId)

    Promise.all([
      fetch(`/api/lokasyonlar-list?${q}`).then(r => r.json()),
      fetch(`/api/sistem-ayarlari/personel-takip-alicilar?${q}`).then(r => r.json()),
    ]).then(([loks, alicilar]) => {
      const lokList = (Array.isArray(loks) ? loks : (loks.lokasyonlar ?? loks.data ?? [])).filter((l: any) => !l.parent_id)
      setUstLoklar(lokList)
      const map: Record<string, string[]> = {}
      for (const a of (Array.isArray(alicilar) ? alicilar : [])) {
        if (!map[a.ust_lokasyon_id]) map[a.ust_lokasyon_id] = []
        map[a.ust_lokasyon_id].push(a.alici_user_id)
      }
      setAliciMap(map)
    }).catch(() => {})
  }, [firmaId, projeId])

  const saveAlicilar = async (lokId: string) => {
    setSavingLok(lokId)
    try {
      const res = await fetch('/api/sistem-ayarlari/personel-takip-alicilar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId, projeId, ust_lokasyon_id: lokId, alici_user_ids: aliciMap[lokId] ?? [] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ type: 'success', title: 'Kaydedildi', message: 'Bildirim alıcıları güncellendi.' })
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
    setSavingLok(null)
  }

  if (!ustLoklar.length) return null

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>3. Bildirim Alıcıları (Üst Lokasyon Bazlı)</div>
      <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 10 }}>
        Her üst lokasyonun personeli için 3. hatırlatmada bildirim alacak kişiyi belirleyin. TA otomatik alır.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ustLoklar.map(lok => {
          const seciliIds = aliciMap[lok.id] ?? []
          return (
            <div key={lok.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: T.grayLight, borderRadius: 8, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, minWidth: 120 }}>{lok.tanim}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                {/* Seçili alıcılar chip */}
                {seciliIds.map(uid => {
                  const u = kullanicilar.find(k => k.id === uid)
                  return (
                    <span key={uid} style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, background: '#dcfce7', color: T.green, border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {u?.isim_soyisim ?? uid.slice(0, 8)}
                      <button onClick={() => setAliciMap(prev => ({ ...prev, [lok.id]: (prev[lok.id] ?? []).filter(x => x !== uid) }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.green, padding: 0 }}>×</button>
                    </span>
                  )
                })}
                {/* Ekle dropdown */}
                <select value="" onChange={e => {
                  const val = e.target.value
                  if (val && !seciliIds.includes(val)) setAliciMap(prev => ({ ...prev, [lok.id]: [...(prev[lok.id] ?? []), val] }))
                }} style={{ height: 28, padding: '0 6px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, minWidth: 140 }}>
                  <option value="">Ekle...</option>
                  {kullanicilar.filter(u => !seciliIds.includes(u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.isim_soyisim}</option>
                  ))}
                </select>
              </div>
              <button onClick={() => saveAlicilar(lok.id)} disabled={savingLok === lok.id}
                style={{ height: 28, padding: '0 12px', borderRadius: 6, background: T.green, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingLok === lok.id ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {savingLok === lok.id ? '...' : 'Kaydet'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function GenelAyarlarClient({ isSA, firmaId: propFirmaId, projeId, kullanicilar = [] }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (propFirmaId ?? '')

  const [firmaDefaults, setFirmaDefaults] = useState<AllValues>({ ...ALL_DEFAULTS })
  const [efektif, setEfektif]             = useState<AllValues>({ ...ALL_DEFAULTS })
  const [overrides, setOverrides]         = useState<Record<string, boolean>>({})
  const [loading, setLoading]             = useState(false)
  const [savingKey, setSavingKey]         = useState<string | null>(null)

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
        const ov: Record<string, boolean> = {}
        for (const k of Object.keys(ALL_DEFAULTS)) ov[k] = json.proje != null && json.proje[k] != null
        setOverrides(ov)
      }
    } catch {}
    setLoading(false)
  }, [currentFirmaId, projeId])

  useEffect(() => { fetchAyarlar() }, [fetchAyarlar])

  const handleSave = async (key: AllKey, value: number | boolean | null) => {
    if (!currentFirmaId) return
    setSavingKey(key)
    try {
      const hedef = projeId ? 'proje' : 'firma'
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
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
    setSavingKey(null)
  }

  const handleReset = async (key: AllKey) => {
    if (!currentFirmaId || !projeId) return
    setSavingKey(`${key}_reset`)
    try {
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
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
    setSavingKey(null)
  }

  if (loading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor...</div>
  }

  const SaveBtn = ({ onClick, id }: { onClick: () => void; id: string }) => {
    const busy = savingKey === id
    return (
      <button onClick={onClick} disabled={savingKey != null}
        style={{ height: 34, padding: '0 16px', borderRadius: 8, background: T.green, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: savingKey != null ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
        {busy ? '...' : 'Kaydet'}
      </button>
    )
  }

  function OverrideBadge({ ayarKey }: { ayarKey: string }) {
    if (!projeId || !overrides[ayarKey]) return null
    const fVal = firmaDefaults[ayarKey]
    const label = typeof fVal === 'boolean' ? (fVal ? 'Aktif' : 'Pasif') : (ayarKey === 'gorev_suresi_hedef_orani' ? `±%${fVal}` : saatLabel(fVal as number))
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: T.purple, fontWeight: 600 }}>Proje özel ayarı aktif (Firma varsayılanı: {label})</span>
        <button onClick={() => handleReset(ayarKey)} disabled={savingKey != null}
          style={{ fontSize: 11.5, color: T.textSoft, background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 10px', cursor: savingKey != null ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
          Varsayılana Dön
        </button>
      </div>
    )
  }

  // ── Toggle Kart ────────────────────────────────────────────────────────
  function ToggleKart({ ayarKey, label, desc }: { ayarKey: string; label: string; desc: string }) {
    const val = efektif[ayarKey] as boolean
    return (
      <div style={{ background: '#fff', border: `1px solid ${overrides[ayarKey] ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5 }}>{desc}</div>
          </div>
          <button
            onClick={() => handleSave(ayarKey, !val)}
            disabled={savingKey != null}
            style={{
              width: 52, height: 28, borderRadius: 14, border: 'none', cursor: savingKey != null ? 'not-allowed' : 'pointer',
              background: val ? T.green : '#cbd5e1', position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: '#fff', position: 'absolute', top: 3,
              left: val ? 27 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </button>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: val ? T.green : T.textSoft }}>
          {val ? 'Aktif' : 'Pasif'}
        </div>
        <OverrideBadge ayarKey={ayarKey} />
      </div>
    )
  }

  // ── Saat Ayar Kart ─────────────────────────────────────────────────────
  function AyarSaatKart({ ayarKey, label, desc }: { ayarKey: string; label: string; desc: string }) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${overrides[ayarKey] ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>{label}</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>{desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <input type="number" min={1} max={720} value={efektif[ayarKey] as number}
              onChange={e => setEfektif(prev => ({ ...prev, [ayarKey]: Math.max(1, Math.min(720, Number(e.target.value) || 1)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>saat</span>
          </div>
          <SaveBtn id={ayarKey} onClick={() => handleSave(ayarKey, efektif[ayarKey] as number)} />
          <span style={{ fontSize: 12, color: T.textSoft }}>= {saatLabel(efektif[ayarKey] as number)}</span>
        </div>
        <OverrideBadge ayarKey={ayarKey} />
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>

      {/* ═══ GÖREVLER ═══ */}
      <SectionHead title="Görevler" color={T.green} />

      {/* Hedef Tolerans */}
      <div style={{ background: '#fff', border: `1px solid ${overrides.gorev_suresi_hedef_orani ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Görev Süresi Hedef Tolerans Oranı</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Görev tamamlanma süresinin, hedef süreye göre kabul edilebilir sapma yüzdesi. ±%X aralığı dışındakiler sapma olarak değerlendirilir.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>±</span>
            <input type="number" min={0} max={100} value={efektif.gorev_suresi_hedef_orani as number}
              onChange={e => setEfektif(prev => ({ ...prev, gorev_suresi_hedef_orani: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>%</span>
          </div>
          <SaveBtn id="gorev_suresi_hedef_orani" onClick={() => handleSave('gorev_suresi_hedef_orani', efektif.gorev_suresi_hedef_orani)} />
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
          <strong>Örnek:</strong> Hedef 60 dk, tolerans ±%{efektif.gorev_suresi_hedef_orani as number} →{' '}
          <span style={{ color: T.green, fontWeight: 700 }}>{Math.round(60 * (1 - (efektif.gorev_suresi_hedef_orani as number) / 100))} – {Math.round(60 * (1 + (efektif.gorev_suresi_hedef_orani as number) / 100))} dk</span> aralığı uygun.
        </div>
        <OverrideBadge ayarKey="gorev_suresi_hedef_orani" />
      </div>

      {/* Ardışık Başlatma Süresi */}
      <div style={{ background: '#fff', border: `1px solid ${overrides.ardisik_baslatma_suresi_dk ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Ardışık Başlatma Süresi</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Görevlerin ard arda başlatılmasını engeller. Son görevin tamamlanmasının ardından yeni bir görev başlatılabilmesi için buradaki süre kadar beklenmesi gerekir.
            0 girilirse kontrol devre dışı kalır.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <input type="number" min={0} max={1440} value={efektif.ardisik_baslatma_suresi_dk as number}
              onChange={e => setEfektif(prev => ({ ...prev, ardisik_baslatma_suresi_dk: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>dk</span>
          </div>
          <SaveBtn id="ardisik_baslatma_suresi_dk" onClick={() => handleSave('ardisik_baslatma_suresi_dk', efektif.ardisik_baslatma_suresi_dk)} />
        </div>
        {(efektif.ardisik_baslatma_suresi_dk as number) > 0 && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
            Kullanıcı bir görevi tamamladıktan sonra <strong style={{ color: T.green }}>{efektif.ardisik_baslatma_suresi_dk as number} dakika</strong> boyunca yeni görev başlatamaz.
            Erken denerse "<em>Henüz yeni görev süreniz başlamadı! Kalan süre: X dakika</em>" uyarısı alır.
          </div>
        )}
        <OverrideBadge ayarKey="ardisik_baslatma_suresi_dk" />
      </div>

      {/* Canlı Akış Listeleme Süresi */}
      <div style={{ background: '#fff', border: `1px solid ${overrides.canli_akis_sure_saat ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Canlı Görev Akışı Listeleme Süresi</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Canlı görev akışı sayfasında gösterilecek görevlerin zaman aralığı. Seçilen süreden önceki görevler listelenmez.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            value={efektif.canli_akis_sure_saat as number}
            onChange={e => setEfektif(prev => ({ ...prev, canli_akis_sure_saat: Number(e.target.value) }))}
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', fontSize: 15, fontWeight: 700, width: 200 }}
          >
            <option value={1}>Son 1 saat</option>
            <option value={4}>Son 4 saat</option>
            <option value={8}>Son 8 saat</option>
            <option value={24}>Son 24 saat</option>
            <option value={-1}>Bugün (TR günü 00:00→şimdi)</option>
          </select>
          <SaveBtn id="canli_akis_sure_saat" onClick={() => handleSave('canli_akis_sure_saat', efektif.canli_akis_sure_saat)} />
        </div>
        <OverrideBadge ayarKey="canli_akis_sure_saat" />
      </div>

      {/* Vardiya Tanımları */}
      <VardiyaAyarlariPanel firmaId={currentFirmaId} />

      {/* Personel Takip Bildirim Süresi */}
      <div style={{ background: '#fff', border: `1px solid ${overrides.personel_takip_bildirim_dk ? '#c4b5fd' : T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Personel Takip Bildirim Süresi</label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Personel iş başı yaptıktan (QR/NFC ile mesai girişi) sonra belirtilen süre içinde görev başlatmazsa bildirim gönderilir.
            Her aralıkta tekrar bildirim gider. 3. bildirimde yöneticiye (TA) "personel işte ama görev yapmıyor" bildirimi gönderilir.
            0 girilirse bildirim gönderilmez.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200 }}>
            <input type="number" min={0} max={1440} value={efektif.personel_takip_bildirim_dk as number}
              onChange={e => setEfektif(prev => ({ ...prev, personel_takip_bildirim_dk: Math.max(0, Math.min(1440, Number(e.target.value) || 0)) }))}
              style={inpStyle} />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600, whiteSpace: 'nowrap' }}>dk</span>
          </div>
          <SaveBtn id="personel_takip_bildirim_dk" onClick={() => handleSave('personel_takip_bildirim_dk', efektif.personel_takip_bildirim_dk)} />
        </div>
        {(efektif.personel_takip_bildirim_dk as number) > 0 && (
          <>
            <div style={{ marginTop: 10, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
              İş başı yaptıktan <strong style={{ color: T.green }}>{efektif.personel_takip_bildirim_dk as number} dk</strong> sonra görev başlatılmamışsa 1. hatırlatma,
              <strong style={{ color: T.green }}> {(efektif.personel_takip_bildirim_dk as number) * 2} dk</strong> sonra 2. hatırlatma,
              <strong style={{ color: T.green }}> {(efektif.personel_takip_bildirim_dk as number) * 3} dk</strong> sonra 3. hatırlatma + aşağıdaki alıcılara bildirim gönderilir.
            </div>

            {/* Üst lokasyon bazlı bildirim alıcıları */}
            <LokasyonBazliBildirimAlicilar firmaId={currentFirmaId} projeId={projeId} kullanicilar={kullanicilar} />
          </>
        )}
        <OverrideBadge ayarKey="personel_takip_bildirim_dk" />
      </div>

      {/* Bilgi notu: Spesifik/Frekansiyel görev ayarları Proje Ayarları sekmesine taşındı */}
      <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
        <strong>ℹ️ Bilgi:</strong> Spesifik görev (çeklist + personel atama) ve frekansiyel görev (personel atama) ayarları <strong>Proje Ayarları</strong> sekmesine taşındı. Artık her proje için ayrı ayrı yönetilir.
      </div>

      {/* Durum Geçiş Süreleri */}
      <div style={{ fontSize: 13, fontWeight: 700, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Durum Geçiş Süreleri</div>
      <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.6, marginBottom: 16 }}>
          Frekansiyel görevlerin otomatik durum geçiş süreleri. Görev aktif olduktan sonra belirtilen süreler sonunda durum otomatik değişir.
        </div>

        {/* Günlük görevler */}
        <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 10 }}>Günlük Görevler</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: T.grayLight, borderRadius: 8, padding: '14px 16px' }}>
            <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Açık → Beklemede</label>
            <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 10 }}>Görev aktif olduktan kaç saat sonra BEKLEMEDE durumuna geçsin?</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min={1} max={48} value={efektif.acik_bekleme_saat as number}
                onChange={e => setEfektif(prev => ({ ...prev, acik_bekleme_saat: Math.max(1, Math.min(48, Number(e.target.value) || 8)) }))}
                style={{ ...inpStyle, width: 80 }} />
              <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>saat</span>
              <SaveBtn id="acik_bekleme_saat" onClick={() => handleSave('acik_bekleme_saat', efektif.acik_bekleme_saat)} />
            </div>
            <OverrideBadge ayarKey="acik_bekleme_saat" />
          </div>
          <div style={{ background: T.grayLight, borderRadius: 8, padding: '14px 16px' }}>
            <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Beklemede → Zamanı Geçmiş</label>
            <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 10 }}>BEKLEMEDE'ye geçtikten kaç saat sonra ZAMANI GEÇMİŞ olsun?</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min={1} max={48} value={efektif.bekleme_gecmis_saat as number}
                onChange={e => setEfektif(prev => ({ ...prev, bekleme_gecmis_saat: Math.max(1, Math.min(48, Number(e.target.value) || 12)) }))}
                style={{ ...inpStyle, width: 80 }} />
              <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>saat</span>
              <SaveBtn id="bekleme_gecmis_saat" onClick={() => handleSave('bekleme_gecmis_saat', efektif.bekleme_gecmis_saat)} />
            </div>
            <OverrideBadge ayarKey="bekleme_gecmis_saat" />
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, fontSize: 12.5, color: '#1e40af', lineHeight: 1.6 }}>
          <strong>Toplam ömür (günlük):</strong> Bir görev aktif olduktan sonra en fazla <strong>{(efektif.acik_bekleme_saat as number) + (efektif.bekleme_gecmis_saat as number)} saat</strong> ({saatLabel((efektif.acik_bekleme_saat as number) + (efektif.bekleme_gecmis_saat as number))}) içinde ZAMANI GEÇMİŞ durumuna geçer.
        </div>

        {/* Haftalık görevler */}
        <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6', marginTop: 22, marginBottom: 10 }}>Haftalık Görevler</div>
        <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.6, marginBottom: 12 }}>
          Haftalık frekansla üretilen görevlerin durum geçiş süreleri. Boş bırakılırsa günlük görev süreleri kullanılır.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {(['haftalik_acik_bekleme_saat', 'haftalik_bekleme_gecmis_saat'] as const).map(key => {
            const isAcik = key === 'haftalik_acik_bekleme_saat'
            const val = efektif[key] as number | null
            const fallback = (isAcik ? efektif.acik_bekleme_saat : efektif.bekleme_gecmis_saat) as number
            return (
              <div key={key} style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '14px 16px' }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>
                  {isAcik ? 'Açık → Beklemede' : 'Beklemede → Zamanı Geçmiş'}
                </label>
                <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 10 }}>
                  {isAcik
                    ? 'Haftalık görev aktif olduktan kaç saat sonra BEKLEMEDE olsun?'
                    : 'BEKLEMEDE\'ye geçtikten kaç saat sonra ZAMANI GEÇMİŞ olsun?'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={1} max={240}
                    value={val ?? ''}
                    placeholder={`${fallback} (günlük)`}
                    onChange={e => {
                      const s = e.target.value.trim()
                      setEfektif(prev => ({ ...prev, [key]: s === '' ? null : Math.max(1, Math.min(240, Number(s))) }))
                    }}
                    style={{ ...inpStyle, width: 100 }} />
                  <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>saat</span>
                  <SaveBtn id={key} onClick={() => handleSave(key, val)} />
                  {val != null && (
                    <button
                      type="button"
                      onClick={() => { setEfektif(prev => ({ ...prev, [key]: null })); handleSave(key, null) }}
                      style={{ fontSize: 12, padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer' }}
                    >Temizle</button>
                  )}
                </div>
                <div style={{ marginTop: 6, fontSize: 11.5, color: '#7c3aed', fontWeight: 600 }}>
                  {val != null ? `Özel değer: ${val} saat` : `Günlük değer kullanılıyor (${fallback} saat)`}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f5f3ff', borderRadius: 8, fontSize: 12.5, color: '#6d28d9', lineHeight: 1.6 }}>
          <strong>Toplam ömür (haftalık):</strong> <strong>{
            ((efektif.haftalik_acik_bekleme_saat ?? efektif.acik_bekleme_saat) as number) +
            ((efektif.haftalik_bekleme_gecmis_saat ?? efektif.bekleme_gecmis_saat) as number)
          } saat</strong> ({saatLabel(
            ((efektif.haftalik_acik_bekleme_saat ?? efektif.acik_bekleme_saat) as number) +
            ((efektif.haftalik_bekleme_gecmis_saat ?? efektif.bekleme_gecmis_saat) as number)
          )}) içinde ZAMANI GEÇMİŞ durumuna geçer.
        </div>
      </div>

      {/* ═══ ARŞİV ═══ */}
      <SectionHead title="Arşiv" color={T.blue} />

      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12.5, color: '#1e40af', lineHeight: 1.6 }}>
        Verilerin ana tablodan arşiv tablosuna taşınma süresi. Arşivleme her 6 saatte bir otomatik çalışır, arşivlenen veriler raporlarda görünmeye devam eder.
      </div>

      <AyarSaatKart ayarKey="arsiv_frekansiyel_saat" label="Frekansiyel Görev Arşiv Süresi"
        desc="Terminal duruma geçen frekansiyel görevlerin kaç saat sonra arşive taşınacağını belirler." />
      <AyarSaatKart ayarKey="arsiv_spesifik_saat" label="Spesifik Görev Arşiv Süresi"
        desc="Spesifik görevlerin oluşturulduktan kaç saat sonra arşive taşınacağını belirler. Çeklist sonuçları birlikte taşınır." />
      <AyarSaatKart ayarKey="arsiv_mesai_saat" label="Personel Mesai Arşiv Süresi"
        desc="Personel giriş/çıkış kayıtlarının kaç saat sonra arşive taşınacağını belirler." />
      <AyarSaatKart ayarKey="arsiv_musteri_saat" label="Müşteri Değerlendirme Arşiv Süresi"
        desc="Müşteri memnuniyet değerlendirmelerinin kaç saat sonra arşive taşınacağını belirler." />

      {/* Arşiv Temizleme */}
      <ArsivTemizlemePanel firmaId={currentFirmaId} />
    </div>
  )
}

/** Arşiv temizleme paneli — girilen tarihten eski arşiv kayıtlarını kalıcı siler */
function ArsivTemizlemePanel({ firmaId }: { firmaId: string | null }) {
  const [tarih, setTarih] = useState('')
  const [onay, setOnay] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sonuc, setSonuc] = useState<string | null>(null)
  const { toast } = useToast()

  const temizle = async () => {
    if (!firmaId || !tarih || !onay) return
    setLoading(true); setSonuc(null)
    try {
      const res = await fetch('/api/tasks/arsiv-temizle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId, tarihOncesi: tarih }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Hata')
      setSonuc(`${j.silinen ?? 0} arşiv kaydı kalıcı olarak silindi.`)
      toast({ type: 'success', title: 'Temizlendi', message: `${j.silinen ?? 0} kayıt silindi.` })
      setOnay(false)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setLoading(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 10, padding: '18px 20px', marginTop: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 700, color: '#991b1b', display: 'block', marginBottom: 4 }}>Arşiv Temizleme (Kalıcı Silme)</label>
        <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
          Girilen tarihten önceki tüm arşiv kayıtları <strong style={{ color: '#dc2626' }}>kalıcı olarak silinir</strong>. Bu işlem geri alınamaz.
          Frekansiyel görev arşivi, spesifik görev arşivi, mesai arşivi ve müşteri değerlendirme arşivi temizlenir.
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Bu tarihten öncesini sil:</div>
          <input type="date" value={tarih} onChange={e => { setTarih(e.target.value); setOnay(false); setSonuc(null) }}
            style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 600 }} />
        </div>
        {tarih && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#991b1b', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={onay} onChange={e => setOnay(e.target.checked)} style={{ width: 16, height: 16 }} />
            Bu işlemin geri alınamayacağını onaylıyorum
          </label>
        )}
        {tarih && onay && (
          <button onClick={temizle} disabled={loading}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Siliniyor...' : 'Kalıcı Olarak Sil'}
          </button>
        )}
      </div>
      {sonuc && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534', fontWeight: 600 }}>
          {sonuc}
        </div>
      )}
    </div>
  )
}
