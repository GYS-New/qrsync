'use client'

import { useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'

type Entity = 'users' | 'locations' | 'live-tasks'

const ENTITY_LABEL: Record<Entity, string> = {
  users: 'Kullanıcı',
  locations: 'Lokasyon',
  'live-tasks': 'Canlı Görev',
}

const ENTITY_HELP: Record<Entity, string[]> = {
  users: [
    'Şablondaki kolon adlarını değiştirmeyin.',
    'Her satır yeni bir tenant_user oluşturur.',
    'Şifre alanı en az 6 karakter olmalıdır.',
  ],
  locations: [
    'parent_yol boşsa kök lokasyon oluşur.',
    'Alt lokasyon için parent_yol değerini tam yol olarak yazın.',
    'NFC ve QR tokenleri otomatik üretilir; checklist bağlanmaz.',
  ],
  'live-tasks': [
    'lokasyon_yolu tam yol olmalıdır.',
    'atanan_email boş bırakılabilir.',
    'aktif_olma_tarihi için örnek format: 2026-03-08 09:00',
  ],
}

export default function ExcelImportExportControls({
  entity,
  firmaId,
  disabled,
  onImported,
}: {
  entity: Entity
  firmaId?: string | null
  disabled?: boolean
  onImported?: () => void | Promise<void>
}) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const query = useMemo(() => (firmaId ? `?firmaId=${encodeURIComponent(firmaId)}` : ''), [firmaId])
  const templateHref = `/api/import-export/${entity}?mode=template${query}`
  const exportHref = `/api/import-export/${entity}?mode=export${query}`
  const isDisabled = disabled || !firmaId

  async function submitImport() {
    if (!file) {
      toast({ type: 'error', title: 'Dosya seçilmedi', message: 'Lütfen önce şablon dosyanızı seçin.' })
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (firmaId) formData.append('firmaId', firmaId)

      const res = await fetch(`/api/import-export/${entity}`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'İçe aktarma başarısız')

      const errorPreview = Array.isArray(data.errors) && data.errors.length
        ? ` ${data.errors.slice(0, 3).join(' | ')}`
        : ''

      toast({
        type: data.errors?.length ? 'success' : 'success',
        title: 'İçe aktarma tamamlandı',
        message: `${data.importedCount ?? 0} kayıt eklendi.${data.errors?.length ? ` ${data.errors.length} satır atlandı.${errorPreview}` : ''}`,
      })

      setOpen(false)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await onImported?.()
    } catch (error: any) {
      toast({ type: 'error', title: 'İçe aktarma başarısız', message: error?.message ?? 'Hata oluştu.' })
    }
    setLoading(false)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href={templateHref} aria-disabled={isDisabled} onClick={(e) => isDisabled && e.preventDefault()}>
          <Button variant="ghost" size="sm" type="button" disabled={isDisabled}>
            ⬇ Excel Şablonu
          </Button>
        </a>
        <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(true)} disabled={isDisabled}>
          ⬆ Excel ile Ekle
        </Button>
        <a href={exportHref} aria-disabled={isDisabled} onClick={(e) => isDisabled && e.preventDefault()}>
          <Button variant="ghost" size="sm" type="button" disabled={isDisabled}>
            ⇩ Excel’e Aktar
          </Button>
        </a>
      </div>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !loading && setOpen(false)}
        >
          <div className="verde-card" style={{ width: 640, maxWidth: 'calc(100vw - 32px)', padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #ffe8c8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{ENTITY_LABEL[entity]} Excel İçe Aktar</div>
              <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)} disabled={loading}>✕</Button>
            </div>
            <div style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ fontSize: 13, color: '#486348', lineHeight: 1.6 }}>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>İşlem adımları</div>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Önce Excel şablonunu indirip doldurun.</li>
                  <li>Dosyayı Excel XML formatında saklayın ve buradan yükleyin.</li>
                  <li>Sistem hatalı satırları atlar, geçerli satırları içe aktarır.</li>
                </ol>
              </div>

              <div style={{ background: '#f6fbf6', border: '1px solid #d6e9d6', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Kurallar</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#587058', lineHeight: 1.6 }}>
                  {ENTITY_HELP[entity].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="verde-label">Excel XML dosyası</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="verde-input"
                  style={{ padding: 10, height: 'auto' }}
                />
                <div style={{ marginTop: 6, fontSize: 12, color: '#9a7b6a' }}>
                  Desteklenen format: Excel 2003 XML (.xml)
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={loading}>İptal</Button>
                <Button variant="primary" type="button" onClick={submitImport} disabled={loading || !file}>
                  {loading ? 'Aktarılıyor…' : 'İçe Aktar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
