'use client'

import type { Lokasyon } from '@/types'
import Button from '@/components/ui/Button'

interface Props {
  lokasyon: Lokasyon | null
  onClose: () => void
}

export default function NfcBilgiModal({ lokasyon, onClose }: Props) {
  if (!lokasyon) return null

  const token = lokasyon.nfc_token ?? ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const nfcLink = token ? `${origin}/nfc/${token}` : ''

  async function copyText(value: string, success: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      alert(success)
    } catch {
      alert('Kopyalama başarısız')
    }
  }

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}
    >
      <div
        style={{ background:'#fff', borderRadius:7, border:'1px solid #d6e4d6', padding:28, minWidth:420, maxWidth:620, boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#0f1a0f' }}>NFC Bilgisi</div>
            <div style={{ fontSize:12, color:'#7a907a', marginTop:2 }}>{lokasyon.tanim}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} style={{ padding:'4px 10px', fontSize:12 }}>✕</Button>
        </div>

        {!token ? (
          <div style={{ padding:'24px 0', textAlign:'center', color:'#7a907a' }}>
            Bu lokasyon için henüz NFC token tanımlanmamış.
          </div>
        ) : (
          <div style={{ display:'grid', gap:14 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#395339', marginBottom:6 }}>NFC Token</div>
              <div style={{ fontSize:12, fontFamily:'monospace', wordBreak:'break-all', padding:'10px 12px', background:'#f7f9f7', border:'1px solid #e8f0e8', borderRadius:6 }}>{token}</div>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#395339', marginBottom:6 }}>NFC Linki</div>
              <div style={{ fontSize:12, fontFamily:'monospace', wordBreak:'break-all', padding:'10px 12px', background:'#f7f9f7', border:'1px solid #e8f0e8', borderRadius:6 }}>{nfcLink}</div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <Button variant="primary" onClick={() => copyText(token, 'NFC token kopyalandı')}>Token Kopyala</Button>
              <Button variant="ghost" onClick={() => copyText(nfcLink, 'NFC linki kopyalandı')}>Link Kopyala</Button>
              <Button variant="ghost" onClick={onClose}>Kapat</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
