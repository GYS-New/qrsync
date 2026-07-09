'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Check, X, Edit3, Clock, MapPin, User, Hash, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'

type Kayit = {
  gorev_id: string
  plaka: string
  hedef_tarih: string | null
  olusturma_tarihi: string | null
  baslatilma_tarihi: string | null
  tamamlanma_tarihi: string | null
  tamamlanma_suresi_saniye: number | null
  durum: string | null
  personel_id: string | null
  personel_ad: string
  lokasyon_id: string | null
  lokasyon_ad: string
  ust_lokasyon: string | null
  km: number | null
  notlar: string | null
}

type IstasyonOpt = { id: string; tanim: string }

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#059669', greenLight: '#d1fae5',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  purple: '#7c3aed', purpleLight: '#ede9fe',
  slate: '#475569', slateLight: '#f1f5f9',
}

function fmtDT(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  })
}
function fmtSure(sn: number | null): string {
  if (!sn || sn <= 0) return '—'
  const dk = Math.floor(sn / 60), sec = sn % 60
  return dk > 0 ? `${dk} dk ${sec} sn` : `${sec} sn`
}

export default function OnayBekleyenClient({
  firmaId, istasyonlar,
}: {
  firmaId: string
  istasyonlar: IstasyonOpt[]
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [kayitlar, setKayitlar] = useState<Kayit[]>([])
  const [aksiyon, setAksiyon] = useState<string | null>(null)
  const [editKayit, setEditKayit] = useState<Kayit | null>(null)

  async function yukle() {
    setLoading(true)
    try {
      const res = await fetch(`/api/oto-yikama/onay-bekleyen?firma_id=${firmaId}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Veri alınamadı')
      setKayitlar(j.kayitlar ?? [])
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { yukle() /* eslint-disable-next-line */ }, [firmaId])

  async function onayla(k: Kayit) {
    if (k.durum !== 'TAMAMLANDI') {
      toast({ type: 'error', title: 'Onaylanamaz', message: 'Kayıt henüz TAMAMLANDI olmamış' })
      return
    }
    setAksiyon(k.gorev_id)
    try {
      const res = await fetch(`/api/oto-yikama/onay-bekleyen/${k.gorev_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'onayla' }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Onaylanamadı')
      toast({ type: 'success', title: 'Onaylandı', message: `${k.plaka} aracı sisteme eklendi` })
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setAksiyon(null)
    }
  }

  async function reddet(k: Kayit) {
    const ok = await confirm({
      title: 'Reddet',
      message: `${k.plaka} plakalı yıkama kaydı KALICI olarak silinecek. Emin misiniz?`,
      confirmText: 'Reddet ve Sil',
      variant: 'danger',
    })
    if (!ok) return
    setAksiyon(k.gorev_id)
    try {
      const res = await fetch(`/api/oto-yikama/onay-bekleyen/${k.gorev_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reddet' }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Reddedilemedi')
      toast({ type: 'success', title: 'Reddedildi', message: 'Kayıt silindi' })
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setAksiyon(null)
    }
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* HEADER */}
      <div className="verde-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <AlertCircle size={20} color={T.amber} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
            Tanımsız Plaka Onay Kuyruğu
          </div>
          <div style={{ fontSize: 13, color: T.textSoft, marginTop: 2 }}>
            Sistemde kayıtlı olmayan plakalar için yapılan yıkamalar. Onayladığınızda plaka Araç Kayıtları'na eklenir.
          </div>
        </div>
        <button onClick={yukle} disabled={loading}
          style={{
            padding: '7px 14px', fontSize: 13, fontWeight: 700,
            background: '#fff', border: `1px solid ${T.border}`, borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : undefined }} />
          Yenile
        </button>
      </div>

      {/* LİSTE */}
      {loading && kayitlar.length === 0 ? (
        <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: T.textSoft }}>
          <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 8 }} />
          <div>Onay bekleyen kayıtlar yükleniyor…</div>
        </div>
      ) : kayitlar.length === 0 ? (
        <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: T.textSoft }}>
          <Check size={28} color={T.green} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Onay bekleyen kayıt yok</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Yeni bir tanımsız plaka yıkaması olduğunda burada listelenir.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {kayitlar.map(k => (
            <Kart
              key={k.gorev_id}
              k={k}
              disabled={aksiyon === k.gorev_id}
              onOnayla={() => onayla(k)}
              onReddet={() => reddet(k)}
              onDuzenle={() => setEditKayit(k)}
            />
          ))}
        </div>
      )}

      {/* DÜZENLE MODAL */}
      {editKayit && (
        <DuzenleModal
          kayit={editKayit}
          istasyonlar={istasyonlar}
          onClose={() => setEditKayit(null)}
          onSaved={async () => { setEditKayit(null); await yukle() }}
        />
      )}
    </div>
  )
}

function Kart({ k, disabled, onOnayla, onReddet, onDuzenle }: {
  k: Kayit
  disabled: boolean
  onOnayla: () => void
  onReddet: () => void
  onDuzenle: () => void
}) {
  const bekliyor = k.durum !== 'TAMAMLANDI'
  return (
    <div className="verde-card" style={{ padding: 16, borderTop: `4px solid ${T.amber}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'monospace', fontWeight: 900, fontSize: 22, color: T.text,
            letterSpacing: '0.04em',
          }}>{k.plaka}</span>
          <span style={{
            padding: '2px 8px', borderRadius: 999,
            background: '#cffafe', color: '#0891b2',
            fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
          }}>EKSTRA</span>
        </div>
        <span style={{
          padding: '3px 8px', borderRadius: 6,
          background: bekliyor ? T.blueLight : T.greenLight,
          color: bekliyor ? T.blue : T.green,
          fontSize: 11, fontWeight: 800, letterSpacing: '0.03em',
        }}>
          {k.durum ?? '—'}
        </span>
      </div>

      <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.7 }}>
        <Row ikon={<User size={13} />} etiket="Personel" deger={k.personel_ad} />
        <Row ikon={<MapPin size={13} />} etiket="İstasyon" deger={k.ust_lokasyon ? `${k.ust_lokasyon} > ${k.lokasyon_ad}` : k.lokasyon_ad} />
        <Row ikon={<Clock size={13} />} etiket="Başlatma" deger={fmtDT(k.baslatilma_tarihi)} />
        <Row ikon={<Clock size={13} />} etiket="Tamamlanma" deger={fmtDT(k.tamamlanma_tarihi)} />
        <Row ikon={<Clock size={13} />} etiket="Süre" deger={fmtSure(k.tamamlanma_suresi_saniye)} />
        <Row ikon={<Hash size={13} />} etiket="KM" deger={k.km == null ? '—' : String(k.km)} />
        {k.notlar && (
          <div style={{ marginTop: 6, padding: 8, background: T.slateLight, borderRadius: 6, fontSize: 12.5, color: T.text }}>
            <strong>Not:</strong> {k.notlar}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={onOnayla} disabled={disabled || bekliyor}
          title={bekliyor ? 'Yıkama tamamlanmadan onaylanamaz' : ''}
          style={{
            flex: 1, minWidth: 100, padding: '8px 12px', fontSize: 13, fontWeight: 700,
            background: bekliyor ? '#f1f5f9' : T.green, color: bekliyor ? T.textSoft : '#fff',
            border: 'none', borderRadius: 6, cursor: bekliyor ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: disabled ? 0.6 : 1,
          }}>
          <Check size={14} />
          Onayla
        </button>
        <button onClick={onDuzenle} disabled={disabled}
          style={{
            flex: 1, minWidth: 100, padding: '8px 12px', fontSize: 13, fontWeight: 700,
            background: '#fff', color: T.blue, border: `1px solid ${T.blue}`,
            borderRadius: 6, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: disabled ? 0.6 : 1,
          }}>
          <Edit3 size={14} />
          Düzenle
        </button>
        <button onClick={onReddet} disabled={disabled}
          style={{
            padding: '8px 12px', fontSize: 13, fontWeight: 700,
            background: '#fff', color: T.red, border: `1px solid ${T.red}`,
            borderRadius: 6, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: disabled ? 0.6 : 1,
          }}>
          <X size={14} />
          Reddet
        </button>
      </div>
    </div>
  )
}

function Row({ ikon, etiket, deger }: { ikon: React.ReactNode; etiket: string; deger: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color: T.textSoft, display: 'inline-flex' }}>{ikon}</span>
      <span style={{ color: T.textSoft, minWidth: 84 }}>{etiket}:</span>
      <span style={{ color: T.text, fontWeight: 600 }}>{deger}</span>
    </div>
  )
}

function DuzenleModal({ kayit, istasyonlar, onClose, onSaved }: {
  kayit: Kayit
  istasyonlar: IstasyonOpt[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [plaka, setPlaka] = useState(kayit.plaka)
  const [departman, setDepartman] = useState('')
  const [kullaniciAd, setKullaniciAd] = useState('')
  const [varsayilanLokId, setVarsayilanLokId] = useState<string>('')
  const [km, setKm] = useState<string>(kayit.km == null ? '' : String(kayit.km))
  const [notlar, setNotlar] = useState<string>(kayit.notlar ?? '')
  const [kaydet, setKaydet] = useState(false)

  const bekliyor = kayit.durum !== 'TAMAMLANDI'

  async function submit() {
    if (bekliyor) {
      toast({ type: 'error', title: 'Onaylanamaz', message: 'Yıkama tamamlanmadan onaylanamaz' })
      return
    }
    setKaydet(true)
    try {
      const body: any = {
        action: 'onayla',
        duzenleme: {
          plaka: plaka.trim() || undefined,
          departman: departman.trim() || null,
          kullanici_adi_soyadi: kullaniciAd.trim() || null,
          varsayilan_lokasyon_id: varsayilanLokId || null,
          km: km.trim() === '' ? null : Number(km),
          notlar: notlar.trim() || null,
        },
      }
      const res = await fetch(`/api/oto-yikama/onay-bekleyen/${kayit.gorev_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Kaydedilemedi')
      toast({ type: 'success', title: 'Onaylandı', message: `${j.plaka ?? plaka} aracı sisteme eklendi` })
      onSaved()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setKaydet(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }} onClick={onClose}>
      <div className="verde-card" style={{ padding: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>
            Düzenle ve Onayla
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textSoft }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 14 }}>
          Onaylandığında bu bilgilerle Araç Kayıtları'na eklenir. Yıkama saati, personel ve süre orijinal kalır.
        </div>

        <Field etiket="Plaka">
          <input value={plaka} onChange={e => setPlaka(e.target.value.toUpperCase())} style={inp} />
        </Field>
        <Field etiket="Departman (opsiyonel)">
          <input value={departman} onChange={e => setDepartman(e.target.value)} style={inp} placeholder="—" />
        </Field>
        <Field etiket="Araç Kullanıcısı (opsiyonel)">
          <input value={kullaniciAd} onChange={e => setKullaniciAd(e.target.value)} style={inp} placeholder="—" />
        </Field>
        <Field etiket="Varsayılan İstasyon (opsiyonel)">
          <select value={varsayilanLokId} onChange={e => setVarsayilanLokId(e.target.value)} style={inp}>
            <option value="">—</option>
            {istasyonlar.map(i => <option key={i.id} value={i.id}>{i.tanim}</option>)}
          </select>
        </Field>
        <Field etiket="KM">
          <input type="number" value={km} onChange={e => setKm(e.target.value)} style={inp} placeholder="—" />
        </Field>
        <Field etiket="Notlar">
          <textarea value={notlar} onChange={e => setNotlar(e.target.value)} rows={3}
            style={{ ...inp, resize: 'vertical' }} placeholder="—" />
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={kaydet}
            style={{ padding: '9px 16px', fontSize: 13, fontWeight: 700, background: '#fff', color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: 6, cursor: 'pointer' }}>
            Vazgeç
          </button>
          <button onClick={submit} disabled={kaydet || bekliyor}
            title={bekliyor ? 'Yıkama tamamlanmadan onaylanamaz' : ''}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: 800,
              background: bekliyor ? '#f1f5f9' : T.green, color: bekliyor ? T.textSoft : '#fff',
              border: 'none', borderRadius: 6, cursor: bekliyor ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <Check size={14} />
            {kaydet ? 'Kaydediliyor…' : 'Kaydet ve Onayla'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {etiket}
      </label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14,
  border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff',
  color: T.text, outline: 'none',
}
