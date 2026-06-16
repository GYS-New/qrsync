'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'
import UserAvatar from '@/components/layout/UserAvatar'

export default function UserPanel({ base }: { base: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [me, setMe] = useState<User | null>(null)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (active) setMe((data as any) ?? null)
    })()
    return () => { active = false }
  }, [supabase])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return
      const el = panelRef.current
      if (el && !el.contains(e.target as any)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function logout() {
    // Scope cookie'leri ve localStorage'ı temizle — başka kullanıcı/rol ile
    // giriş yapıldığında önceki seçim (firma, proje, üst lokasyon, modül) sızmasın
    try {
      const cookieNames = [
        'qrsync_sa_firma_id',
        'qrsync_aktif_proje_id',
        'qrsync_aktif_ust_lokasyon_id',
        'iogys_aktif_modul',
      ]
      for (const n of cookieNames) {
        document.cookie = `${n}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
      localStorage.removeItem('qrsync_sa_firma_id')
    } catch {}
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function modulDegistir() {
    // Server tarafında cookie sil + /modul-sec'e dön
    await fetch('/api/modul/sec', { method: 'DELETE' }).catch(() => {})
    // Client tarafı cookie temizleme (httpOnly olmadığı için her ikisi de gerekir)
    try {
      document.cookie = 'iogys_aktif_modul=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
    } catch {}
    router.push('/modul-sec')
  }

  const displayName = me?.isim_soyisim ?? 'Kullanıcı'
  const photoUrl = (me as any)?.profil_foto ?? undefined

  const isTA = base === '/ta'

  const items = isTA
    ? [
        { label: 'Profil Ayarları', href: `${base}/dashboard/ayarlar` },
        { label: 'Firma Ayarları', href: `${base}/dashboard/firma-ayarlar` },
        { label: 'Dashboard Ayarları', href: `${base}/dashboard/ayarlar/dashboard` },
      ]
    : [
        { label: 'Ayarlar', href: `${base}/dashboard/ayarlar` },
        { label: 'Dashboard Ayarları', href: `${base}/dashboard/ayarlar/dashboard` },
      ]

  return (
    <div ref={panelRef} style={{ position:'relative', display:'flex', alignItems:'center' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display:'flex', alignItems:'center', gap:8,
          border:'1px solid #e5e7eb', background:'#fff', borderRadius:10,
          padding:'4px 10px', height:41, cursor:'pointer'
        }}
      >
        <UserAvatar name={displayName} photoUrl={photoUrl} size={32} />
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', lineHeight:1.1 }}>
          <div style={{ fontSize:15, fontWeight:600, color:'#111827', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {displayName}
          </div>
          <div style={{ fontSize:13, color:'#6b7280' }}>{me?.email ?? ''}</div>
        </div>
        <span style={{ marginLeft:4, fontSize:15, color:'#6b7280' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position:'absolute', right:0, top:40, width:220,
          background:'#fff', border:'1px solid #e5e7eb', borderRadius:12,
          boxShadow:'0 12px 30px rgba(0,0,0,0.08)', overflow:'hidden', zIndex:50
        }}>
          <div style={{ padding:'10px 12px', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#111827' }}>{displayName}</div>
            <div style={{ fontSize:13, color:'#6b7280', overflow:'hidden', textOverflow:'ellipsis' }}>{me?.email ?? ''}</div>
          </div>

          <div style={{ padding:6 }}>
            {items.map((it, idx) => (
              <button
                key={it.href}
                type="button"
                onClick={() => { setOpen(false); router.push(it.href) }}
                style={{
                  width:'100%', textAlign:'left', padding:'8px 10px',
                  border:'none', background:'transparent', cursor:'pointer',
                  borderRadius:8, fontSize:14.5, color:'#374151'
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {it.label}
              </button>
            ))}
            <div style={{ height:1, background:'#f3f4f6', margin:'6px 6px' }} />
            <button
              type="button"
              onClick={() => { setOpen(false); modulDegistir() }}
              style={{
                width:'100%', textAlign:'left', padding:'8px 10px',
                border:'none', background:'transparent', cursor:'pointer',
                borderRadius:8, fontSize:14.5, color:'#374151'
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              Modül Değiştir
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); logout() }}
              style={{
                width:'100%', textAlign:'left', padding:'8px 10px',
                border:'none', background:'transparent', cursor:'pointer',
                borderRadius:8, fontSize:14.5, color:'#b91c1c'
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
