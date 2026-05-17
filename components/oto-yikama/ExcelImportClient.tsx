'use client'

import { useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react'

type Satir = { satir: number; plaka: string; lokasyon: string; tarih: string; hata?: string }
type Ozet = { okunan: number; eklenecek: number; hatali: number; duplicate: number; eklenen?: number }

type Preview = {
  ok: boolean
  dry_run?: boolean
  ozet: Ozet
  eklenecek_ornek?: Satir[]
  hatalilar: Satir[]
  duplicates: Satir[]
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  grayLight: '#f8fafc',
}

export default function ExcelImportClient() {
  const { firmaId } = useFirma()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [yukleniyor, setYukleniyor] = useState<'sablon' | 'preview' | 'import' | null>(null)

  async function sablonIndir() {
    if (!firmaId) return
    setYukleniyor('sablon')
    try {
      const res = await fetch(`/api/oto-yikama/gorevler/import-sablon?firma_id=${firmaId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Şablon oluşturulamadı')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'oto-yikama-gorev-sablon.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(null)
    }
  }

  function dosyaSec(f: File | null) {
    setFile(f)
    setPreview(null)
  }

  async function onizle() {
    if (!firmaId || !file) return
    setYukleniyor('preview')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firma_id', firmaId)
      fd.append('dry_run', '1')
      const res = await fetch('/api/oto-yikama/gorevler/import-excel', { method: 'POST', body: fd })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Önizleme başarısız')
      setPreview(j)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(null)
    }
  }

  async function importEt() {
    if (!firmaId || !file || !preview) return
    if (preview.ozet.eklenecek === 0) {
      toast({ type: 'error', title: 'Eklenecek satır yok', message: 'Tüm satırlar hatalı veya duplicate.' })
      return
    }
    const ok = await confirm({
      title: 'Toplu Görev Oluştur',
      message: `${preview.ozet.eklenecek} görev oluşturulacak.\n\nHatalı satır: ${preview.ozet.hatali}\nDuplicate (atlanan): ${preview.ozet.duplicate}\n\nDevam edilsin mi?`,
      confirmText: 'Oluştur',
      cancelText: 'Vazgeç',
    })
    if (!ok) return
    setYukleniyor('import')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('firma_id', firmaId)
      const res = await fetch('/api/oto-yikama/gorevler/import-excel', { method: 'POST', body: fd })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'İçe aktarım başarısız')
      toast({ type: 'success', title: 'Tamamlandı', message: `${j.ozet?.eklenen ?? 0} görev oluşturuldu` })
      setFile(null)
      setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(null)
    }
  }

  if (!firmaId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: T.textSoft }}>
        Önce üst bardan bir firma seçin.
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. ADIM: Şablon indir */}
      <div className="verde-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: T.blueLight, color: T.blue, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
            1
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 4 }}>Şablonu İndirin</div>
            <div style={{ fontSize: 13, color: T.textSoft, marginBottom: 10 }}>
              Boş şablon + firma plakaları + lokasyon listesi içerir. Şablona kendi verilerinizi yazın.
            </div>
            <button onClick={sablonIndir} disabled={yukleniyor !== null}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.blue}`, background: T.blueLight, color: T.blue, cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {yukleniyor === 'sablon'
                ? <><Loader2 size={14} className="spin" /> Hazırlanıyor…</>
                : <><Download size={14} /> Şablonu İndir (.xlsx)</>}
            </button>
          </div>
        </div>
      </div>

      {/* 2. ADIM: Dosya yükle */}
      <div className="verde-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: T.amberLight, color: T.amber, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
            2
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 4 }}>Doldurulmuş Excel'i Yükleyin</div>
            <div style={{ fontSize: 13, color: T.textSoft, marginBottom: 10 }}>
              3 sütun: <code style={{ background: T.grayLight, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>PLAKA</code>{' '}
              <code style={{ background: T.grayLight, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>LOKASYON</code>{' '}
              <code style={{ background: T.grayLight, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>TARIH (YYYY-MM-DD)</code>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={e => dosyaSec(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }} />
              <button onClick={() => inputRef.current?.click()} disabled={yukleniyor !== null}
                style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Upload size={14} /> Dosya Seç
              </button>
              {file && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: T.grayLight, fontSize: 12 }}>
                  <FileSpreadsheet size={14} color={T.green} />
                  <span style={{ fontWeight: 600 }}>{file.name}</span>
                  <span style={{ color: T.textSoft }}>({Math.round(file.size / 1024)} KB)</span>
                  <X size={12} style={{ cursor: 'pointer', color: T.red }} onClick={() => { dosyaSec(null); if (inputRef.current) inputRef.current.value = '' }} />
                </div>
              )}
              <button onClick={onizle} disabled={!file || yukleniyor !== null}
                style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.amber}`, background: T.amberLight, color: T.amber, cursor: !file ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, opacity: !file ? 0.5 : 1 }}>
                {yukleniyor === 'preview'
                  ? <><Loader2 size={14} className="spin" /> Önizleniyor…</>
                  : 'Önizle'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ADIM: Önizleme + Onayla */}
      {preview && (
        <div className="verde-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 999, background: T.greenLight, color: T.green, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
              3
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 10 }}>Önizleme & Onayla</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                <Stat label="Okunan" deger={preview.ozet.okunan} renk={T.text} />
                <Stat label="Eklenecek" deger={preview.ozet.eklenecek} renk={T.green} />
                <Stat label="Hatalı" deger={preview.ozet.hatali} renk={T.red} />
                <Stat label="Duplicate" deger={preview.ozet.duplicate} renk={T.amber} />
              </div>

              {preview.eklenecek_ornek && preview.eklenecek_ornek.length > 0 && (
                <SatirTablo baslik={`Eklenecek satırlar (ilk ${preview.eklenecek_ornek.length})`}
                  satirlar={preview.eklenecek_ornek as any} renk={T.green} icon={<CheckCircle2 size={14} />} />
              )}
              {preview.hatalilar.length > 0 && (
                <SatirTablo baslik={`Hatalı satırlar (ilk ${preview.hatalilar.length})`}
                  satirlar={preview.hatalilar} renk={T.red} icon={<AlertTriangle size={14} />} />
              )}
              {preview.duplicates.length > 0 && (
                <SatirTablo baslik={`Duplicate satırlar (ilk ${preview.duplicates.length})`}
                  satirlar={preview.duplicates} renk={T.amber} icon={<AlertTriangle size={14} />} />
              )}

              <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={importEt} disabled={yukleniyor !== null || preview.ozet.eklenecek === 0}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none',
                    background: preview.ozet.eklenecek > 0 ? T.green : T.border,
                    color: '#fff', cursor: preview.ozet.eklenecek > 0 ? 'pointer' : 'not-allowed',
                    fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {yukleniyor === 'import'
                    ? <><Loader2 size={14} className="spin" /> Oluşturuluyor…</>
                    : <>{preview.ozet.eklenecek} Görevi Oluştur</>}
                </button>
                <span style={{ fontSize: 12, color: T.textSoft }}>
                  Hatalı ve duplicate satırlar atlanır, sadece eklenecek olanlar oluşturulur.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .spin { animation: spin 0.9s linear infinite; }
      `}</style>
    </div>
  )
}

function Stat({ label, deger, renk }: { label: string; deger: number; renk: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: T.grayLight, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: renk }}>{deger}</div>
    </div>
  )
}

function SatirTablo({ baslik, satirlar, renk, icon }: { baslik: string; satirlar: Satir[]; renk: string; icon: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: renk, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon} {baslik}
      </div>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 220, overflow: 'auto' }}>
        <table className="verde-table" style={{ minWidth: 600, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>Sat.</th>
              <th style={{ width: 110 }}>Plaka</th>
              <th>Lokasyon</th>
              <th style={{ width: 100 }}>Tarih</th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map(s => (
              <tr key={`${s.satir}-${s.plaka}-${s.tarih}`}>
                <td style={{ color: T.textSoft }}>{s.satir}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.plaka}</td>
                <td style={{ color: T.textSoft }}>{s.lokasyon}</td>
                <td style={{ fontFamily: 'monospace', color: T.textSoft }}>{s.tarih}</td>
                <td style={{ color: renk, fontSize: 11 }}>{s.hata ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
