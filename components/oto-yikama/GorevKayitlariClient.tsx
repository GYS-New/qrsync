'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Calendar, Download, Edit3, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export interface GorevKaydi {
  gorev_id: string
  plaka: string
  hedef_tarih: string | null
  ekstra: boolean
  durum: string | null
  lokasyon_id: string | null
  istasyon: string
  olusturma_tarihi: string | null
  baslatilma_tarihi: string | null
  tamamlanma_tarihi: string | null
  tamamlanma_suresi_saniye: number | null
  olusturan: string | null
  tamamlayan: string | null
  tamamlayan_id: string | null
  iptal_eden: string | null
  iptal_sebep: string | null
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
type GoruntuDurum = 'HAZIR' | 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL' | 'DIGER'
type DurumFilter = 'TUMU' | GoruntuDurum | 'EKSTRA'

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

function turetilenDurum(k: GorevKaydi, bugun: string): GoruntuDurum {
  const d = k.durum ?? ''
  if (d === 'ACIK') {
    return k.hedef_tarih && k.hedef_tarih > bugun ? 'HAZIR' : 'ACIK'
  }
  if (d === 'ISLEMDE')    return 'ISLEMDE'
  if (d === 'TAMAMLANDI') return 'TAMAMLANDI'
  if (['IPTAL', 'SILINDI', 'KAPATILDI'].includes(d)) return 'IPTAL'
  return 'DIGER'
}

const DURUM_BG: Record<GoruntuDurum, string> = {
  HAZIR: '#f1f5f9', ACIK: T.amberLight, ISLEMDE: T.blueLight,
  TAMAMLANDI: T.greenLight, IPTAL: T.redLight, DIGER: '#f1f5f9',
}
const DURUM_FG: Record<GoruntuDurum, string> = {
  HAZIR: '#475569', ACIK: T.amber, ISLEMDE: T.blue,
  TAMAMLANDI: T.green, IPTAL: T.red, DIGER: T.textSoft,
}
const DURUM_LABEL: Record<GoruntuDurum, string> = {
  HAZIR: 'Hazır', ACIK: 'Açık', ISLEMDE: 'İşlemde',
  TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal', DIGER: '—',
}

function fmtTarih(d: string | null): string {
  if (!d) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4)
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(d))
}
function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(d))
}
function fmtSure(saniye: number | null): string {
  if (saniye == null || saniye <= 0) return '—'
  const m = Math.floor(saniye / 60)
  const s = saniye % 60
  if (m === 0) return `${s}sn`
  return `${m}dk ${s}sn`
}

interface Props {
  kayitlar: GorevKaydi[]
  istasyonlar: IstasyonOpt[]
  tamamlayanlar: KullaniciOpt[]
  canEdit: boolean
}

export default function GorevKayitlariClient({ kayitlar, istasyonlar, tamamlayanlar, canEdit }: Props) {
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
  // İşlem süresi (dakika) aralığı
  const [sureMin, setSureMin] = useState('')
  const [sureMax, setSureMax] = useState('')
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
    let hazir = 0, acik = 0, islemde = 0, tamam = 0, iptal = 0, ekstra = 0
    for (const { k, gd } of kayitlarTuretilmis) {
      if (gd === 'HAZIR')      hazir++
      if (gd === 'ACIK')       acik++
      if (gd === 'ISLEMDE')    islemde++
      if (gd === 'TAMAMLANDI') tamam++
      if (gd === 'IPTAL')      iptal++
      if (k.ekstra)            ekstra++
    }
    return { toplam: kayitlar.length, hazir, acik, islemde, tamam, iptal, ekstra }
  }, [kayitlarTuretilmis, kayitlar.length])

  const filtrelenmis = useMemo(() => {
    const ara = arama.trim().toUpperCase()
    const sureMinSec = sureMin ? Math.max(0, parseInt(sureMin, 10) * 60) : null
    const sureMaxSec = sureMax ? Math.max(0, parseInt(sureMax, 10) * 60) : null

    return kayitlarTuretilmis.filter(({ k, gd }) => {
      if (filtre === 'EKSTRA' && !k.ekstra) return false
      if (filtre !== 'TUMU' && filtre !== 'EKSTRA' && filtre !== gd) return false
      if (istasyonId && k.lokasyon_id !== istasyonId) return false
      if (tamamlayanId && k.tamamlayan_id !== tamamlayanId) return false
      if (hedefBas && (!k.hedef_tarih || k.hedef_tarih < hedefBas)) return false
      if (hedefBit && (!k.hedef_tarih || k.hedef_tarih > hedefBit)) return false
      if (tamamBas || tamamBit) {
        if (!k.tamamlanma_tarihi) return false
        const t = k.tamamlanma_tarihi.slice(0, 10)
        if (tamamBas && t < tamamBas) return false
        if (tamamBit && t > tamamBit) return false
      }
      if (sureMinSec != null && (k.tamamlanma_suresi_saniye ?? 0) < sureMinSec) return false
      if (sureMaxSec != null && (k.tamamlanma_suresi_saniye ?? 0) > sureMaxSec) return false
      if (ara) {
        const hay = `${k.plaka ?? ''} ${k.istasyon ?? ''} ${k.olusturan ?? ''} ${k.tamamlayan ?? ''}`.toUpperCase()
        if (!hay.includes(ara)) return false
      }
      return true
    }).map(({ k }) => k)
  }, [kayitlarTuretilmis, arama, filtre, istasyonId, tamamlayanId, hedefBas, hedefBit, tamamBas, tamamBit, sureMin, sureMax])

  const filtreAktif = filtre !== 'TUMU' || !!arama || !!istasyonId || !!tamamlayanId || !!hedefBas || !!hedefBit || !!tamamBas || !!tamamBit || !!sureMin || !!sureMax

  function temizleFiltre() {
    setFiltre('TUMU'); setArama(''); setIstasyonId(''); setTamamlayanId('')
    setHedefBas(''); setHedefBit(''); setTamamBas(''); setTamamBit('')
    setSureMin(''); setSureMax('')
  }

  function exportCsv() {
    const headers = ['Plaka', 'İstasyon', 'Hedef Tarih', 'Durum', 'Ekstra', 'Oluşturma', 'Başlatma', 'Tamamlanma', 'Süre (sn)', 'Oluşturan', 'Tamamlayan']
    const rows = filtrelenmis.map(k => {
      const gd = turetilenDurum(k, bugun)
      return [
        k.plaka, k.istasyon, k.hedef_tarih ?? '', DURUM_LABEL[gd],
        k.ekstra ? 'Evet' : 'Hayır',
        k.olusturma_tarihi ?? '', k.baslatilma_tarihi ?? '', k.tamamlanma_tarihi ?? '',
        k.tamamlanma_suresi_saniye ?? '',
        k.olusturan ?? '', k.tamamlayan ?? '',
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
      title: 'Görevi sil',
      message: `${k.plaka} (${fmtTarih(k.hedef_tarih)}) görev kaydı kalıcı olarak silinecek. Devam edilsin mi?`,
      confirmText: 'Sil', cancelText: 'Vazgeç', variant: 'danger',
    })
    if (!ok) return
    setSilLoading(k.gorev_id)
    try {
      const res = await fetch(`/api/oto-yikama/gorev-kayitlari/${k.gorev_id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Silinemedi')
      toast({ type: 'success', title: 'Silindi', message: k.plaka })
      router.refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setSilLoading(null)
    }
  }

  async function editKaydet(yeniHedef: string, yeniLok: string) {
    if (!editKaydi) return
    const body: Record<string, string> = {}
    if (yeniHedef && yeniHedef !== editKaydi.hedef_tarih) body.hedef_tarih = yeniHedef
    if (yeniLok && yeniLok !== editKaydi.lokasyon_id) body.lokasyon_id = yeniLok
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
        <KpiPil renk={T.green}     etiket="tamamlandı" sayi={sayilar.tamam}    active={filtre === 'TAMAMLANDI'}
                onClick={() => setFiltre(filtre === 'TAMAMLANDI' ? 'TUMU' : 'TAMAMLANDI')} />
        <KpiPil renk={T.red}       etiket="iptal"      sayi={sayilar.iptal}    active={filtre === 'IPTAL'}
                onClick={() => setFiltre(filtre === 'IPTAL' ? 'TUMU' : 'IPTAL')} />
        <KpiPil renk={T.purple}    etiket="ekstra"     sayi={sayilar.ekstra}   active={filtre === 'EKSTRA'}
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
            style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            {istasyonlar.map(i => <option key={i.id} value={i.id}>{i.tanim}</option>)}
          </select>
        </FilterField>
        <FilterField label="Tamamlayan">
          <select value={tamamlayanId} onChange={e => setTamamlayanId(e.target.value)}
            style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            {tamamlayanlar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
          </select>
        </FilterField>
        <FilterField label="Hedef Tarih">
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
        <FilterField label="İşlem Süresi (dk)">
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="number" min={0} value={sureMin} onChange={e => setSureMin(e.target.value)} placeholder="Min"
              style={{ flex: 1, padding: '4px 8px', fontSize: 11.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
            <span style={{ alignSelf: 'center', fontSize: 11, color: T.textSoft }}>→</span>
            <input type="number" min={0} value={sureMax} onChange={e => setSureMax(e.target.value)} placeholder="Maks"
              style={{ flex: 1, padding: '4px 8px', fontSize: 11.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
          </div>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1200 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <Th>Plaka</Th>
                <Th>İstasyon</Th>
                <Th align="center">Hedef Tarih</Th>
                <Th align="center">Durum</Th>
                <Th align="center">Başlatma</Th>
                <Th align="center">Tamamlanma</Th>
                <Th align="center">Süre</Th>
                <Th>Tamamlayan</Th>
                {canEdit && <Th align="right">İşlem</Th>}
              </tr>
            </thead>
            <tbody>
              {filtrelenmis.map(k => {
                const gd = turetilenDurum(k, bugun)
                const duzenlenebilir = ['HAZIR', 'ACIK', 'ISLEMDE'].includes(gd)
                return (
                  <tr key={k.gorev_id}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: T.text, letterSpacing: '0.03em' }}>{k.plaka}</span>
                        {k.ekstra && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, background: T.purpleLight, color: T.purple, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>EKSTRA</span>
                        )}
                      </div>
                    </Td>
                    <Td muted>{k.istasyon}</Td>
                    <Td align="center">{fmtTarih(k.hedef_tarih)}</Td>
                    <Td align="center">
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: DURUM_BG[gd], color: DURUM_FG[gd], fontSize: 12, fontWeight: 700 }}>
                        {DURUM_LABEL[gd]}
                      </span>
                    </Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmtDateTime(k.baslatilma_tarihi)}</span></Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmtDateTime(k.tamamlanma_tarihi)}</span></Td>
                    <Td align="center" muted>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: gd === 'TAMAMLANDI' ? T.green : T.textSoft, fontWeight: gd === 'TAMAMLANDI' ? 700 : 400 }}>
                        {fmtSure(k.tamamlanma_suresi_saniye)}
                      </span>
                    </Td>
                    <Td muted>{k.tamamlayan ?? '—'}</Td>
                    {canEdit && (
                      <Td align="right">
                        <button onClick={() => setEditKaydi(k)}
                          disabled={!duzenlenebilir}
                          title={duzenlenebilir ? 'Düzenle' : 'Bu durumdaki görev düzenlenemez'}
                          style={{
                            padding: 5, marginRight: 5, borderRadius: 5,
                            border: `1px solid ${T.border}`, background: '#fff',
                            cursor: duzenlenebilir ? 'pointer' : 'not-allowed',
                            color: duzenlenebilir ? T.text : T.gray,
                            opacity: duzenlenebilir ? 1 : 0.5,
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

function EditModal({ kaydi, istasyonlar, loading, onClose, onSave }: {
  kaydi: GorevKaydi
  istasyonlar: IstasyonOpt[]
  loading: boolean
  onClose: () => void
  onSave: (hedef: string, lok: string) => void
}) {
  const [hedef, setHedef] = useState(kaydi.hedef_tarih ?? '')
  const [lok, setLok] = useState(kaydi.lokasyon_id ?? '')
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
          width: '100%', maxWidth: 460,
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
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Hedef Tarih</label>
            <input type="date" value={hedef} onChange={e => setHedef(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 7 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>İstasyon</label>
            <select value={lok} onChange={e => setLok(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 7, background: '#fff' }}>
              <option value="">— Seçin —</option>
              {istasyonlar.map(i => <option key={i.id} value={i.id}>{i.tanim}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={loading}
            style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: T.text }}>
            Vazgeç
          </button>
          <button onClick={() => onSave(hedef, lok)} disabled={loading || (!hedef && !lok)}
            style={{
              padding: '8px 18px', borderRadius: 7, border: 'none',
              background: loading ? '#cbd5e1' : 'linear-gradient(145deg, #1d4ed8, #1e40af)',
              color: '#fff', cursor: loading ? 'wait' : 'pointer', fontSize: 13, fontWeight: 700,
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
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
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
