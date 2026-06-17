'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Smartphone, SmartphoneNfc, Filter, X } from 'lucide-react'

export interface YikamaKullanici {
  id: string
  isim_soyisim: string | null
  email: string | null
  rol: string
  aktif: boolean
  atanmis_istasyonlar: string[]
}

type Filtre = 'all' | 'online' | 'eslesmis' | 'eslesmemis'

interface DeviceInfo {
  device_token: string | null
  device_id: string | null
  son_kullanim: string | null
}

interface Props {
  firmaId: string
  kullanicilar: YikamaKullanici[]
}

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000 // 10 dk
const REFRESH_INTERVAL_MS = 30 * 1000      // 30 sn

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  amber: '#d97706', amberLight: '#fef3c7',
  red: '#dc2626', redLight: '#fef2e2',
  gray: '#9ca3af',
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60)   return `${diffSec} sn önce`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} sa önce`
  return `${Math.floor(diffSec / 86400)} gün önce`
}

function rolEtiket(r: string): string {
  return ({
    super_admin: 'SA', alt_super_admin: '2.SA',
    tenant_admin: 'TA', tenant_user: 'U', musteri: 'M',
  } as any)[r] ?? r
}

function bashar(isim: string): string {
  return isim.split(' ').filter(Boolean).slice(0, 2).map(s => s[0] ?? '').join('').toUpperCase() || '?'
}

export default function OtoYikamaKullanicilarClient({ firmaId, kullanicilar }: Props) {
  const [deviceMap, setDeviceMap] = useState<Record<string, DeviceInfo>>({})
  const [arama, setArama] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('all')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null)
  // "now" state'i ile re-render → relTime'lar her saniye güncellenebilir
  const [, tickRe] = useState(0)

  async function fetchDevices() {
    if (!firmaId) return
    setYukleniyor(true)
    try {
      const res = await fetch(`/api/users/device-tokens?firma_id=${firmaId}`, { cache: 'no-store' })
      const j = await res.json()
      if (j?.data) setDeviceMap(j.data as Record<string, DeviceInfo>)
      setSonGuncelleme(new Date())
    } catch {} finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => {
    fetchDevices()
    const tid = setInterval(fetchDevices, REFRESH_INTERVAL_MS)
    return () => clearInterval(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  // her 20 sn relTime'lar güncel olsun
  useEffect(() => {
    const tid = setInterval(() => tickRe(v => v + 1), 20 * 1000)
    return () => clearInterval(tid)
  }, [])

  function isOnline(uid: string): boolean {
    const son = deviceMap[uid]?.son_kullanim
    if (!son) return false
    return (Date.now() - new Date(son).getTime()) < ONLINE_THRESHOLD_MS
  }
  function isEslesmis(uid: string): boolean {
    return !!deviceMap[uid]?.device_token
  }

  const filtrelenmis = useMemo(() => {
    const ara = arama.trim().toLowerCase()
    let list = kullanicilar
    if (ara) list = list.filter(u =>
      (u.isim_soyisim ?? '').toLowerCase().includes(ara)
      || (u.email ?? '').toLowerCase().includes(ara)
    )
    if (filtre === 'online')      list = list.filter(u => isOnline(u.id))
    if (filtre === 'eslesmis')    list = list.filter(u => isEslesmis(u.id))
    if (filtre === 'eslesmemis')  list = list.filter(u => !isEslesmis(u.id))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kullanicilar, arama, filtre, deviceMap])

  const sayilar = useMemo(() => {
    let online = 0, eslesmis = 0
    for (const u of kullanicilar) {
      if (isOnline(u.id)) online++
      if (isEslesmis(u.id)) eslesmis++
    }
    return { toplam: kullanicilar.length, online, eslesmis, eslesmemis: kullanicilar.length - eslesmis }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kullanicilar, deviceMap])

  if (kullanicilar.length === 0) {
    return (
      <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>
        Oto Yıkama lokasyonuna atanmış personel yok. Atama, GYS → Sistem Ayarları → Kullanıcı Yetkileri → Lokasyon Yetkileri'nden yapılır.
      </div>
    )
  }

  return (
    <div className="verde-card" style={{ overflow: 'hidden' }}>
      {/* ÜST BAR: özet KPI + arama + filtre + son güncelleme */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.3px' }}>Oto Yıkama Kullanıcıları</div>
          <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>
            Yıkama lokasyonuna atanmış personel — atama Sistem Ayarları &gt; Lokasyon Yetkileri'nden yönetilir
          </div>
        </div>
        <KpiPil renk={T.text}  etiket="toplam"     sayi={sayilar.toplam} active={filtre === 'all'}
                onClick={() => setFiltre('all')} />
        <KpiPil renk={T.green} etiket="online"     sayi={sayilar.online}    active={filtre === 'online'}
                onClick={() => setFiltre(filtre === 'online' ? 'all' : 'online')}     blink={sayilar.online > 0} />
        <KpiPil renk={T.blue}  etiket="eşleşmiş"   sayi={sayilar.eslesmis}  active={filtre === 'eslesmis'}
                onClick={() => setFiltre(filtre === 'eslesmis' ? 'all' : 'eslesmis')} />
        <KpiPil renk={T.amber} etiket="eşleşmemiş" sayi={sayilar.eslesmemis} active={filtre === 'eslesmemis'}
                onClick={() => setFiltre(filtre === 'eslesmemis' ? 'all' : 'eslesmemis')} />
      </div>

      <div style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 240, maxWidth: 420, background: '#f9fafb', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px' }}>
          <Search size={14} color={T.textSoft} />
          <input
            type="text" value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="İsim veya e-posta ara…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: T.text }}
          />
          {arama && (
            <button type="button" onClick={() => setArama('')}
              style={{ border: 'none', background: 'transparent', color: T.textSoft, cursor: 'pointer', fontSize: 14 }}>×</button>
          )}
        </div>
        {(filtre !== 'all' || arama) && (
          <button onClick={() => { setFiltre('all'); setArama('') }}
            style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={12} /> Filtreyi Temizle
          </button>
        )}
        <button onClick={fetchDevices} disabled={yukleniyor}
          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: yukleniyor ? 'wait' : 'pointer', fontSize: 11.5, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={12} style={{ animation: yukleniyor ? 'spin 0.9s linear infinite' : undefined }} />
          Yenile
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textSoft }}>
          {filtrelenmis.length} / {kullanicilar.length} kayıt
          {sonGuncelleme ? ` · son ${relTime(sonGuncelleme.toISOString())}` : ''}
        </span>
      </div>

      {/* TABLO */}
      {filtrelenmis.length === 0 ? (
        <div style={{ padding: 50, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          Filtre koşullarına uyan kayıt yok.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 920 }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <Th>Personel</Th>
                <Th>E-posta</Th>
                <Th align="center">Rol</Th>
                <Th>Atanmış İstasyonlar</Th>
                <Th align="center">Cihaz / Eşleşme</Th>
                <Th align="center">Durum</Th>
              </tr>
            </thead>
            <tbody>
              {filtrelenmis.map(u => {
                const online = isOnline(u.id)
                const eslesmis = isEslesmis(u.id)
                const dev = deviceMap[u.id]
                return (
                  <tr key={u.id}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: online
                            ? 'linear-gradient(145deg, #16a34a, #15803d)'
                            : 'linear-gradient(145deg, #6366f1, #4f46e5)',
                          color: '#fff', fontSize: 12, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                        }}>{bashar(u.isim_soyisim ?? '')}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.isim_soyisim ?? '—'}
                          </div>
                          {!u.aktif && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: T.red, background: T.redLight, padding: '1px 6px', borderRadius: 999 }}>Pasif</span>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td muted>{u.email ?? '—'}</Td>
                    <Td align="center">
                      <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#374151' }}>{rolEtiket(u.rol)}</span>
                    </Td>
                    <Td>
                      {u.atanmis_istasyonlar.length === 0 ? <span style={{ color: T.textSoft }}>—</span> : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {u.atanmis_istasyonlar.slice(0, 3).map(ad => (
                            <span key={ad} style={{ fontSize: 11, fontWeight: 600, color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: 999, border: '1px solid #c7d2fe' }}>
                              {ad}
                            </span>
                          ))}
                          {u.atanmis_istasyonlar.length > 3 && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft }}>+{u.atanmis_istasyonlar.length - 3}</span>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td align="center">
                      {eslesmis ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: T.blueLight, color: T.blue, fontSize: 11, fontWeight: 700 }}>
                          <SmartphoneNfc size={12} /> Eşleşmiş
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: T.textSoft, fontSize: 11, fontWeight: 700 }}>
                          <Smartphone size={12} /> Eşleşmemiş
                        </span>
                      )}
                    </Td>
                    <Td align="center">
                      {online ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.green, animation: 'modulPulseDot 1.4s ease-in-out infinite' }} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: T.green }}>Online</span>
                          <span style={{ fontSize: 10.5, color: T.textSoft, marginLeft: 3 }}>{relTime(dev?.son_kullanim)}</span>
                        </div>
                      ) : dev?.son_kullanim ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.gray }} />
                          <span style={{ fontSize: 11.5, color: T.textSoft, fontWeight: 600 }}>
                            {relTime(dev.son_kullanim)} aktifti
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: T.textSoft }}>Hiç giriş yapmadı</span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes modulPulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(0.55); opacity: 0.55; }
        }
      `}</style>
    </div>
  )
}

function KpiPil({ etiket, sayi, renk, active, onClick, blink }: {
  etiket: string; sayi: number; renk: string; active?: boolean; onClick?: () => void; blink?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{
        padding: '6px 12px', borderRadius: 8,
        background: active ? renk + '14' : '#fafafa',
        border: active ? `1.5px solid ${renk}` : '1px solid #e5e7eb',
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-flex', alignItems: 'baseline', gap: 6,
        transition: 'all 0.15s',
        position: 'relative',
      }}>
      {blink && (
        <span style={{
          position: 'absolute', top: -3, right: -3,
          width: 8, height: 8, borderRadius: '50%',
          background: renk, animation: 'modulPulseDot 1.4s ease-in-out infinite',
        }} />
      )}
      <span style={{ fontSize: 17, fontWeight: 900, color: renk, lineHeight: 1 }}>{sayi}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: renk, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiket}</span>
    </button>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' | 'center' }) {
  return (
    <th style={{
      textAlign: align ?? 'left',
      padding: '10px 12px',
      borderBottom: '2px solid #e5e7eb',
      color: '#374151',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      fontWeight: 700,
    }}>{children}</th>
  )
}

function Td({ children, muted, align }: { children: React.ReactNode; muted?: boolean; align?: 'right' | 'left' | 'center' }) {
  return (
    <td style={{
      padding: '11px 12px',
      borderBottom: '1px solid #f1f5f9',
      textAlign: align ?? 'left',
      color: muted ? '#64748b' : '#0f172a',
    }}>{children}</td>
  )
}
