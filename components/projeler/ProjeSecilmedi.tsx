'use client'

import { useProje } from './ProjeContext'
import { Layers } from 'lucide-react'

export default function ProjeSecilmedi({ mesaj }: { mesaj?: string }) {
  const { projeler, setAktifProje } = useProje()

  return (
    <div style={{ padding: 24 }}>
      <div className="verde-card" style={{ padding: 40, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f9fafb', border: '1px solid #e5e7eb', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <Layers size={26} style={{ color: '#374151' }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
          Proje Seçilmedi
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          {mesaj ?? 'Bu sayfayı kullanmak için önce bir proje seçmelisiniz. Aşağıdan projenizi seçin veya sol menüden yeni proje oluşturun.'}
        </div>

        {projeler.length === 0 ? (
          <div style={{ fontSize: 13, color: '#d1d5db' }}>
            Henüz proje yok. Sol menüden "Projeler" sayfasına giderek ilk projenizi oluşturun.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, margin: '0 auto' }}>
            {projeler.map(p => (
              <button
                key={p.id}
                onClick={() => setAktifProje(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 10,
                  border: `1px solid ${p.renk ?? '#e5e7eb'}40`,
                  background: `${p.renk ?? '#374151'}08`,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'transform .1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.renk ?? '#374151', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{p.ad}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
