'use client'

import { useEffect, useState } from 'react'
import { generateQRCode } from '@/lib/qr/generate'
import type { Lokasyon } from '@/types'
import Button from '@/components/ui/Button'

interface QrModalProps {
  lokasyon: Lokasyon | null
  onClose: () => void
}

export default function QrKodModal({ lokasyon, onClose }: QrModalProps) {
  const [qrUrl, setQrUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!lokasyon) return
    if (!lokasyon.aktif) { setQrUrl(''); return }
    setLoading(true)
    const targetUrl = `${window.location.origin}/qr/${lokasyon.qr_veri}`
    generateQRCode(targetUrl).then(url => {
      setQrUrl(url)
      setLoading(false)
    }).catch(error => {
      console.error('QR kod oluşturma hatası:', error)
      setLoading(false)
    })
  }, [lokasyon])

  if (!lokasyon) return null

  function downloadQR() {
    if (!qrUrl) return
    const a = document.createElement('a')
    a.href = qrUrl
    a.download = `qr-${lokasyon!.tanim.replace(/\s+/g, '-')}.png`
    a.click()
  }

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}
    >
      <div
        style={{ background:'#fff', borderRadius:7, border:'1px solid #e5e7eb', padding:28, minWidth:340, boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#111827' }}>QR Kod</div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>{lokasyon.tanim}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} style={{ padding:'4px 10px', fontSize:12 }}>✕</Button>
        </div>

        {!lokasyon.aktif ? (
          <div style={{ padding:'32px 0', textAlign:'center' }}>
            <div style={{ fontSize:24, marginBottom:8 }}>⚠️</div>
            <div style={{ color:'#b91c1c', fontWeight:600, fontSize:13 }}>Lokasyon Pasif</div>
            <div style={{ color:'#6b7280', fontSize:12, marginTop:4 }}>Pasif lokasyonların QR kodu gösterilmez.</div>
          </div>
        ) : loading ? (
          <div style={{ padding:'48px 0', textAlign:'center', color:'#6b7280' }}>QR kod oluşturuluyor...</div>
        ) : (
          <div style={{ textAlign:'center' }}>
            <div style={{ padding:16, background:'#f9fafb', borderRadius:7, border:'1px solid #e5e7eb', display:'inline-block', marginBottom:16 }}>
              <img src={qrUrl} alt="QR Kod" style={{ width:220, height:220, display:'block' }} />
            </div>
            <div style={{ fontSize:11, color:'#6b7280', marginBottom:16, fontFamily:'monospace', wordBreak:'break-all', padding:'8px 12px', background:'#fafafa', borderRadius:5, border:'1px solid #f3f4f6' }}>
{`${typeof window !== 'undefined' ? window.location.origin : ''}/qr/${lokasyon.qr_veri}`}
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <Button variant="primary" onClick={downloadQR}>⬇ PNG İndir</Button>
              <Button variant="ghost" onClick={onClose}>Kapat</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
