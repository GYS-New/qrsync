'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const DashboardSettingsClient = dynamic(() => import('@/components/dashboard/DashboardSettingsClient'), { ssr: false })
const GorevSureleriClient = dynamic(() => import('./GorevSureleriClient'), { ssr: false })
const FrekansSayilariClient = dynamic(() => import('./FrekansSayilariClient'), { ssr: false })
const GenelAyarlarClient = dynamic(() => import('./GenelAyarlarClient'), { ssr: false })
const GorevKurallariClient = dynamic(() => import('@/components/gorev-kurallari/GorevKurallariClient'), { ssr: false })
const GrupYetkileriClient = dynamic(() => import('@/components/ayarlar/GrupYetkileriClient'), { ssr: false })

type Tab = 'genel' | 'frekans' | 'gorev-kurallari' | 'gorev-sureleri' | 'yetkiler' | 'smtp' | 'dashboard'

const BASE_TABS: { key: Tab; label: string; saOnly?: boolean }[] = [
  { key: 'genel',          label: 'Genel Ayarlar'   },
  { key: 'frekans',        label: 'Frekans Sayıları' },
  { key: 'gorev-kurallari',label: 'Görev Kuralları'  },
  { key: 'gorev-sureleri', label: 'Görev Süreleri'   },
  { key: 'yetkiler',       label: 'Kullanıcı Yetkileri' },
  { key: 'smtp',           label: 'Mail Sunucusu', saOnly: true },
  { key: 'dashboard',      label: 'Dashboard'        },
]

interface LokasyonRow {
  id: string
  tanim: string
  parent_id?: string | null
  min_sure_dakika?: number | null
  max_sure_dakika?: number | null
  aktif: boolean
}

interface Props {
  meId: string
  base: '/sa' | '/ta'
  initialBloklar: any[]
  lokasyonlar: LokasyonRow[]
  kullanicilar: { id: string; isim_soyisim: string }[]
  isSA?: boolean
  firmaId?: string | null
  projeId?: string | null
  readonly?: boolean
  personelAtamaAktif?: boolean
  // Yetki props
  initialYetkileri?: any[]
  firmalar?: any[]
  yetkilLimitRoller?: string[]
  yetkiGizliSayfalar?: string[]
  yetkiApiEndpoint?: string
}

export default function SistemAyarlariClient({ meId, base, initialBloklar, lokasyonlar, kullanicilar, isSA = false, firmaId, projeId, readonly = false, personelAtamaAktif = true, initialYetkileri = [], firmalar = [], yetkilLimitRoller, yetkiGizliSayfalar, yetkiApiEndpoint }: Props) {
  const [aktifTab, setAktifTab] = useState<Tab>('genel')

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '2px solid #e5e7eb',
          marginBottom: 28,
          overflowX: 'auto',
        }}
      >
        {BASE_TABS.filter(tab => !tab.saOnly || isSA).map(tab => (
          <button
            key={tab.key}
            onClick={() => setAktifTab(tab.key)}
            style={{
              padding: '9px 18px',
              fontSize: 14,
              fontWeight: aktifTab === tab.key ? 700 : 500,
              color: aktifTab === tab.key ? '#1a5c2a' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottom: aktifTab === tab.key ? '2px solid #1a5c2a' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab içerikleri */}
      {aktifTab === 'genel' && <GenelAyarlarClient isSA={isSA} firmaId={firmaId} projeId={projeId} kullanicilar={kullanicilar} />}
      {aktifTab === 'frekans' && <FrekansSayilariClient lokasyonlar={lokasyonlar as any} />}
      {aktifTab === 'gorev-kurallari' && firmaId && (
        <GorevKurallariClient
          base={base}
          firmaId={firmaId}
          meId={meId}
          initialKuralar={[]}
          lokasyonlar={lokasyonlar}
          kullanicilar={kullanicilar}
          readonly={readonly}
          embedded={true}
          projeId={projeId}
          personelAtamaAktif={personelAtamaAktif}
        />
      )}
      {aktifTab === 'gorev-sureleri' && <GorevSureleriClient lokasyonlar={lokasyonlar} />}
      {aktifTab === 'yetkiler' && (
        <GrupYetkileriClient
          initialYetkileri={initialYetkileri}
          firmaId={firmaId}
          apiEndpoint={yetkiApiEndpoint}
          limitRoller={yetkilLimitRoller}
          gizliSayfalar={yetkiGizliSayfalar}
          firmalar={isSA ? firmalar : undefined}
          currentPath={`${base}/dashboard/sistem-ayarlari`}
        />
      )}
      {aktifTab === 'smtp' && isSA && <SmtpAyarlariPanel />}
      {aktifTab === 'dashboard' && (
        <DashboardSettingsClient meId={meId} initialBloklar={initialBloklar} />
      )}
    </div>
  )
}

function SmtpAyarlariPanel() {
  const [form, setForm] = useState({ smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_secure: false, smtp_user: '', smtp_pass: '', smtp_from: '', aktif: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sistem-ayarlari/smtp')
      .then(r => r.json())
      .then(j => { if (j.smtp_host) setForm(j); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/smtp', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setTestResult('Ayarlar kaydedildi.')
    } catch (e: any) { setTestResult('Hata: ' + e.message) }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch('/api/sistem-ayarlari/smtp', { method: 'POST' })
      const j = await res.json()
      if (j.skipped) setTestResult('SMTP ayarları eksik — mail gönderilemedi.')
      else if (j.ok) setTestResult('Test maili gönderildi! Gelen kutunuzu kontrol edin.')
      else setTestResult('Hata: ' + (j.error ?? 'Bilinmeyen hata'))
    } catch (e: any) { setTestResult('Hata: ' + e.message) }
    setTesting(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#7a907a' }}>Yükleniyor...</div>

  const sinp: React.CSSProperties = { height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, width: '100%' }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: '#1d4ed8' }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Mail Sunucusu (SMTP)</h3>
      </div>
      <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12.5, color: '#1e40af', lineHeight: 1.6, marginBottom: 16 }}>
        Otomatik rapor gönderimi ve sistem bildirimleri için SMTP ayarları.
        Gmail kullanıyorsanız "Uygulama Şifresi" oluşturmanız gerekir (Google Hesap &gt; Güvenlik &gt; 2FA &gt; Uygulama Şifreleri).
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>SMTP Sunucu</span>
            <input value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} style={sinp} placeholder="smtp.gmail.com" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Port</span>
            <input type="number" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: Number(e.target.value) || 587 }))} style={sinp} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>SSL/TLS</span>
            <select value={form.smtp_secure ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, smtp_secure: e.target.value === 'true' }))} style={sinp}>
              <option value="false">Hayır (587)</option>
              <option value="true">Evet (465)</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Kullanıcı (E-posta)</span>
            <input value={form.smtp_user} onChange={e => setForm(f => ({ ...f, smtp_user: e.target.value }))} style={sinp} placeholder="sender@gmail.com" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Şifre / Uygulama Şifresi</span>
            <input type="password" value={form.smtp_pass} onChange={e => setForm(f => ({ ...f, smtp_pass: e.target.value }))} style={sinp} placeholder="••••••••" />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Gönderen Adres (From)</span>
          <input value={form.smtp_from} onChange={e => setForm(f => ({ ...f, smtp_from: e.target.value }))} style={sinp} placeholder="boşsa kullanıcı adresi kullanılır" />
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ height: 38, padding: '0 20px', borderRadius: 8, background: '#1a5c2a', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button onClick={handleTest} disabled={testing}
            style={{ height: 38, padding: '0 20px', borderRadius: 8, background: '#fff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: testing ? 0.6 : 1 }}>
            {testing ? 'Gönderiliyor...' : 'Test Mail Gönder'}
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: testResult.includes('Hata') || testResult.includes('eksik') ? '#fef2f2' : '#f0fdf4', color: testResult.includes('Hata') || testResult.includes('eksik') ? '#dc2626' : '#1a5c2a', fontWeight: 600 }}>
            {testResult}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        color: '#9ca3af',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.4 }}>⚙</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 14 }}>Bu sekme yakında yapılandırılacak.</div>
    </div>
  )
}
