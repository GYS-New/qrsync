'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { Download, FileSpreadsheet, Upload, CheckCircle } from 'lucide-react'

interface Props {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}

const T = {
  green: '#1a5c2a', greenMid: '#2e8b2e', border: '#e2e8f0', text: '#0f172a',
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

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>

        {/* Başlık kartı */}
        <div className="verde-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f0fdf4', display: 'grid', placeItems: 'center' }}>
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

        {/* Şablon Yönetimi */}
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

          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.6, marginBottom: 12 }}>
            Rapor çıktısı bu şablon üzerine oluşturulur. Şablonun yapısı (sayfalar, başlıklar, formatlar) korunarak
            veriler ilgili hücrelere doldurulur. Yeni bir şablon yükleyerek rapor formatını değiştirebilirsiniz.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input ref={fileRef} type="file" accept=".xlsx" onChange={handleUpload} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{
                height: 38, padding: '0 20px', borderRadius: 8,
                border: `1px solid ${T.border}`, background: '#fff', color: T.text,
                fontWeight: 700, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, opacity: uploading ? 0.6 : 1,
              }}>
              <Upload size={16} />
              {uploading ? 'Yükleniyor...' : 'Şablon Yükle (.xlsx)'}
            </button>
            {!sablonInfo.exists && (
              <span style={{ fontSize: 12, color: '#d97706' }}>Henüz şablon yüklenmemiş — varsayılan şablon kullanılacak.</span>
            )}
          </div>

          {/* Sayfa bilgileri */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textSoft, marginBottom: 6 }}>Şablon Sayfaları:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[
                { sayfa: 'Giriş', desc: 'Parametreler, göstergeler, hakediş' },
                { sayfa: 'Tamamlanan Frekanslar', desc: 'Detaylı görev listesi' },
                { sayfa: 'Sapmalar', desc: 'Zamanında yapılamayanlar' },
                { sayfa: 'Kayıp Frekanslar', desc: 'Gerçekleşmeyenler' },
                { sayfa: 'Gruplar', desc: 'Grup bazlı özet' },
                { sayfa: 'Frekans Fazlası', desc: 'Ek çalışmalar' },
              ].map(({ sayfa, desc }) => (
                <div key={sayfa} style={{ padding: '8px 10px', background: T.grayLight, borderRadius: 6, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.green }}>{sayfa}</div>
                  <div style={{ fontSize: 10.5, color: T.textSoft, marginTop: 1 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
