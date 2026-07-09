'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Calendar, Download, Edit3, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import DurumBadgeWithSebep from '@/components/gorev/DurumBadgeWithSebep'

export interface GorevKaydi {
  gorev_id: string
  plaka: string
  hedef_tarih: string | null
  ekstra: boolean
  durum: string | null
  onay_durumu?: string
  lokasyon_id: string | null
  istasyon: string
  departman: string | null
  /** Plakaya kayıtlı kullanıcı (araç sahibi/kullanıcısı) — araclar.kullanici_adi_soyadi */
  arac_kullanici: string | null
  yikama_gunleri: number[]
  km: number | null
  notlar: string | null
  olusturma_tarihi: string | null
  baslatilma_tarihi: string | null
  tamamlanma_tarihi: string | null
  tamamlanma_suresi_saniye: number | null
  olusturan: string | null
  tamamlayan: string | null
  tamamlayan_id: string | null
  iptal_eden: string | null
  iptal_sebep: string | null
  durum_sebep?: string | null
  durum_degisim_tarihi?: string | null
}

export interface IstasyonOpt {
  id: string
  tanim: string
}
export interface KullaniciOpt {
  id: string
  isim_soyisim: string
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fef2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  gray: '#9ca3af',
  indigo: '#4f46e5', indigoLight: '#eef2ff',
  purple: '#7c3aed', purpleLight: '#f3e8ff',
}

// Türetilmiş durum: ACIK + hedef_tarih > bugün → HAZIR
// ONAY_BEKLIYOR: metadata.onay_durumu === 'ONAY_BEKLIYOR' ise gerçek durumu
// TAMAMLANDI/ISLEMDE olsa da UI'da 'ONAY_BEKLIYOR' göster.
type GoruntuDurum = 'HAZIR' | 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL' | 'YAPILAMADI' | 'ONAY_BEKLIYOR' | 'DIGER'
// EKSTRA_TANIMSIZ pill/filter = tanimsiz plaka akisi (onay bekliyor + onaylanmis)
// EKSTRA pill/filter = kayitli plaka manuel plansiz yikama (ekstra=true & onay_durumu='ONAYSIZ')
type DurumFilter = 'TUMU' | GoruntuDurum | 'EKSTRA' | 'EKSTRA_TANIMSIZ'

function isEkstraTanimsizKayit(k: GorevKaydi): boolean {
  return k.onay_durumu === 'ONAY_BEKLIYOR' || k.onay_durumu === 'ONAYLANDI'
}

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

function turetilenDurum(k: GorevKaydi, bugun: string): GoruntuDurum {
  // Onay bekleyen kayıtlar — gerçek gorev.durum'dan bağımsız 'ONAY_BEKLIYOR'
  if (k.onay_durumu === 'ONAY_BEKLIYOR' || k.durum === 'ONAY_BEKLIYOR') return 'ONAY_BEKLIYOR'
  const d = k.durum ?? ''
  if (d === 'HAZIR') return 'HAZIR'
  if (d === 'YAPILAMADI') return 'YAPILAMADI'
  if (d === 'ACIK') {
    // Backward-compat: cron çalışmadıysa veya eski kayıtlar için
    return k.hedef_tarih && k.hedef_tarih > bugun ? 'HAZIR' : 'ACIK'
  }
  if (d === 'ISLEMDE')    return 'ISLEMDE'
  if (d === 'TAMAMLANDI') return 'TAMAMLANDI'
  if (['IPTAL', 'SILINDI', 'KAPATILDI'].includes(d)) return 'IPTAL'
  return 'DIGER'
}

const DURUM_BG: Record<GoruntuDurum, string> = {
  HAZIR: '#f1f5f9', ACIK: T.amberLight, ISLEMDE: T.blueLight,
  TAMAMLANDI: T.greenLight, IPTAL: T.redLight,
  YAPILAMADI: '#fee2e2', ONAY_BEKLIYOR: '#cffafe', DIGER: '#f1f5f9',
}
const DURUM_FG: Record<GoruntuDurum, string> = {
  HAZIR: '#475569', ACIK: T.amber, ISLEMDE: T.blue,
  TAMAMLANDI: T.green, IPTAL: T.red,
  YAPILAMADI: '#991b1b', ONAY_BEKLIYOR: '#0891b2', DIGER: T.textSoft,
}
const DURUM_LABEL: Record<GoruntuDurum, string> = {
  HAZIR: 'Hazır', ACIK: 'Açık', ISLEMDE: 'İşlemde',
  TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal',
  YAPILAMADI: 'Yapılamadı', ONAY_BEKLIYOR: 'Onay Bekliyor', DIGER: '—',
}

function fmtTarih(d: string | null): string {
  if (!d) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4)
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(d))
}
const GUN_UZUN_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
function gunAdi(d: string | null): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  // 'YYYY-MM-DD' lokal Date (UTC interpret) — TR günü için noon ekleyip TZ etkisini kaldırıyoruz
  const dt = new Date(d + 'T12:00:00')
  return GUN_UZUN_TR[dt.getDay()] ?? null
}
function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(d))
}
function fmtSure(saniye: number | null): string {
  if (saniye == null || saniye <= 0) return '—'
  const h = Math.floor(saniye / 3600)
  const m = Math.floor((saniye % 3600) / 60)
  const s = saniye % 60
  if (h > 0) return `${h} sa ${m} dk`
  return `${m} dk ${s} sn`
}

interface Props {
  firmaId: string
  kayitlar: GorevKaydi[]
  istasyonlar: IstasyonOpt[]
  tamamlayanlar: KullaniciOpt[]
  canEdit: boolean
}

export default function GorevKayitlariClient({ firmaId, kayitlar, istasyonlar, tamamlayanlar, canEdit }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const bugun = bugunTRDate()

  const [arama, setArama] = useState('')
  const [filtre, setFiltre] = useState<DurumFilter>('TUMU')
  // Hedef tarih aralığı
  const [hedefBas, setHedefBas] = useState('')
  const [hedefBit, setHedefBit] = useState('')
  // Tamamlanma tarihi aralığı
  const [tamamBas, setTamamBas] = useState('')
  const [tamamBit, setTamamBit] = useState('')
  // İstasyon filtresi (lokasyon_id)
  const [istasyonId, setIstasyonId] = useState('')
  // Tamamlayan filtresi (user_id)
  const [tamamlayanId, setTamamlayanId] = useState('')
  // Departman filtresi
  const [departmanFilter, setDepartmanFilter] = useState('')
  // Yıkama günü filtresi (1=Pzt..7=Paz, 0=günsüz, '' = tümü)
  const [yikamaGunuFilter, setYikamaGunuFilter] = useState<string>('')
  // Düzenleme modal state'i
  const [editKaydi, setEditKaydi] = useState<GorevKaydi | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [silLoading, setSilLoading] = useState<string | null>(null)

  // Tüm kayıtlara türetilmiş durum eklenmiş hâli
  const kayitlarTuretilmis = useMemo(() => {
    return kayitlar.map(k => ({ k, gd: turetilenDurum(k, bugun) }))
  }, [kayitlar, bugun])

  // KPI sayıları
  const sayilar = useMemo(() => {
    let hazir = 0, acik = 0, islemde = 0, tamam = 0, iptal = 0, yapilamadi = 0
    let plansiz = 0, ekstraTanimsiz = 0, onayBekleyen = 0
    for (const { k, gd } of kayitlarTuretilmis) {
      if (gd === 'HAZIR')         hazir++
      if (gd === 'ACIK')          acik++
      if (gd === 'ISLEMDE')       islemde++
      if (gd === 'TAMAMLANDI')    tamam++
      if (gd === 'IPTAL')         iptal++
      if (gd === 'YAPILAMADI')    yapilamadi++
      if (gd === 'ONAY_BEKLIYOR') onayBekleyen++
      // Kategori sayimlari (durumdan bagimsiz):
      // • Ekstra (tanimsiz plaka) = onay bekleyen + onaylanmis
      // • Plansiz = kayitli plaka manuel yikama (ekstra=true & tanimsiz degil)
      if (isEkstraTanimsizKayit(k)) ekstraTanimsiz++
      else if (k.ekstra)            plansiz++
    }
    return {
      toplam: kayitlar.length,
      hazir, acik, islemde, tamam, iptal, yapilamadi,
      onayBekleyen,
      ekstra: plansiz,           // 'ekstra' alan adi geriye uyum icin (Plansiz pill)
      ekstraTanimsiz,            // yeni: tanimsiz plaka akisindaki tumu
    }
  }, [kayitlarTuretilmis, kayitlar.length])

  // Filtre dropdown'ları için unique departman listesi (kayıtlardan toplanır)
  const departmanlar = useMemo(() => {
    const s = new Set<string>()
    for (const k of kayitlar) if (k.departman) s.add(k.departman)
    return [...s].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [kayitlar])

  const filtrelenmis = useMemo(() => {
    const ara = arama.trim().toUpperCase()
    const ygFiltre = yikamaGunuFilter === '' ? null : Number(yikamaGunuFilter)

    return kayitlarTuretilmis.filter(({ k, gd }) => {
      // 'EKSTRA' pill = Plansiz (kayitli plaka manuel), tanimsiz haric
      if (filtre === 'EKSTRA' && (!k.ekstra || isEkstraTanimsizKayit(k))) return false
      // 'EKSTRA_TANIMSIZ' pill = tanimsiz plaka akisi (onay bekliyor + onaylanmis)
      if (filtre === 'EKSTRA_TANIMSIZ' && !isEkstraTanimsizKayit(k)) return false
      if (filtre !== 'TUMU' && filtre !== 'EKSTRA' && filtre !== 'EKSTRA_TANIMSIZ' && filtre !== gd) return false
      if (istasyonId && k.lokasyon_id !== istasyonId) return false
      if (tamamlayanId && k.tamamlayan_id !== tamamlayanId) return false
      if (departmanFilter && k.departman !== departmanFilter) return false
      if (ygFiltre !== null) {
        const yg = k.yikama_gunleri ?? []
        if (ygFiltre === 0) {
          // 0 = "günsüz"
          if (yg.length > 0) return false
        } else {
          if (!yg.includes(ygFiltre)) return false
        }
      }
      if (hedefBas && (!k.hedef_tarih || k.hedef_tarih < hedefBas)) return false
      if (hedefBit && (!k.hedef_tarih || k.hedef_tarih > hedefBit)) return false
      if (tamamBas || tamamBit) {
        if (!k.tamamlanma_tarihi) return false
        const t = k.tamamlanma_tarihi.slice(0, 10)
        if (tamamBas && t < tamamBas) return false
        if (tamamBit && t > tamamBit) return false
      }
      if (ara) {
        const hay = `${k.plaka ?? ''} ${k.istasyon ?? ''} ${k.departman ?? ''} ${k.olusturan ?? ''} ${k.tamamlayan ?? ''}`.toUpperCase()
        if (!hay.includes(ara)) return false
      }
      return true
    }).map(({ k }) => k)
  }, [kayitlarTuretilmis, arama, filtre, istasyonId, tamamlayanId, departmanFilter, yikamaGunuFilter, hedefBas, hedefBit, tamamBas, tamamBit])

  const filtreAktif = filtre !== 'TUMU' || !!arama || !!istasyonId || !!tamamlayanId || !!departmanFilter || yikamaGunuFilter !== '' || !!hedefBas || !!hedefBit || !!tamamBas || !!tamamBit

  function temizleFiltre() {
    setFiltre('TUMU'); setArama(''); setIstasyonId(''); setTamamlayanId('')
    setDepartmanFilter(''); setYikamaGunuFilter('')
    setHedefBas(''); setHedefBit(''); setTamamBas(''); setTamamBit('')
  }

  function exportCsv() {
    const headers = ['Plaka', 'İstasyon', 'Yıkama Günü', 'Durum', 'Ekstra', 'Oluşturma', 'Başlatma', 'Tamamlanma', 'Süre (sn)', 'KM', 'Oluşturan', 'İşlem Yapan', 'Açıklama / Sebep']
    const rows = filtrelenmis.map(k => {
      const gd = turetilenDurum(k, bugun)
      const islemYapan =
        gd === 'TAMAMLANDI' ? (k.tamamlayan ?? '')
        : gd === 'ISLEMDE' ? (k.tamamlayan ?? '')
        : gd === 'ONAY_BEKLIYOR' ? (k.tamamlayan ?? '')
        : gd === 'IPTAL' ? (k.iptal_eden ?? 'Sistem (otomatik)')
        : gd === 'YAPILAMADI' ? 'Sistem (süre aşımı)'
        : ''
      const aciklama = gd === 'IPTAL' && k.iptal_sebep ? k.iptal_sebep : (k.notlar ?? '')
      return [
        k.plaka, k.istasyon, k.hedef_tarih ?? '', DURUM_LABEL[gd],
        k.ekstra ? 'Evet' : 'Hayır',
        k.olusturma_tarihi ?? '', k.baslatilma_tarihi ?? '', k.tamamlanma_tarihi ?? '',
        k.tamamlanma_suresi_saniye ?? '',
        k.km ?? '',
        k.olusturan ?? '', islemYapan,
        aciklama,
      ]
    })
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `oto-yikama-gorev-kayitlari-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function gorevSil(k: GorevKaydi) {
    const ok = await confirm({
      title: '⚠️ Görevi Kalıcı Olarak Sil',
      message: `${k.plaka} — ${fmtTarih(k.hedef_tarih)} tarihli görev kaydı veritabanından KALICI olarak silinecek.\n\nBu işlem GERİ ALINAMAZ. Görev kayıtlarından, raporlardan ve arşivden tamamen kaybolur.\n\nGerçekten silmek istiyor musunuz?`,
      confirmText: 'Evet, Kalıcı Olarak Sil', cancelText: 'Vazgeç', variant: 'danger',
    })
    if (!ok) return
    setSilLoading(k.gorev_id)
    try {
      const res = await fetch(`/api/oto-yikama/gorev-kayitlari/${k.gorev_id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Silinemedi')
      toast({ type: 'success', title: 'Kalıcı olarak silindi', message: k.plaka })
      router.refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setSilLoading(null)
    }
  }

  async function editKaydet(
    yeniHedef: string, yeniLok: string, yeniDurum: string,
    iptalSebep: string, km: string, notlar: string, personelId: string,
  ) {
    if (!editKaydi) return
    const body: Record<string, any> = {}
    if (yeniHedef && yeniHedef !== editKaydi.hedef_tarih) body.hedef_tarih = yeniHedef
    if (yeniLok && yeniLok !== editKaydi.lokasyon_id) body.lokasyon_id = yeniLok
    if (yeniDurum && yeniDurum !== editKaydi.durum) {
      body.durum = yeniDurum
      if (yeniDurum === 'IPTAL') body.iptal_sebep = iptalSebep
      // ACIK'a geri alma hariç personel zorunlu
      if (yeniDurum !== 'ACIK' && personelId) body.personel_id = personelId
    }
    // KM değişti veya TAMAMLANDI'ya yeni geçiş ise gönder
    const kmNum = km.trim() ? Number(km) : null
    if (kmNum != null && Number.isFinite(kmNum) && kmNum > 0 && kmNum !== editKaydi.km) {
      body.km = kmNum
    } else if (yeniDurum === 'TAMAMLANDI' && editKaydi.durum !== 'TAMAMLANDI' && kmNum != null) {
      body.km = kmNum
    }
    // Notlar değiştiyse gönder (boş string de kabul — silme)
    const notlarTrim = notlar.trim()
    if (notlarTrim !== (editKaydi.notlar ?? '')) {
      body.notlar = notlarTrim
    }
    if (Object.keys(body).length === 0) {
      setEditKaydi(null); return
    }
    setEditLoading(true)
    try {
      const res = await fetch(`/api/oto-yikama/gorev-kayitlari/${editKaydi.gorev_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Güncellenemedi')
      toast({ type: 'success', title: 'Güncellendi', message: editKaydi.plaka })
      setEditKaydi(null)
      router.refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div className="verde-card" style={{ overflow: 'hidden' }}>
      {/* ÜST BAR — başlık + KPI filtre pill'leri */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.3px' }}>Görev Kayıtları</div>
          <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>
            Tüm yıkama görevleri: Hazır → Açık → İşlemde → Tamamlandı yaşam döngüsü
          </div>
        </div>
        <KpiPil renk={T.text}      etiket="toplam"     sayi={sayilar.toplam}   active={filtre === 'TUMU'}
                onClick={() => setFiltre('TUMU')} />
        <KpiPil renk={'#475569'}   etiket="hazır"      sayi={sayilar.hazir}    active={filtre === 'HAZIR'}
                onClick={() => setFiltre(filtre === 'HAZIR' ? 'TUMU' : 'HAZIR')} />
        <KpiPil renk={T.amber}     etiket="açık"        sayi={sayilar.acik}     active={filtre === 'ACIK'}
                onClick={() => setFiltre(filtre === 'ACIK' ? 'TUMU' : 'ACIK')} />
        <KpiPil renk={T.blue}      etiket="işlemde"    sayi={sayilar.islemde}  active={filtre === 'ISLEMDE'}
                onClick={() => setFiltre(filtre === 'ISLEMDE' ? 'TUMU' : 'ISLEMDE')} />
        <KpiPil renk={'#0891b2'}   etiket="onay bekleyen" sayi={sayilar.onayBekleyen} active={filtre === 'ONAY_BEKLIYOR'}
                onClick={() => setFiltre(filtre === 'ONAY_BEKLIYOR' ? 'TUMU' : 'ONAY_BEKLIYOR')} />
        <KpiPil renk={'#0891b2'}   etiket="ekstra"     sayi={sayilar.ekstraTanimsiz} active={filtre === 'EKSTRA_TANIMSIZ'}
                onClick={() => setFiltre(filtre === 'EKSTRA_TANIMSIZ' ? 'TUMU' : 'EKSTRA_TANIMSIZ')} />
        <KpiPil renk={T.green}     etiket="tamamlandı" sayi={sayilar.tamam}    active={filtre === 'TAMAMLANDI'}
                onClick={() => setFiltre(filtre === 'TAMAMLANDI' ? 'TUMU' : 'TAMAMLANDI')} />
        <KpiPil renk={T.red}       etiket="iptal"      sayi={sayilar.iptal}    active={filtre === 'IPTAL'}
                onClick={() => setFiltre(filtre === 'IPTAL' ? 'TUMU' : 'IPTAL')} />
        <KpiPil renk={'#991b1b'}   etiket="yapılamadı" sayi={sayilar.yapilamadi} active={filtre === 'YAPILAMADI'}
                onClick={() => setFiltre(filtre === 'YAPILAMADI' ? 'TUMU' : 'YAPILAMADI')} />
        <KpiPil renk={T.purple}    etiket="plansız"    sayi={sayilar.ekstra}   active={filtre === 'EKSTRA'}
                onClick={() => setFiltre(filtre === 'EKSTRA' ? 'TUMU' : 'EKSTRA')} />
      </div>

      {/* FİLTRE PANELİ */}
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <FilterField label="Arama">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 8px' }}>
            <Search size={13} color={T.textSoft} />
            <input value={arama} onChange={e => setArama(e.target.value)}
              placeholder="Plaka, istasyon, kişi…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, minWidth: 0 }} />
            {arama && <X size={12} color={T.textSoft} onClick={() => setArama('')} style={{ cursor: 'pointer' }} />}
          </div>
        </FilterField>
        <FilterField label="İstasyon">
          <select value={istasyonId} onChange={e => setIstasyonId(e.target.value)}
            style={{ width: '100%', padding: '6px 9px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            {istasyonlar.map(i => <option key={i.id} value={i.id}>{i.tanim}</option>)}
          </select>
        </FilterField>
        <FilterField label="İşlem Yapan">
          <select value={tamamlayanId} onChange={e => setTamamlayanId(e.target.value)}
            style={{ width: '100%', padding: '6px 9px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            {tamamlayanlar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
          </select>
        </FilterField>
        <FilterField label="Departman">
          <select value={departmanFilter} onChange={e => setDepartmanFilter(e.target.value)}
            style={{ width: '100%', padding: '6px 9px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            {departmanlar.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </FilterField>
        <FilterField label="Yıkama Günü">
          <select value={yikamaGunuFilter} onChange={e => setYikamaGunuFilter(e.target.value)}
            style={{ width: '100%', padding: '6px 9px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            <option value="1">Pazartesi</option>
            <option value="2">Salı</option>
            <option value="3">Çarşamba</option>
            <option value="4">Perşembe</option>
            <option value="5">Cuma</option>
            <option value="6">Cumartesi</option>
            <option value="7">Pazar</option>
            <option value="0">Plansız</option>
          </select>
        </FilterField>
        <FilterField label="Yıkama Günü">
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="date" value={hedefBas} onChange={e => setHedefBas(e.target.value)}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
            <span style={{ alignSelf: 'center', fontSize: 11, color: T.textSoft }}>→</span>
            <input type="date" value={hedefBit} onChange={e => setHedefBit(e.target.value)}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
          </div>
        </FilterField>
        <FilterField label="Tamamlanma Tarihi">
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="date" value={tamamBas} onChange={e => setTamamBas(e.target.value)}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
            <span style={{ alignSelf: 'center', fontSize: 11, color: T.textSoft }}>→</span>
            <input type="date" value={tamamBit} onChange={e => setTamamBit(e.target.value)}
              style={{ flex: 1, padding: '4px 6px', fontSize: 11.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
          </div>
        </FilterField>
        <FilterField label="Durum">
          <select value={filtre} onChange={e => setFiltre(e.target.value as DurumFilter)}
            style={{ width: '100%', padding: '6px 9px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="TUMU">Tümü</option>
            <option value="HAZIR">Hazır</option>
            <option value="ACIK">Açık</option>
            <option value="ISLEMDE">İşlemde</option>
            <option value="ONAY_BEKLIYOR">Onay Bekliyor</option>
            <option value="EKSTRA_TANIMSIZ">Ekstra (Tanımsız Plaka)</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
            <option value="IPTAL">İptal</option>
            <option value="YAPILAMADI">Yapılamadı</option>
            <option value="EKSTRA">Plansız</option>
          </select>
        </FilterField>
      </div>

      <div style={{ padding: '8px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.textSoft }}>
        <span style={{ fontWeight: 700, color: T.text }}>{filtrelenmis.length}</span> / {kayitlar.length} kayıt
        {filtreAktif && (
          <button onClick={temizleFiltre}
            style={{ padding: '4px 9px', borderRadius: 5, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={11} /> Filtreyi Temizle
          </button>
        )}
        <button onClick={exportCsv} disabled={filtrelenmis.length === 0}
          style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.border}`, background: '#fff', cursor: filtrelenmis.length === 0 ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: filtrelenmis.length === 0 ? 0.5 : 1 }}>
          <Download size={11} /> CSV
        </button>
      </div>

      {/* TABLO */}
      {filtrelenmis.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          {kayitlar.length === 0 ? 'Henüz görev kaydı yok.' : 'Filtre koşullarına uyan kayıt yok.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1300 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <Th>Plaka</Th>
                <Th>Kullanıcı</Th>
                <Th>İstasyon</Th>
                <Th align="center">Yıkama Günü</Th>
                <Th align="center">Durum</Th>
                <Th align="center">Başlatma</Th>
                <Th align="center">Tamamlanma</Th>
                <Th align="center">Süre</Th>
                <Th align="right">KM</Th>
                <Th>İşlem Yapan</Th>
                <Th>Açıklama / Sebep</Th>
                {canEdit && <Th align="right">İşlem</Th>}
              </tr>
            </thead>
            <tbody>
              {filtrelenmis.map(k => {
                const gd = turetilenDurum(k, bugun)
                return (
                  <tr key={k.gorev_id}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: T.text, letterSpacing: '0.03em' }}>{k.plaka}</span>
                        {(k.onay_durumu === 'ONAY_BEKLIYOR' || k.onay_durumu === 'ONAYLANDI') ? (
                          <span style={{ padding: '1px 5px', borderRadius: 999, background: '#cffafe', color: '#0891b2', fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.4 }}>EKSTRA</span>
                        ) : k.ekstra ? (
                          <span style={{ padding: '1px 5px', borderRadius: 999, background: T.purpleLight, color: T.purple, fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.4 }}>PLANSIZ</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      {k.arac_kullanici
                        ? <span style={{ color: T.text, fontWeight: 600 }}>{k.arac_kullanici}</span>
                        : <span style={{ color: T.textSoft, fontStyle: 'italic' }}>—</span>}
                    </Td>
                    <Td muted>{k.istasyon}</Td>
                    <Td align="center">
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
                        <span>{fmtTarih(k.hedef_tarih)}</span>
                        {gunAdi(k.hedef_tarih) && (
                          <span style={{ fontSize: 11, color: T.textSoft, fontWeight: 500, marginTop: 1 }}>{gunAdi(k.hedef_tarih)}</span>
                        )}
                      </div>
                    </Td>
                    <Td align="center">
                      <DurumBadgeWithSebep
                        durum={gd}
                        label={DURUM_LABEL[gd]}
                        durumSebep={k.durum_sebep}
                        iptalSebep={k.iptal_sebep}
                        eden={k.tamamlayan ?? k.iptal_eden ?? null}
                        tarih={k.durum_degisim_tarihi ?? k.tamamlanma_tarihi}
                        style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: DURUM_BG[gd], color: DURUM_FG[gd], fontSize: 12, fontWeight: 700 }}
                      />
                    </Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 16, whiteSpace: 'nowrap' }}>{fmtDateTime(k.baslatilma_tarihi)}</span></Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 16, whiteSpace: 'nowrap' }}>{fmtDateTime(k.tamamlanma_tarihi)}</span></Td>
                    <Td align="center" muted>
                      <span style={{ fontFamily: 'monospace', fontSize: 16, color: gd === 'TAMAMLANDI' ? T.green : T.textSoft, fontWeight: gd === 'TAMAMLANDI' ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {fmtSure(k.tamamlanma_suresi_saniye)}
                      </span>
                    </Td>
                    <Td align="right" muted>
                      <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {k.km != null ? k.km.toLocaleString('tr-TR') : '—'}
                      </span>
                    </Td>
                    <Td muted>
                      {gd === 'TAMAMLANDI' ? (k.tamamlayan ?? '—')
                        : gd === 'ISLEMDE' ? (k.tamamlayan ?? '—')
                        : gd === 'ONAY_BEKLIYOR' ? (k.tamamlayan ?? '—')
                        : gd === 'IPTAL' ? (k.iptal_eden ?? (
                            <span style={{ fontStyle: 'italic', color: T.textSoft }}>Sistem (otomatik)</span>
                          ))
                        : gd === 'YAPILAMADI' ? (
                            <span style={{ fontStyle: 'italic', color: T.textSoft }}>Sistem (süre aşımı)</span>
                          )
                        : '—'}
                    </Td>
                    <Td muted>
                      {gd === 'IPTAL' && k.iptal_sebep ? (
                        <span title={k.iptal_sebep}
                          style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4, color: T.red }}>
                          ❌ {k.iptal_sebep.length > 30 ? k.iptal_sebep.slice(0, 30) + '…' : k.iptal_sebep}
                        </span>
                      ) : k.notlar ? (
                        <span title={k.notlar} style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          📝 {k.notlar.length > 30 ? k.notlar.slice(0, 30) + '…' : k.notlar}
                        </span>
                      ) : '—'}
                    </Td>
                    {canEdit && (
                      <Td align="right">
                        <button onClick={() => setEditKaydi(k)}
                          title="Düzenle (durum, tarih, istasyon)"
                          style={{
                            padding: 5, marginRight: 5, borderRadius: 5,
                            border: `1px solid ${T.border}`, background: '#fff',
                            cursor: 'pointer', color: T.text,
                            display: 'inline-flex', alignItems: 'center',
                          }}>
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => gorevSil(k)}
                          disabled={silLoading === k.gorev_id}
                          title="Sil"
                          style={{
                            padding: 5, borderRadius: 5,
                            border: `1px solid ${T.redLight}`, background: '#fff',
                            cursor: 'pointer', color: T.red,
                            display: 'inline-flex', alignItems: 'center',
                          }}>
                          {silLoading === k.gorev_id ? <Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Trash2 size={13} />}
                        </button>
                      </Td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* EDIT MODAL */}
      {editKaydi && (
        <EditModal
          firmaId={firmaId}
          kaydi={editKaydi}
          istasyonlar={istasyonlar}
          loading={editLoading}
          onClose={() => setEditKaydi(null)}
          onSave={editKaydet}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function EditModal({ firmaId, kaydi, istasyonlar, loading, onClose, onSave }: {
  firmaId: string
  kaydi: GorevKaydi
  istasyonlar: IstasyonOpt[]
  loading: boolean
  onClose: () => void
  onSave: (hedef: string, lok: string, durum: string, iptalSebep: string, km: string, notlar: string, personelId: string) => void
}) {
  const [hedef, setHedef] = useState(kaydi.hedef_tarih ?? '')
  const [lok, setLok] = useState(kaydi.lokasyon_id ?? '')
  const [durum, setDurum] = useState<string>(kaydi.durum ?? 'ACIK')
  const [iptalSebep, setIptalSebep] = useState<string>(kaydi.iptal_sebep ?? '')
  const [km, setKm] = useState<string>(kaydi.km != null ? String(kaydi.km) : '')
  const [notlar, setNotlar] = useState<string>(kaydi.notlar ?? '')
  const [personelId, setPersonelId] = useState<string>('')
  const [personeller, setPersoneller] = useState<{ id: string; isim_soyisim: string }[]>([])
  const [personelYukleniyor, setPersonelYukleniyor] = useState(true)

  // Personel listesini fetch et
  useEffect(() => {
    let iptal = false
    setPersonelYukleniyor(true)
    fetch(`/api/oto-yikama/personel?firma_id=${firmaId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!iptal && j.ok) setPersoneller(j.data ?? []) })
      .catch(() => {})
      .finally(() => { if (!iptal) setPersonelYukleniyor(false) })
    return () => { iptal = true }
  }, [firmaId])

  const isClosedDurum = ['TAMAMLANDI', 'IPTAL', 'YAPILAMADI', 'SILINDI'].includes(kaydi.durum ?? '')
  const durumDegisti = durum !== kaydi.durum
  const iptalEksik = durum === 'IPTAL' && iptalSebep.trim().length < 5
  // KM TAMAMLANDI'ya YENİ geçişte zorunlu
  const tamamlanmayaYeniGecis = durum === 'TAMAMLANDI' && kaydi.durum !== 'TAMAMLANDI'
  const kmGecerliMi = km.trim() ? Number(km) > 0 && Number.isFinite(Number(km)) : false
  const kmEksik = tamamlanmayaYeniGecis && !kmGecerliMi
  // Personel: ACIK'a geri alma hariç durum değişiminde zorunlu
  const personelGerekli = durumDegisti && durum !== 'ACIK'
  const personelEksik = personelGerekli && !personelId

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 20, backdropFilter: 'blur(2px)',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 500,
          boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Görev Kaydını Düzenle</div>
            <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2, fontFamily: 'monospace' }}>{kaydi.plaka}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.textSoft, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Durum dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Durum</label>
            <select value={durum} onChange={e => setDurum(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 7, background: '#fff' }}>
              <option value="ACIK">Açık</option>
              <option value="ISLEMDE">İşlemde</option>
              <option value="TAMAMLANDI">Tamamlandı</option>
              <option value="IPTAL">İptal</option>
            </select>
          </div>

          {/* İşlemi Yapan Personel — durum değişimi varsa (ACIK'a geri alma hariç) zorunlu */}
          {personelGerekli && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.red, marginBottom: 6 }}>
                İşlemi Yapan Personel <span style={{ fontWeight: 400 }}>(zorunlu)</span>
              </label>
              <select value={personelId} onChange={e => setPersonelId(e.target.value)}
                disabled={personelYukleniyor || personeller.length === 0}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: `1px solid ${personelEksik ? T.red : T.border}`, borderRadius: 7,
                  background: '#fff',
                }}>
                <option value="">{personelYukleniyor ? 'Yükleniyor…' : (personeller.length === 0 ? 'Yıkama personeli yok' : '— Seçin —')}</option>
                {personeller.map(p => <option key={p.id} value={p.id}>{p.isim_soyisim}</option>)}
              </select>
              <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4 }}>
                {durum === 'ISLEMDE' && 'Görevi şu an başlatan kişi. Başlatma saati otomatik atanır.'}
                {durum === 'TAMAMLANDI' && (kaydi.durum === 'ISLEMDE' ? 'Görevi tamamlayan kişi. Bitiş saati otomatik atanır.' : 'Görevi yapan kişi. Başlama ve bitiş aynı saate yazılır (süre 0 sn).')}
                {durum === 'IPTAL' && 'İptal işlemini yapan kişi. Başlama/bitiş saatleri sıfırlanır.'}
              </div>
            </div>
          )}
          {durum === 'ACIK' && durumDegisti && (
            <div style={{ fontSize: 11.5, color: T.amber, padding: '8px 10px', background: T.amberLight, borderRadius: 6, fontWeight: 600 }}>
              ⚠️ Açık'a geri alma — başlama/bitiş/personel/iptal sebep alanları sıfırlanır, görev tekrar yıkanmaya hazır beklemeye geçer.
            </div>
          )}

          {/* İptal sebebi — sadece IPTAL seçildiyse */}
          {durum === 'IPTAL' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.red, marginBottom: 6 }}>
                İptal Sebebi <span style={{ fontWeight: 400 }}>(zorunlu, en az 5 karakter)</span>
              </label>
              <textarea value={iptalSebep} onChange={e => setIptalSebep(e.target.value)}
                rows={3} placeholder="Görevin neden iptal edildiğini yazın…"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13, lineHeight: 1.4,
                  border: `1px solid ${iptalEksik ? T.red : T.border}`, borderRadius: 7,
                  fontFamily: 'inherit', resize: 'vertical',
                }} />
              {iptalEksik && (
                <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>
                  En az 5 karakter girmelisiniz.
                </div>
              )}
            </div>
          )}

          {/* Hedef tarih + İstasyon — sadece düzenlenebilir durumlarda */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>
              Yıkama Günü
              {isClosedDurum && <span style={{ fontWeight: 400, color: T.textSoft, marginLeft: 6 }}>(kapalı görevde değiştirilemez)</span>}
            </label>
            <input type="date" value={hedef} onChange={e => setHedef(e.target.value)}
              disabled={isClosedDurum && !durumDegisti}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 7,
                       opacity: isClosedDurum && !durumDegisti ? 0.5 : 1 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>
              İstasyon
              {isClosedDurum && <span style={{ fontWeight: 400, color: T.textSoft, marginLeft: 6 }}>(kapalı görevde değiştirilemez)</span>}
            </label>
            <select value={lok} onChange={e => setLok(e.target.value)}
              disabled={isClosedDurum && !durumDegisti}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 7,
                       background: '#fff', opacity: isClosedDurum && !durumDegisti ? 0.5 : 1 }}>
              <option value="">— Seçin —</option>
              {istasyonlar.map(i => <option key={i.id} value={i.id}>{i.tanim}</option>)}
            </select>
          </div>

          {/* KM — TAMAMLANDI'ya geçerken zorunlu */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: tamamlanmayaYeniGecis ? T.red : T.text, marginBottom: 6 }}>
              Araç KM
              {tamamlanmayaYeniGecis && <span style={{ fontWeight: 400, marginLeft: 6 }}>(zorunlu)</span>}
            </label>
            <input type="number" min={1} value={km} onChange={e => setKm(e.target.value)}
              placeholder="Aracın güncel kilometresi"
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13,
                border: `1px solid ${kmEksik ? T.red : T.border}`, borderRadius: 7,
              }} />
            {kmEksik && (
              <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>
                Tamamlamak için aracın güncel KM değeri zorunludur (pozitif sayı).
              </div>
            )}
          </div>

          {/* Açıklama (notlar) — opsiyonel */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>
              Açıklama <span style={{ fontWeight: 400, color: T.textSoft }}>(opsiyonel)</span>
            </label>
            <textarea value={notlar} onChange={e => setNotlar(e.target.value)}
              rows={2} placeholder="Yıkamayla ilgili not, gözlem veya uyarı…"
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13, lineHeight: 1.4,
                border: `1px solid ${T.border}`, borderRadius: 7,
                fontFamily: 'inherit', resize: 'vertical',
              }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={loading}
            style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: T.text }}>
            Vazgeç
          </button>
          <button onClick={() => onSave(hedef, lok, durum, iptalSebep.trim(), km, notlar, personelId)}
            disabled={loading || iptalEksik || kmEksik || personelEksik}
            style={{
              padding: '8px 18px', borderRadius: 7, border: 'none',
              background: loading || iptalEksik || kmEksik || personelEksik ? '#cbd5e1' : 'linear-gradient(145deg, #1d4ed8, #1e40af)',
              color: '#fff', cursor: loading || iptalEksik || kmEksik || personelEksik ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {loading ? <><Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> Kaydediliyor…</> : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function KpiPil({ etiket, sayi, renk, active, onClick }: {
  etiket: string; sayi: number; renk: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 8,
        background: active ? renk + '14' : '#fafafa',
        border: active ? `1.5px solid ${renk}` : '1px solid #e5e7eb',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'baseline', gap: 5,
        transition: 'all 0.15s',
      }}>
      <span style={{ fontSize: 18, fontWeight: 900, color: renk, lineHeight: 1 }}>{sayi}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: renk, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiket}</span>
    </button>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' | 'center' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '11px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, background: '#fafafa' }}>{children}</th>
}

function Td({ children, muted, align }: { children: React.ReactNode; muted?: boolean; align?: 'right' | 'left' | 'center' }) {
  return <td style={{ padding: '11px 12px', borderBottom: '1px solid #f1f5f9', textAlign: align ?? 'left', color: muted ? '#64748b' : '#0f172a' }}>{children}</td>
}
