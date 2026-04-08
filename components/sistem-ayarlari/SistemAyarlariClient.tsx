'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const DashboardSettingsClient = dynamic(() => import('@/components/dashboard/DashboardSettingsClient'), { ssr: false })
const GorevSureleriClient = dynamic(() => import('./GorevSureleriClient'), { ssr: false })
const FrekansSayilariClient = dynamic(() => import('./FrekansSayilariClient'), { ssr: false })
const GenelAyarlarClient = dynamic(() => import('./GenelAyarlarClient'), { ssr: false })
const GorevKurallariClient = dynamic(() => import('@/components/gorev-kurallari/GorevKurallariClient'), { ssr: false })
const GrupYetkileriClient = dynamic(() => import('@/components/ayarlar/GrupYetkileriClient'), { ssr: false })

type Tab = 'genel' | 'proje-ayarlari' | 'frekans' | 'gorev-kurallari' | 'gorev-sureleri' | 'yetkiler' | 'simulasyon' | 'uygulama' | 'mobil' | 'smtp' | 'konfigurasyon' | 'dashboard'

const BASE_TABS: { key: Tab; label: string; saOnly?: boolean }[] = [
  { key: 'genel',          label: 'Genel Ayarlar'   },
  { key: 'proje-ayarlari', label: 'Proje Ayarları'  },
  { key: 'frekans',        label: 'Frekans Sayıları' },
  { key: 'gorev-kurallari',label: 'Görev Kuralları'  },
  { key: 'gorev-sureleri', label: 'Görev Süreleri'   },
  { key: 'yetkiler',       label: 'Kullanıcı Yetkileri' },
  { key: 'simulasyon',     label: 'Simülasyon Modu'  },
  { key: 'uygulama',       label: 'Uygulama Ayarları', saOnly: true },
  { key: 'mobil',          label: 'Mobil Ayarlar', saOnly: true },
  { key: 'smtp',           label: 'Mail Sunucusu', saOnly: true },
  { key: 'konfigurasyon',  label: 'Sistem Konfigürasyonu', saOnly: true },
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
              color: aktifTab === tab.key ? '#111827' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottom: aktifTab === tab.key ? '2px solid #111827' : '2px solid transparent',
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
      {aktifTab === 'proje-ayarlari' && projeId && <ProjeAyarlariPanel projeId={projeId} />}
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
      {aktifTab === 'simulasyon' && firmaId && <SimulasyonPanel firmaId={firmaId} projeId={projeId ?? null} lokasyonlar={lokasyonlar as any} />}
      {aktifTab === 'uygulama' && isSA && <UygulamaAyarlariPanel />}
      {aktifTab === 'mobil' && isSA && <MobilAyarlariPanel />}
      {aktifTab === 'smtp' && isSA && <SmtpAyarlariPanel />}
      {aktifTab === 'konfigurasyon' && isSA && <SistemKonfigurasyonPanel />}
      {aktifTab === 'dashboard' && (
        <DashboardSettingsClient meId={meId} initialBloklar={initialBloklar} />
      )}
    </div>
  )
}

function ProjeAyarlariPanel({ projeId }: { projeId: string }) {
  const [proje, setProje] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projeler/${projeId}`)
      .then(r => r.json())
      .then(j => { setProje(j); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projeId])

  const toggle = async (field: string, current: boolean) => {
    setSavingKey(field)
    try {
      if (field === 'sureli_gorev_aktif') {
        // Süreli görev özel endpoint — lokasyonları toplu günceller
        const res = await fetch(`/api/projeler/${projeId}/toggle-sureli-gorev`, { method: 'POST' })
        const j = await res.json()
        if (res.ok) setProje((p: any) => ({ ...p, sureli_gorev_aktif: j.sureli_aktif ?? !current }))
      } else {
        const res = await fetch(`/api/projeler/${projeId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: !current }),
        })
        if (res.ok) setProje((p: any) => ({ ...p, [field]: !current }))
      }
    } catch {}
    setSavingKey(null)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
  if (!proje) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Proje bulunamadı.</div>

  const items: { key: string; label: string; desc: string; icon: string }[] = [
    { key: 'aktif', label: 'Proje Durumu', desc: 'Proje aktif/pasif durumu. Pasif projeler kullanıcılar tarafından görüntülenemez.', icon: '🔄' },
    { key: 'personel_takibi_aktif', label: 'Personel Takibi', desc: 'Personel mesai giriş/çıkış takibi. Aktif olduğunda QR/NFC ile mesai okutma yapılabilir.', icon: '👷' },
    { key: 'qr_sistemi_aktif', label: 'QR Sistemi', desc: 'QR kod ile görev başlatma, tamamlama ve mesai okutma.', icon: '📷' },
    { key: 'nfc_sistemi_aktif', label: 'NFC Sistemi', desc: 'NFC tag ile görev başlatma, tamamlama ve mesai okutma.', icon: '📶' },
    { key: 'birim_fiyat_aktif', label: 'Birim Fiyat Sistemi', desc: 'Lokasyon ve gruplar için birim fiyat tanımlama ve hakediş hesaplama.', icon: '💰' },
    { key: 'sureli_gorev_aktif', label: 'Süreli Görev Takibi', desc: 'Projedeki tüm lokasyonlarda süreli görev takibini toplu aç/kapat. Aktif olduğunda görev başlatma ve tamamlanma süreleri ölçülür.', icon: '⚡' },
  ]

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: '#1d4ed8' }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Proje Ayarları — {proje.ad}</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => {
          const val = proje[item.key] ?? false
          const busy = savingKey === item.key
          return (
            <div key={item.key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.label}</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
              <button
                onClick={() => toggle(item.key, val)}
                disabled={busy}
                style={{
                  width: 52, height: 28, borderRadius: 14, border: 'none',
                  cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0,
                  background: val ? '#111827' : '#cbd5e1', position: 'relative', transition: 'background .2s',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: '#fff', position: 'absolute', top: 3,
                  left: val ? 27 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, color: val ? '#111827' : '#94a3b8', minWidth: 36 }}>
                {val ? 'Açık' : 'Kapalı'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MobilAyarlariPanel() {
  const [apkUrl, setApkUrl] = useState('')
  const [latestVersion, setLatestVersion] = useState('')
  const [minVersion, setMinVersion] = useState('')
  const [surecNotu, setSurecNotu] = useState('')
  const [zorunlu, setZorunlu] = useState(false)
  // Mevcut yayında olan değerler (referans için)
  const [mevcut, setMevcut] = useState<{ apk_url: string; latest_version: string; min_version: string; surec_notu: string; zorunlu: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sistem-ayarlari/mobil')
      .then(r => r.json())
      .then(j => {
        setApkUrl(j.apk_url ?? ''); setLatestVersion(j.latest_version ?? ''); setMinVersion(j.min_version ?? '')
        setSurecNotu(j.surec_notu ?? ''); setZorunlu(j.zorunlu ?? false)
        setMevcut({ apk_url: j.apk_url ?? '', latest_version: j.latest_version ?? '', min_version: j.min_version ?? '', surec_notu: j.surec_notu ?? '', zorunlu: j.zorunlu ?? false })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Google Drive paylaşım linkini doğrudan indirme linkine dönüştür
  function driveDirectLink(url: string): string {
    // drive.google.com/file/d/FILE_ID/... → drive.google.com/uc?export=download&id=FILE_ID
    const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
    if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`
    return url
  }

  const handlePublish = async () => {
    if (!apkUrl.trim()) { setMsg('APK linki boş olamaz.'); return }
    const finalUrl = driveDirectLink(apkUrl.trim())
    setApkUrl(finalUrl)
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/sistem-ayarlari/mobil', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apk_url: finalUrl, latest_version: latestVersion, min_version: minVersion, surec_notu: surecNotu, zorunlu }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setMevcut({ apk_url: finalUrl, latest_version: latestVersion, min_version: minVersion, surec_notu: surecNotu, zorunlu })
      setMsg('Güncelleme yayınlandı! Mobil kullanıcılar yeni sürümü görecek.')
    } catch (e: any) { setMsg('Hata: ' + e.message) }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>

  // Mevcut değerlerle karşılaştır — değişiklik yoksa buton pasif
  const degisiklikVar = mevcut != null && (
    driveDirectLink(apkUrl.trim()) !== mevcut.apk_url ||
    latestVersion !== mevcut.latest_version ||
    minVersion !== mevcut.min_version ||
    surecNotu !== mevcut.surec_notu ||
    zorunlu !== mevcut.zorunlu
  )

  const sinp: React.CSSProperties = { height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, width: '100%' }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: '#0d9488' }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Mobil Uygulama Ayarları</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ═══ Android ═══ */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 22 }}>🤖</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Android</span>
          </div>

          {/* Mevcut sürüm bilgisi */}
          {mevcut && (mevcut.latest_version || mevcut.min_version) && (
            <div style={{ padding: '8px 12px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>Yayında Olan Sürüm</div>
              <div style={{ display: 'flex', gap: 16, color: '#0f766e' }}>
                {mevcut.latest_version && <span>Son: <strong>{mevcut.latest_version}</strong></span>}
                {mevcut.min_version && <span>Min: <strong>{mevcut.min_version}</strong></span>}
                {mevcut.zorunlu && <span style={{ color: '#dc2626', fontWeight: 700 }}>Zorunlu</span>}
              </div>
              {mevcut.surec_notu && <div style={{ marginTop: 4, color: '#64748b', fontSize: 11 }}>{mevcut.surec_notu}</div>}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>APK İndirme Linki *</span>
              <input value={apkUrl} onChange={e => setApkUrl(e.target.value)} style={sinp} placeholder="https://drive.google.com/..." />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Yeni Sürüm</span>
                <input value={latestVersion} onChange={e => setLatestVersion(e.target.value)} style={sinp} placeholder="1.3.0" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Minimum Sürüm</span>
                <input value={minVersion} onChange={e => setMinVersion(e.target.value)} style={sinp} placeholder="1.0.0" />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Güncelleme Notu</span>
              <textarea value={surecNotu} onChange={e => setSurecNotu(e.target.value)} rows={2}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, resize: 'vertical' }}
                placeholder="Bu sürümde neler değişti..." />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={zorunlu} onChange={e => setZorunlu(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Zorunlu güncelleme</span>
            </label>
          </div>

          <button onClick={handlePublish} disabled={saving || !degisiklikVar}
            style={{
              marginTop: 14, height: 40, padding: '0 20px', borderRadius: 8, border: 'none', width: '100%',
              background: degisiklikVar ? '#0d9488' : '#9ca3af', color: '#fff', fontWeight: 800, fontSize: 13,
              cursor: (saving || !degisiklikVar) ? 'not-allowed' : 'pointer', opacity: (saving || !degisiklikVar) ? 0.6 : 1,
            }}>
            {saving ? 'Yayınlanıyor...' : '🚀 Güncellemeleri Yayınla'}
          </button>

          {msg && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12, background: msg.includes('Hata') ? '#fef2f2' : '#f0fdfa', color: msg.includes('Hata') ? '#dc2626' : '#0f766e', fontWeight: 600 }}>
              {msg}
            </div>
          )}
        </div>

        {/* ═══ Apple (Yakında) ═══ */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', opacity: 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 22 }}>🍎</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Apple iOS</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f3f4f6', color: '#6b7280', fontWeight: 600 }}>Yakında</span>
          </div>
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            iOS uygulama desteği ilerleyen dönemde eklenecektir.
            App Store veya TestFlight entegrasyonu bu alandan yönetilecek.
          </div>
        </div>

      </div>
    </div>
  )
}

function UygulamaAyarlariPanel() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState<string | null>(null)
  const [appName, setAppName] = useState('QR-Sync')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingSidebar, setUploadingSidebar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sistem-ayarlari/konfigurasyon')
      .then(r => r.json())
      .then(j => { setLogoUrl(j.uygulama_logo_url ?? null); setSidebarLogoUrl(j.sidebar_logo_url ?? null); setAppName(j.uygulama_ismi ?? 'QR-Sync'); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload/uygulama-logo', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setLogoUrl(j.url); setMsg('Logo yüklendi.')
    } catch (err: any) { setMsg('Hata: ' + err.message) }
    setUploading(false)
    e.target.value = ''
  }

  const handleLogoDelete = async () => {
    const fd = new FormData(); fd.append('action', 'delete')
    await fetch('/api/upload/uygulama-logo', { method: 'POST', body: fd })
    setLogoUrl(null); setMsg('Logo silindi.')
  }

  const handleSaveName = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/konfigurasyon', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uygulama_ismi: appName }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setMsg('Uygulama ismi kaydedildi.')
    } catch (err: any) { setMsg('Hata: ' + err.message) }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: '#111827' }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Uygulama Ayarları</h3>
      </div>

      <div style={{ padding: '10px 14px', background: '#f9fafb', border: '1px solid #86efac', borderRadius: 8, fontSize: 12.5, color: '#111827', lineHeight: 1.6, marginBottom: 16 }}>
        Login sayfasında ve uygulama genelinde kullanılan logo ve isim ayarları. Logo arka plansız PNG formatında olmalıdır.
      </div>

      {/* Uygulama Logosu */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Uygulama Logosu</div>
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, marginBottom: 14 }}>
          Login sayfasında gösterilecek logo. Logo; uygulama simgesi, uygulama adı ve alt açıklama yazısını
          tek bir görsel olarak içermelidir. Yatay (landscape) formatta, arka planı transparan PNG olmalıdır.
          Önerilen boyut: <strong>420×120 piksel</strong> veya bu orana yakın. Minimum genişlik 300px.
        </div>

        {/* Logo önizleme */}
        <div style={{
          border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 14,
          background: 'linear-gradient(135deg, #f8fafc, #f9fafb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80,
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Uygulama Logosu" style={{ height: 'auto', maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#cbd5e1' }}>
              <span style={{ fontSize: 36 }}>🖼</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Henüz logo yüklenmedi</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#4b5563', cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? 'Yükleniyor...' : logoUrl ? 'Değiştir' : 'Logo Yükle'}
            <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleLogoUpload} disabled={uploading} />
          </label>
          {logoUrl && (
            <button onClick={handleLogoDelete} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', fontSize: 13, fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
              Sil
            </button>
          )}
        </div>
      </div>

      {/* Uygulama İsmi */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Uygulama İsmi</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={appName} onChange={e => setAppName(e.target.value)}
            style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 700, flex: 1 }}
            placeholder="QR-Sync" />
          <button onClick={handleSaveName} disabled={saving}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '...' : 'Kaydet'}
          </button>
        </div>
        <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>Login sayfasında, sayfa başlığında ve bildirimlerde kullanılır.</span>
      </div>

      {/* Sidebar Logosu (SA/alt_SA üst sol köşe) */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Sidebar Logosu (SA/Alt SA)</div>
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, marginBottom: 14 }}>
          SA ve Alt SA kullanıcılarının sidebar sol üst köşesinde gösterilecek logo.
          Yatay (landscape) formatta, arka planı transparan PNG olmalıdır.
          Önerilen boyut: <strong>220×48 piksel</strong> veya bu orana yakın.
        </div>
        <div style={{
          border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 14,
          background: 'linear-gradient(135deg, #f8fafc, #f9fafb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 64,
        }}>
          {sidebarLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sidebarLogoUrl} alt="Sidebar Logo" style={{ height: 'auto', maxHeight: 48, maxWidth: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Henüz sidebar logosu yüklenmedi</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#4b5563', cursor: uploadingSidebar ? 'not-allowed' : 'pointer' }}>
            {uploadingSidebar ? 'Yükleniyor...' : sidebarLogoUrl ? 'Değiştir' : 'Logo Yükle'}
            <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              setUploadingSidebar(true)
              try {
                const fd = new FormData(); fd.append('file', file)
                const res = await fetch('/api/upload/sidebar-logo', { method: 'POST', body: fd })
                const j = await res.json()
                if (!res.ok) throw new Error(j.error)
                setSidebarLogoUrl(j.url); setMsg('Sidebar logosu yüklendi.')
              } catch (err: any) { setMsg('Hata: ' + err.message) }
              setUploadingSidebar(false); e.target.value = ''
            }} disabled={uploadingSidebar} />
          </label>
          {sidebarLogoUrl && (
            <button onClick={async () => {
              const fd = new FormData(); fd.append('action', 'delete')
              await fetch('/api/upload/sidebar-logo', { method: 'POST', body: fd })
              setSidebarLogoUrl(null); setMsg('Sidebar logosu silindi.')
            }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', fontSize: 13, fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
              Sil
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: msg.includes('Hata') ? '#fef2f2' : '#f9fafb', color: msg.includes('Hata') ? '#dc2626' : '#111827', fontWeight: 600 }}>
          {msg}
        </div>
      )}
    </div>
  )
}

function SistemKonfigurasyonPanel() {
  const [form, setForm] = useState({ uygulama_domain: 'app.qrsync.com', firebase_project_id: '', firebase_client_email: '', firebase_private_key: '', cron_secret: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sistem-ayarlari/konfigurasyon')
      .then(r => r.json())
      .then(j => { if (j.uygulama_domain) setForm(j); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/sistem-ayarlari/konfigurasyon', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setMsg('Konfigürasyon kaydedildi.')
    } catch (e: any) { setMsg('Hata: ' + e.message) }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>

  const sinp: React.CSSProperties = { height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, width: '100%' }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: '#7c3aed' }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Sistem Konfigürasyonu</h3>
      </div>
      <div style={{ padding: '10px 14px', background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 8, fontSize: 12.5, color: '#6b21a8', lineHeight: 1.6, marginBottom: 16 }}>
        Bu ayarlar sunucu, domain veya altyapı değişikliğinde kullanılır. Yanlış değer girilirse sistem çalışmayabilir.
        Değişiklik yapmadan önce mevcut değerleri not alın.
      </div>

      {/* Uygulama */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Uygulama</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Domain (QR/NFC bağlantı adresi)</span>
          <input value={form.uygulama_domain} onChange={e => setForm(f => ({ ...f, uygulama_domain: e.target.value }))} style={sinp} placeholder="app.qrsync.com" />
          <span style={{ fontSize: 11, color: '#64748b' }}>QR kodlarında ve sistem bağlantılarında kullanılan domain adresi</span>
        </label>
      </div>

      {/* Firebase/FCM */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Firebase Cloud Messaging (Mobil Bildirimler)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Project ID</span>
            <input value={form.firebase_project_id} onChange={e => setForm(f => ({ ...f, firebase_project_id: e.target.value }))} style={sinp} placeholder="my-project-12345" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Client Email (Service Account)</span>
            <input value={form.firebase_client_email} onChange={e => setForm(f => ({ ...f, firebase_client_email: e.target.value }))} style={sinp} placeholder="firebase-adminsdk-xxx@project.iam.gserviceaccount.com" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Private Key</span>
            <textarea value={form.firebase_private_key} onChange={e => setForm(f => ({ ...f, firebase_private_key: e.target.value }))} rows={3}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
              placeholder="-----BEGIN PRIVATE KEY-----\n..." />
            <span style={{ fontSize: 11, color: '#64748b' }}>Firebase Console &gt; Proje Ayarları &gt; Hizmet Hesapları &gt; Anahtar Oluştur</span>
          </label>
        </div>
      </div>

      {/* Cron */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Güvenlik</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const }}>Cron Secret Token</span>
          <input value={form.cron_secret} onChange={e => setForm(f => ({ ...f, cron_secret: e.target.value }))} style={{ ...sinp, fontFamily: 'monospace' }} placeholder="Otomatik görevler için güvenlik anahtarı" />
          <span style={{ fontSize: 11, color: '#64748b' }}>Zamanlanmış görevlerin (arşivleme, bildirim, rapor) yetkisiz çalıştırılmasını engeller</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ height: 38, padding: '0 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: msg.includes('Hata') ? '#fef2f2' : '#f9fafb', color: msg.includes('Hata') ? '#dc2626' : '#111827', fontWeight: 600 }}>
          {msg}
        </div>
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>

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
            style={{ height: 38, padding: '0 20px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button onClick={handleTest} disabled={testing}
            style={{ height: 38, padding: '0 20px', borderRadius: 8, background: '#fff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: testing ? 0.6 : 1 }}>
            {testing ? 'Gönderiliyor...' : 'Test Mail Gönder'}
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: testResult.includes('Hata') || testResult.includes('eksik') ? '#fef2f2' : '#f9fafb', color: testResult.includes('Hata') || testResult.includes('eksik') ? '#dc2626' : '#111827', fontWeight: 600 }}>
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

// ═══════════════════════════════════════════════════════════════════════════════
// SİMÜLASYON MODU PANELİ (Grup bazlı + şifre korumalı)
// ═══════════════════════════════════════════════════════════════════════════════
function SimulasyonPanel({ firmaId, projeId, lokasyonlar }: { firmaId: string; projeId: string | null; lokasyonlar: { id: string; tanim: string; parent_id?: string | null }[] }) {
  const [yetkili, setYetkili] = useState(false)
  const [sifreGirdi, setSifreGirdi] = useState('')
  const [sifreHata, setSifreHata] = useState(false)

  // Şifre doğrulama
  async function sifreDogrula() {
    setSifreHata(false)
    try {
      const res = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: sifreGirdi }),
      })
      const json = await res.json()
      if (json.ok) { setYetkili(true) }
      else { setSifreHata(true) }
    } catch { setSifreHata(true) }
  }

  if (!yetkili) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '44px 48px', maxWidth: 420, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.08)', border: '2px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>🔐</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: '#111827', marginBottom: 6 }}>Erişim Kısıtlı</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 28, lineHeight: 1.6 }}>
            Bu alan yetkili erişim gerektirir.<br />Devam etmek için hesap şifrenizi girin.
          </div>
          <input
            type="password"
            value={sifreGirdi}
            onChange={e => { setSifreGirdi(e.target.value); setSifreHata(false) }}
            onKeyDown={e => e.key === 'Enter' && sifreDogrula()}
            placeholder="Şifre"
            style={{ width: '100%', height: 44, padding: '0 16px', borderRadius: 10, border: `1.5px solid ${sifreHata ? '#ef4444' : '#e5e7eb'}`, background: '#fafafa', color: '#111827', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
          />
          {sifreHata && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>Şifre hatalı. Tekrar deneyin.</div>}
          <button onClick={sifreDogrula}
            style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
            Doğrula ve Giriş Yap
          </button>
        </div>
      </div>
    )
  }

  return <SimulasyonIcerik firmaId={firmaId} projeId={projeId} lokasyonlar={lokasyonlar} />
}

function SimulasyonIcerik({ firmaId, projeId, lokasyonlar }: { firmaId: string; projeId: string | null; lokasyonlar: { id: string; tanim: string; parent_id?: string | null }[] }) {
  const [ayarlar, setAyarlar] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Gruplar ve personeller (üst lokasyon seçince yüklenir)
  const [gruplar, setGruplar] = useState<any[]>([])
  const [personeller, setPersoneller] = useState<any[]>([])

  // Yeni ayar formu
  const [yeniUstLok, setYeniUstLok] = useState('')
  const [seciliGruplar, setSeciliGruplar] = useState<Record<string, { hedef_oran: number; vardiya_suresi_saat: number }>>({})
  const [seciliPersonel, setSeciliPersonel] = useState<Set<string>>(new Set())

  // Düzenleme
  const [duzenleId, setDuzenleId] = useState<string | null>(null)

  const ustLokasyonlar = lokasyonlar.filter(l => !l.parent_id).sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))
  const lokAdMap = new Map(lokasyonlar.map(l => [l.id, l.tanim]))
  const inp: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }

  async function yukle() {
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId) p.set('proje_id', projeId)
      const res = await fetch(`/api/simulasyon?${p}`)
      const json = await res.json()
      if (json.ok) setAyarlar(json.data ?? [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { yukle() }, [firmaId, projeId])

  // Üst lokasyon seçilince grupları ve personelleri yükle
  async function ustLokasyonSecildi(ustLokId: string) {
    setYeniUstLok(ustLokId)
    setSeciliGruplar({})
    setSeciliPersonel(new Set())
    setGruplar([])
    setPersoneller([])
    if (!ustLokId) return

    // Grupları çek
    const gRes = await fetch(`/api/location-groups?firmaId=${firmaId}${projeId ? `&projeId=${projeId}` : ''}`)
    const gJson = await gRes.json()
    const ustGruplar = (gJson.groups ?? []).filter((g: any) => g.ust_lokasyon_id === ustLokId && g.aktif)
    setGruplar(ustGruplar)

    // Üst lokasyon personellerini çek
    const pRes = await fetch(`/api/simulasyon/personeller?firma_id=${firmaId}&ust_lokasyon_id=${ustLokId}`)
    const pJson = await pRes.json()
    setPersoneller(pJson.data ?? [])
  }

  // Düzenleme moduna geç
  async function duzenleBasla(a: any) {
    setDuzenleId(a.id)
    setYeniUstLok(a.ust_lokasyon_id)
    await ustLokasyonSecildi(a.ust_lokasyon_id)
    // Mevcut grup ayarlarını yükle
    const ga: Record<string, { hedef_oran: number; vardiya_suresi_saat: number }> = {}
    for (const g of (a.grup_ayarlari ?? [])) {
      ga[g.grup_id] = { hedef_oran: g.hedef_oran, vardiya_suresi_saat: g.vardiya_suresi_saat }
    }
    setSeciliGruplar(ga)
    setSeciliPersonel(new Set(a.personel_idler ?? []))
  }

  function grupToggle(grupId: string) {
    setSeciliGruplar(prev => {
      const n = { ...prev }
      if (n[grupId]) { delete n[grupId] }
      else { n[grupId] = { hedef_oran: 100, vardiya_suresi_saat: 8 } }
      return n
    })
  }

  function grupAyarDegistir(grupId: string, field: string, value: number) {
    setSeciliGruplar(prev => ({ ...prev, [grupId]: { ...prev[grupId], [field]: value } }))
  }

  function personelToggle(uid: string) {
    setSeciliPersonel(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }

  function tumPersonelSec() {
    setSeciliPersonel(new Set(personeller.map((p: any) => p.id)))
  }

  async function kaydet() {
    const grupIds = Object.keys(seciliGruplar)
    if (!yeniUstLok || grupIds.length === 0 || seciliPersonel.size === 0) return
    setSaving(true)
    try {
      const grupAyar = grupIds.map(gid => ({ grup_id: gid, ...seciliGruplar[gid] }))
      const personelIdler = Array.from(seciliPersonel)

      if (duzenleId) {
        // Güncelle
        await fetch('/api/simulasyon', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: duzenleId, grup_ayarlari: grupAyar, personel_idler: personelIdler }),
        })
      } else {
        // Yeni oluştur
        await fetch('/api/simulasyon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, ust_lokasyon_id: yeniUstLok, grup_ayarlari: grupAyar, personel_idler: personelIdler }),
        })
      }
      iptal()
      await yukle()
    } catch {}
    setSaving(false)
  }

  function iptal() {
    setDuzenleId(null); setYeniUstLok(''); setSeciliGruplar({}); setSeciliPersonel(new Set()); setGruplar([]); setPersoneller([])
  }

  async function toggle(id: string, aktif: boolean) {
    await fetch('/api/simulasyon', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, aktif: !aktif }) })
    await yukle()
  }

  async function sil(id: string) {
    if (!confirm('Bu simülasyon ayarını silmek istediğinize emin misiniz?')) return
    await fetch(`/api/simulasyon?id=${id}`, { method: 'DELETE' })
    await yukle()
  }

  const anyAktif = ayarlar.some((a: any) => a.aktif)

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#6b7280', fontSize: 14 }}>Yükleniyor...</div>
    </div>
  )

  const formAcik = !!yeniUstLok

  return (
    <div style={{ border: anyAktif ? '2px solid #ef4444' : '2px solid #e5e7eb', borderRadius: 14, padding: '28px 32px', position: 'relative', background: '#fff', transition: 'border-color .3s', boxShadow: anyAktif ? '0 0 30px rgba(239,68,68,0.08)' : 'none' }}>

      {/* Aktif göstergesi — pulsating */}
      {anyAktif && (
        <div style={{ position: 'absolute', top: -12, right: 24, display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: '4px 14px', borderRadius: 20, border: '2px solid #ef4444' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'simPulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#dc2626', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>SİMÜLASYON AKTİF</span>
        </div>
      )}

      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f1f5f9', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>Simülasyon Kontrol Merkezi</div>
          <div style={{ fontSize: 12.5, color: '#6b7280' }}>Frekansiyel görev otomatik tamamlama sistemi</div>
        </div>
      </div>

      {/* Bilgi bandı */}
      <div style={{ padding: '14px 18px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, color: '#4b5563', marginBottom: 22, lineHeight: 1.7 }}>
        Simülasyon aktifken personelin mobil tamamlamaları devre dışı kalır. Görevler belirlenen hedefe göre otomatik olarak
        seçilen personeller adına tamamlanır. Tüm göstergelerde gerçek tamamlama olarak görünür.
      </div>

      <style>{`@keyframes simPulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.4; transform:scale(1.3) } }`}</style>

      {/* ═══ Yeni / Düzenle Formu ═══ */}
      <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 22 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 14 }}>
          {duzenleId ? '✏️ Simülasyon Düzenle' : '+ Yeni Simülasyon Oluştur'}
        </div>

        {/* Üst Lokasyon Seçimi */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const }}>Üst Lokasyon *</span>
          <select value={yeniUstLok} onChange={e => ustLokasyonSecildi(e.target.value)} disabled={!!duzenleId}
            style={{ ...inp, maxWidth: 400 }}>
            <option value="">Seçin…</option>
            {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
          </select>
        </label>

        {formAcik && (
          <>
            {/* Gruplar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                Gruplar ve Ayarları
              </div>
              {gruplar.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8', padding: 8 }}>Bu üst lokasyonda grup bulunamadı.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gruplar.map((g: any) => {
                    const secili = !!seciliGruplar[g.id]
                    return (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: secili ? '#fef2f2' : '#fff', border: `1.5px solid ${secili ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 10 }}>
                        <input type="checkbox" checked={secili} onChange={() => grupToggle(g.id)} style={{ width: 17, height: 17 }} />
                        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#111827' }}>
                          {g.ad}
                          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>({(g.lokasyonIds ?? []).length} lokasyon)</span>
                        </span>
                        {secili && (
                          <>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>Hedef:</span>
                              <input type="number" min={1} max={100} value={seciliGruplar[g.id]?.hedef_oran ?? 100}
                                onChange={e => grupAyarDegistir(g.id, 'hedef_oran', Number(e.target.value))}
                                style={{ ...inp, width: 56, height: 30, textAlign: 'center', fontSize: 13 }} />
                              <span style={{ fontSize: 11, color: '#6b7280' }}>%</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>Vardiya:</span>
                              <input type="number" min={1} value={seciliGruplar[g.id]?.vardiya_suresi_saat ?? 8}
                                onChange={e => grupAyarDegistir(g.id, 'vardiya_suresi_saat', Number(e.target.value))}
                                style={{ ...inp, width: 56, height: 30, textAlign: 'center', fontSize: 13 }} />
                              <span style={{ fontSize: 11, color: '#6b7280' }}>sa</span>
                            </label>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Personeller */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  Personeller ({seciliPersonel.size}/{personeller.length})
                </span>
                {personeller.length > 0 && (
                  <button onClick={tumPersonelSec} style={{ fontSize: 11, color: '#1f2937', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}>
                    Tümünü Seç
                  </button>
                )}
              </div>
              {personeller.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8', padding: 8 }}>Bu üst lokasyona atanmış personel yok.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {personeller.map((p: any) => {
                    const secili = seciliPersonel.has(p.id)
                    return (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', background: secili ? '#fef2f2' : '#fff', border: `1.5px solid ${secili ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={secili} onChange={() => personelToggle(p.id)} style={{ width: 15, height: 15 }} />
                        <span style={{ fontWeight: secili ? 600 : 400, color: secili ? '#dc2626' : '#374151' }}>{p.isim_soyisim}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Kaydet / İptal */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={kaydet}
                disabled={saving || Object.keys(seciliGruplar).length === 0 || seciliPersonel.size === 0}
                style={{ height: 38, padding: '0 24px', borderRadius: 10, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Kaydediliyor…' : duzenleId ? 'Güncelle' : 'Oluştur'}
              </button>
              {(duzenleId || yeniUstLok) && (
                <button onClick={iptal} style={{ height: 38, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                  İptal
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ Simülasyon Kartları ═══ */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 12 }}>
        Simülasyonlar
      </div>
      {ayarlar.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #d1d5db' }}>
          Henüz simülasyon oluşturulmadı.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {ayarlar.map((a: any) => (
            <div key={a.id} style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              border: a.aktif ? '2px solid #ef4444' : '1.5px solid #e5e7eb',
              boxShadow: a.aktif ? '0 4px 20px rgba(239,68,68,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'border-color .3s, box-shadow .3s',
            }}>
              {/* Kart başlık */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => toggle(a.id, a.aktif)}
                  style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: a.aktif ? '#ef4444' : '#d1d5db', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: a.aktif ? 23 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>📍 {lokAdMap.get(a.ust_lokasyon_id) ?? '—'}</div>
                  <div style={{ fontSize: 11.5, color: a.aktif ? '#dc2626' : '#94a3b8', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.aktif && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'simPulse 1.5s ease-in-out infinite', display: 'inline-block' }} />}
                    {a.aktif ? 'ÇALIŞIYOR' : 'DURDURULDU'}
                    <span style={{ color: '#94a3b8', fontWeight: 400 }}>· {(a.grup_ayarlari?.length ?? 0)} grup · {(a.personel_idler?.length ?? 0)} personel</span>
                  </div>
                </div>
                <button onClick={() => duzenleBasla(a)} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Düzenle</button>
                <button onClick={() => sil(a.id)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              {/* Grup detayları */}
              {(a.grup_ayarlari ?? []).length > 0 && (
                <div style={{ padding: '10px 18px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(a.grup_ayarlari ?? []).map((ga: any) => (
                    <span key={ga.grup_id} style={{ fontSize: 11.5, padding: '4px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 600 }}>
                      %{ga.hedef_oran} · {ga.vardiya_suresi_saat}sa
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
