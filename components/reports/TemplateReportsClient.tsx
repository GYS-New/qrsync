'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { Download, FileSpreadsheet, Upload, CheckCircle, Mail, Trash2, Clock } from 'lucide-react'

interface Props {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}

const T = {
  green: '#111827', greenMid: '#374151', border: '#e2e8f0', text: '#0f172a',
  textSoft: '#64748b', grayLight: '#f8fafc',
}

const inp: React.CSSProperties = {
  height: 36, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, width: '100%',
}

export default function TemplateReportsClient({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [baslangic, setBaslangic]       = useState('')
  const [bitis, setBitis]               = useState('')
  const [ustLokId, setUstLokId]         = useState('')
  const [altLokId, setAltLokId]         = useState('')
  const [lokasyonlar, setLokasyonlar]   = useState<any[]>([])
  const [downloading, setDownloading]   = useState(false)
  const [uploading, setUploading]       = useState(false)
  // Zamanlama
  const [zamanlamalar, setZamanlamalar] = useState<any[]>([])
  const [mailEmails, setMailEmails]     = useState('')
  const [mailAciklama, setMailAciklama] = useState('')
  const [mailTekrar, setMailTekrar]     = useState<'tek_sefer' | 'gunluk' | 'haftalik' | 'aylik'>('tek_sefer')
  const [mailSaat, setMailSaat]         = useState('08:00')
  const [mailGonderimTarihi, setMailGonderimTarihi] = useState('')
  const [mailAyGunu, setMailAyGunu]     = useState(1) // aylık: ayın kaçıncı günü
  const [mailHaftaGunu, setMailHaftaGunu] = useState(1) // haftalık: 0=Pazar...6=Cumartesi
  const [savingMail, setSavingMail]     = useState(false)
  const [sablonInfo, setSablonInfo]     = useState<{ exists: boolean; updatedAt: string | null }>({ exists: false, updatedAt: null })
  const fileRef = React.useRef<HTMLInputElement>(null)

  // Şablon bilgisini çek
  useEffect(() => {
    fetch('/api/reports/template-upload')
      .then(r => r.json())
      .then(j => setSablonInfo({ exists: j.exists, updatedAt: j.updatedAt }))
      .catch(() => {})
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/reports/template-upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Yükleme hatası')
      setSablonInfo({ exists: true, updatedAt: new Date().toISOString() })
      toast({ type: 'success', title: 'Başarılı', message: 'Şablon yüklendi.' })
    } catch (err: any) {
      toast({ type: 'error', title: 'Hata', message: err.message })
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Zamanlamaları çek
  const fetchZamanlamalar = useCallback(async () => {
    if (!currentFirmaId) return
    const q = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId) q.set('projeId', projeId)
    try {
      const res = await fetch(`/api/reports/rapor-zamanlama?${q}`)
      const json = await res.json()
      if (Array.isArray(json)) setZamanlamalar(json)
    } catch {}
  }, [currentFirmaId, projeId])

  useEffect(() => { fetchZamanlamalar() }, [fetchZamanlamalar])

  const handleSaveZamanlama = async () => {
    const emails = mailEmails.split(/[,;\n]+/).map(e => e.trim()).filter(e => e.includes('@'))
    if (!emails.length) { toast({ type: 'error', title: 'Hata', message: 'En az bir geçerli e-posta adresi girin.' }); return }
    setSavingMail(true)
    try {
      const body: any = {
        firmaId: currentFirmaId, projeId,
        ust_lokasyon_id: ustLokId || null,
        alici_emails: emails,
        tekrar_tipi: mailTekrar,
        saat: mailSaat,
        aciklama: mailAciklama,
      }
      if (mailTekrar === 'tek_sefer') {
        body.rapor_baslangic = baslangic
        body.rapor_bitis = bitis
        body.gonderim_tarihi = mailGonderimTarihi || new Date().toISOString().slice(0, 10)
      }
      if (mailTekrar === 'aylik') body.gun_secimi = [mailAyGunu]
      if (mailTekrar === 'haftalik') body.gun_secimi = [mailHaftaGunu]
      const res = await fetch('/api/reports/rapor-zamanlama', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Kaydetme hatası')
      toast({ type: 'success', title: 'Başarılı', message: 'Rapor gönderimi zamanlandı.' })
      setMailEmails(''); setMailAciklama('')
      fetchZamanlamalar()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSavingMail(false)
  }

  const handleDeleteZamanlama = async (id: string) => {
    try {
      await fetch('/api/reports/rapor-zamanlama', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      fetchZamanlamalar()
      toast({ type: 'success', title: 'Silindi', message: 'Zamanlama kaldırıldı.' })
    } catch {}
  }

  // Lokasyonları çek
  useEffect(() => {
    if (!currentFirmaId) return
    const q = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId) q.set('projeId', projeId)
    fetch(`/api/lokasyonlar-list?${q}`)
      .then(r => r.json())
      .then(j => setLokasyonlar(j.lokasyonlar ?? j.data ?? j ?? []))
      .catch(() => {})
  }, [currentFirmaId, projeId])

  const ustLokasyonlar = lokasyonlar.filter((l: any) => !l.parent_id)
  const altLokasyonlar = ustLokId ? lokasyonlar.filter((l: any) => l.parent_id === ustLokId) : []

  // Varsayılan tarih: son 30 gün
  useEffect(() => {
    if (!baslangic) {
      const now = new Date()
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      setBaslangic(d30.toISOString().slice(0, 10))
      setBitis(now.toISOString().slice(0, 10))
    }
  }, [baslangic])

  const handleDownload = useCallback(async () => {
    if (!currentFirmaId) return
    setDownloading(true)
    try {
      const q = new URLSearchParams({ firmaId: currentFirmaId })
      if (projeId)   q.set('projeId', projeId)
      if (ustLokId)  q.set('ustLokasyonId', ustLokId)
      if (altLokId)  q.set('altLokasyonId', altLokId)
      if (baslangic) q.set('baslangic', baslangic)
      if (bitis)     q.set('bitis', bitis)

      const res = await fetch(`/api/reports/genel-rapor-export?${q}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Rapor indirilemedi')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Genel_Rapor_${Date.now()}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast({ type: 'success', title: 'Başarılı', message: 'Rapor indirildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setDownloading(false)
  }, [currentFirmaId, projeId, ustLokId, altLokId, baslangic, bitis, toast])

  return (
    <div>
      <Topbar
        title="Rapor Özelleştir"
        base={base}
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` },
          { label: 'Rapor Özelleştir' },
        ]}
      />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Üst satır: Genel Rapor + Mail Gönderimi yan yana */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* SOL: Genel Rapor */}
        <div className="verde-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f9fafb', display: 'grid', placeItems: 'center' }}>
              <FileSpreadsheet size={22} color={T.green} />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: T.text, margin: 0 }}>Genel Rapor</h2>
              <div style={{ fontSize: 13, color: T.textSoft, marginTop: 2 }}>
                Frekans göstergeleri, hakediş faktörleri, tamamlanan/sapma/kayıp frekanslar ve süre analizi
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.6, padding: '10px 14px', background: T.grayLight, borderRadius: 8, marginBottom: 16 }}>
            Aşağıdaki filtreleri ayarlayarak raporunuzu oluşturun. Excel dosyası 6 sayfalık detaylı rapor şablonu ile oluşturulur:
            <strong> Giriş, Tamamlanan Frekanslar, Sapmalar, Kayıp Frekanslar, Gruplar, Frekans Fazlası.</strong>
          </div>

          {/* Filtreler */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Başlangıç Tarihi</span>
              <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inp} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Bitiş Tarihi</span>
              <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} style={inp} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Üst Lokasyon</span>
              <select value={ustLokId} onChange={e => { setUstLokId(e.target.value); setAltLokId('') }} style={inp}>
                <option value="">Tümü</option>
                {ustLokasyonlar.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Alt Lokasyon</span>
              <select value={altLokId} onChange={e => setAltLokId(e.target.value)} style={inp} disabled={!ustLokId}>
                <option value="">Tümü</option>
                {altLokasyonlar.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
              </select>
            </label>
          </div>

          {/* İndir butonu */}
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleDownload}
              disabled={downloading || !currentFirmaId}
              style={{
                height: 44, padding: '0 28px', borderRadius: 10, border: 'none',
                background: T.green, color: '#fff', fontWeight: 800, fontSize: 14,
                cursor: downloading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: downloading ? 0.6 : 1,
              }}
            >
              <Download size={18} />
              {downloading ? 'Rapor Hazırlanıyor...' : 'Excel Rapor İndir'}
            </button>
            {downloading && (
              <span style={{ fontSize: 13, color: T.textSoft }}>Veriler toplanıyor ve şablon dolduruluyor...</span>
            )}
          </div>
        </div>

        {/* SAĞ: Otomatik Rapor Gönderimi */}
        <div className="verde-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'grid', placeItems: 'center' }}>
              <Mail size={22} color="#1d4ed8" />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: T.text, margin: 0 }}>Otomatik Rapor Gönderimi</h2>
              <div style={{ fontSize: 13, color: T.textSoft, marginTop: 2 }}>
                Raporu belirli tarihlerde otomatik oluşturup e-posta ile gönderin
              </div>
            </div>
          </div>

          {/* Form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Alıcı E-posta Adresleri</span>
              <textarea
                value={mailEmails} onChange={e => setMailEmails(e.target.value)}
                placeholder="ornek@firma.com, diger@firma.com"
                rows={2}
                style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, resize: 'vertical' }}
              />
              <span style={{ fontSize: 11, color: T.textSoft }}>Birden fazla adres virgül veya yeni satır ile ayırın</span>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Tekrar</span>
              <select value={mailTekrar} onChange={e => setMailTekrar(e.target.value as any)} style={inp}>
                <option value="tek_sefer">Tek Sefer</option>
                <option value="gunluk">Her Gün</option>
                <option value="haftalik">Her Hafta</option>
                <option value="aylik">Her Ay</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Gönderim Saati</span>
              <input type="time" value={mailSaat} onChange={e => setMailSaat(e.target.value)} style={inp} />
            </label>

            {mailTekrar === 'tek_sefer' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Gönderim Tarihi</span>
                <input type="date" value={mailGonderimTarihi} onChange={e => setMailGonderimTarihi(e.target.value)} style={inp} />
              </label>
            )}

            {mailTekrar === 'aylik' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Ayın Günü</span>
                <select value={mailAyGunu} onChange={e => setMailAyGunu(Number(e.target.value))} style={inp}>
                  {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <span style={{ fontSize: 11, color: T.textSoft }}>Her ayın bu gününde bir önceki ayın raporu gönderilir</span>
              </label>
            )}

            {mailTekrar === 'haftalik' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Haftanın Günü</span>
                <select value={mailHaftaGunu} onChange={e => setMailHaftaGunu(Number(e.target.value))} style={inp}>
                  {[{ v: 1, l: 'Pazartesi' }, { v: 2, l: 'Salı' }, { v: 3, l: 'Çarşamba' }, { v: 4, l: 'Perşembe' }, { v: 5, l: 'Cuma' }, { v: 6, l: 'Cumartesi' }, { v: 0, l: 'Pazar' }].map(g =>
                    <option key={g.v} value={g.v}>{g.l}</option>
                  )}
                </select>
                <span style={{ fontSize: 11, color: T.textSoft }}>Her hafta bu günde bir önceki haftanın raporu gönderilir</span>
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const }}>Açıklama (opsiyonel)</span>
              <textarea
                value={mailAciklama} onChange={e => setMailAciklama(e.target.value)}
                placeholder="Mail gövdesine eklenecek not..."
                rows={2}
                style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, resize: 'vertical' }}
              />
            </label>
          </div>

          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.6, padding: '10px 14px', background: T.grayLight, borderRadius: 8, marginBottom: 14 }}>
            {mailTekrar === 'tek_sefer' && (
              <>Yukarıdaki Başlangıç/Bitiş tarih aralığı ve Üst Lokasyon filtresi kullanılarak rapor oluşturulup <strong>{mailGonderimTarihi || 'bugün'}</strong> saat <strong>{mailSaat}</strong>'de gönderilecek.</>
            )}
            {mailTekrar === 'gunluk' && (
              <>Her gün saat <strong>{mailSaat}</strong>'de, <strong>bir önceki günün</strong> raporu otomatik oluşturulup gönderilecek.</>
            )}
            {mailTekrar === 'haftalik' && (
              <>Her <strong>{['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][mailHaftaGunu]}</strong> günü saat <strong>{mailSaat}</strong>'de, <strong>bir önceki haftanın</strong> (Pazartesi-Pazar) raporu otomatik gönderilecek.</>
            )}
            {mailTekrar === 'aylik' && (
              <>Her ayın <strong>{mailAyGunu}.</strong> günü saat <strong>{mailSaat}</strong>'de, <strong>bir önceki ayın</strong> tamamının raporu otomatik gönderilecek.</>
            )}
          </div>

          <button onClick={handleSaveZamanlama} disabled={savingMail}
            style={{
              height: 44, padding: '0 28px', borderRadius: 10, border: 'none',
              background: '#1d4ed8', color: '#fff', fontWeight: 800, fontSize: 14,
              cursor: savingMail ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, opacity: savingMail ? 0.6 : 1,
            }}>
            <Mail size={18} />
            {savingMail ? 'Kaydediliyor...' : 'Gönderimi Zamanla'}
          </button>

          {/* Mevcut zamanlamalar */}
          {zamanlamalar.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Zamanlanmış Gönderimler</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {zamanlamalar.map((z: any) => (
                  <div key={z.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: z.aktif ? T.grayLight : '#fef2f2', border: `1px solid ${z.aktif ? T.border : '#fca5a5'}`,
                    borderRadius: 8,
                  }}>
                    <Clock size={16} color={z.aktif ? '#1d4ed8' : '#dc2626'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                        {z.alici_emails?.join(', ')}
                      </div>
                      <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>
                        {z.tekrar_tipi === 'tek_sefer' ? 'Tek sefer' : z.tekrar_tipi === 'gunluk' ? 'Her gün · önceki günün raporu' : z.tekrar_tipi === 'haftalik' ? `Her ${['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'][z.gun_secimi?.[0] ?? 0]} · önceki hafta raporu` : `Her ayın ${z.gun_secimi?.[0] ?? 1}. günü · önceki ay raporu`}
                        {' · '}{z.saat}
                        {z.son_gonderim_tarihi && ` · Son: ${new Date(z.son_gonderim_tarihi).toLocaleDateString('tr-TR')}`}
                        {z.sonraki_gonderim_tarihi && z.aktif && ` · Sonraki: ${new Date(z.sonraki_gonderim_tarihi).toLocaleDateString('tr-TR')}`}
                        {z.aciklama && ` · ${z.aciklama}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: z.aktif ? '#1d4ed8' : '#dc2626' }}>
                      {z.aktif ? 'Aktif' : 'Tamamlandı'}
                    </span>
                    <button onClick={() => handleDeleteZamanlama(z.id)}
                      style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                      <Trash2 size={14} color="#dc2626" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        </div>{/* grid 2-sütun kapanış */}

        {/* Şablon Yönetimi — tam genişlik */}
        <div className="verde-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Rapor Şablonu</div>
            {sablonInfo.exists && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.green }}>
                <CheckCircle size={14} />
                <span>Şablon yüklü{sablonInfo.updatedAt ? ` · ${new Date(sablonInfo.updatedAt).toLocaleDateString('tr-TR')}` : ''}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input ref={fileRef} type="file" accept=".xlsx" onChange={handleUpload} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{
                height: 34, padding: '0 16px', borderRadius: 8,
                border: `1px solid ${T.border}`, background: '#fff', color: T.text,
                fontWeight: 700, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, opacity: uploading ? 0.6 : 1,
              }}>
              <Upload size={16} />
              {uploading ? 'Yükleniyor...' : 'Şablon Yükle (.xlsx)'}
            </button>
            {!sablonInfo.exists && (
              <span style={{ fontSize: 12, color: '#d97706' }}>Henüz şablon yüklenmemiş.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
