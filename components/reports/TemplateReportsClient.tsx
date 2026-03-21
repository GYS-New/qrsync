'use client'

import { ArrowRight, BarChart2, ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'

interface Props {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}

export default function TemplateReportsClient({ base }: Props) {
  const router = useRouter()

  const kartlar = [
    {
      id: 'frekansiyel',
      eyebrow: 'ŞABLON TABANLI',
      badge: 'Excel + PDF',
      title: 'Frekansiyel Görevler Raporu',
      description: 'Genel Rapor Şablonu: lokasyon, grup ve personel bazlı frekans analizi, sapma ve kayıp görevler.',
      icon: <BarChart2 size={22} />,
      tone: 'green' as const,
      path: `${base}/dashboard/raporlar/ozellestir/frekansiyel`,
    },
    {
      id: 'spesifik',
      eyebrow: 'ŞABLON TABANLI',
      badge: 'Excel + PDF',
      title: 'Spesifik Görevler Raporu',
      description: 'Personel bazlı görev dağılımı, tamamlanma süreleri, başarı oranları ve lokasyon analizi.',
      icon: <ClipboardList size={22} />,
      tone: 'blue' as const,
      path: `${base}/dashboard/raporlar/ozellestir/spesifik`,
    },
  ]

  const toneMap = {
    green: { iconBg: '#f0f9f0', iconColor: '#1f6b1f', chipBg: '#eef8ee', chipText: '#2f6a2f', border: '#d6e4d6' },
    blue:  { iconBg: '#eff6ff', iconColor: '#1d4ed8', chipBg: '#eff6ff', chipText: '#1d4ed8', border: '#bfdbfe' },
  }

  return (
    <div>
      <Topbar title="Rapor Özelleştir" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Rapor Özelleştir' }]} />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {kartlar.map(k => {
          const p = toneMap[k.tone]
          return (
            <div key={k.id} className="verde-card"
              onClick={() => router.push(k.path)}
              style={{
                padding: 20, display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center', gap: 18, cursor: 'pointer',
                border: `1px solid ${p.border}`, transition: 'transform .15s, box-shadow .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(15,40,15,0.10)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 12, background: p.iconBg, border: `1px solid ${p.border}`, display: 'grid', placeItems: 'center', color: p.iconColor, flexShrink: 0 }}>
                {k.icon}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: p.chipBg, color: p.chipText, letterSpacing: 0.3 }}>{k.eyebrow}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f0f9f0', color: '#506050', border: '1px solid #d6e4d6' }}>{k.badge}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1a0f', marginBottom: 4 }}>{k.title}</div>
                <div style={{ fontSize: 13.5, color: '#506050', lineHeight: 1.5 }}>{k.description}</div>
              </div>
              <div style={{ color: p.iconColor, flexShrink: 0 }}><ArrowRight size={20} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
