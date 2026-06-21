'use client'

import { LogOut, ShieldAlert } from 'lucide-react'

export default function ErisimYokEkran({ isim, email }: { isim: string | null; email: string | null }) {
  function logout() {
    // Server-side full logout endpoint — Supabase signOut + scope cookie temizleme
    // + /login'e yönlendirme. UserPanel'deki çıkış akışıyla aynı.
    window.location.href = '/api/auth/full-logout'
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      padding: 20,
    }}>
      <div style={{
        maxWidth: 460, width: '100%',
        background: '#fff', padding: 32, borderRadius: 14,
        border: '1px solid rgba(79,106,255,.15)',
        boxShadow: '0 14px 40px rgba(26,31,54,0.10)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#fef3c7', color: '#d97706',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <ShieldAlert size={28} strokeWidth={2.2} />
        </div>

        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginBottom: 6 }}>
          Erişim Yok
        </div>
        <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.55, marginBottom: 20 }}>
          Hesabınıza tanımlı erişim yapılabilir bir modül bulunamadı.
          Yöneticinize başvurun veya farklı bir hesapla giriş yapın.
        </div>

        {/* Kullanıcı bilgisi — yanlış hesapla girip girmediğini görmek için */}
        {(isim || email) && (
          <div style={{
            background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
            marginBottom: 16, textAlign: 'left',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2 }}>
              Giriş yapan
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{isim ?? '—'}</div>
            {email && <div style={{ fontSize: 12, color: '#64748b' }}>{email}</div>}
          </div>
        )}

        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2"
          style={{
            width: '100%',
            padding: '11px 18px',
            background: 'linear-gradient(145deg, #1a1f36, #4F6AFF)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 6px 16px rgba(79,106,255,.22)',
          }}
        >
          <LogOut size={16} /> Çıkış Yap
        </button>
      </div>
    </div>
  )
}
