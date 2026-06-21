'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

interface Firma { id: string; firma_adi?: string; ticari_unvan?: string }

interface Props {
  isSA: boolean
  firmaId?: string | null            // TA için sabit (kendi firması)
  firmalar?: Firma[]                  // SA için firma listesi
}

const MODULLER: { kod: 'gys' | 'fms'; ad: string; ikon: string; aciklama: string }[] = [
  // Oto Yıkama bu sayfada yönetilmez — atama Sistem Ayarları > Lokasyon
  // Yetkileri üzerinden yapılır (oto_yikama_lokasyon=true atanmış kullanıcı
  // otomatik yetkili). FMS İO-TEKNİK SSO ile bağlanır.
  { kod: 'gys', ad: 'GYS', ikon: '🛡️', aciklama: 'Görev Yönetim Sistemi' },
  { kod: 'fms', ad: 'FMS', ikon: '🏢', aciklama: 'Facility Management System' },
]

const ROL_RENK: Record<string, { etiket: string; renk: string }> = {
  tenant_admin: { etiket: 'TA', renk: '#e65100' },
  tenant_user:  { etiket: 'U',  renk: '#6a1b9a' },
  musteri:      { etiket: 'M',  renk: '#1565c0' },
}

type Kullanici = {
  id: string
  isim_soyisim: string | null
  email: string | null
  rol: string
  yetkiler: { gys: boolean; fms: boolean }
}

// Değişiklikler — kullanıcı yaptığı edits state'i
type Degisiklik = Map<string, Partial<{ gys: boolean; fms: boolean }>>

export default function ModulYetkileriClient({ isSA, firmaId: initialFirmaId, firmalar = [] }: Props) {
  const toast = useToast()
  const [firmaId, setFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [degisiklikler, setDegisiklikler] = useState<Degisiklik>(new Map())
  const [arama, setArama] = useState('')
  const [rolFiltre, setRolFiltre] = useState<string>('TUMU')

  const dirty = degisiklikler.size > 0

  async function yetkileriYukle() {
    setLoading(true)
    try {
      const qs = isSA && firmaId ? `?firma_id=${firmaId}` : ''
      const res = await fetch(`/api/sa/modul-yetkileri${qs}`)
      const data = await res.json()
      if (res.ok && data.ok) {
        setKullanicilar(data.kullanicilar ?? [])
        setDegisiklikler(new Map())
      } else {
        toast.toast({ type: 'error', message: data.error ?? 'Yetkiler yüklenemedi' })
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { yetkileriYukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [firmaId])

  function toggle(userId: string, modul: 'gys' | 'fms', mevcut: boolean) {
    setDegisiklikler(prev => {
      const next = new Map(prev)
      const cur = next.get(userId) ?? {}
      // Mevcut DB değeri ile aynıysa değişiklik listesinden çıkar
      const u = kullanicilar.find(k => k.id === userId)
      const dbValue = u?.yetkiler[modul] ?? (modul === 'gys')
      const newValue = !mevcut
      if (newValue === dbValue) {
        delete cur[modul]
        if (Object.keys(cur).length === 0) next.delete(userId)
        else next.set(userId, cur)
      } else {
        next.set(userId, { ...cur, [modul]: newValue })
      }
      return next
    })
  }

  function tickValue(u: Kullanici, modul: 'gys' | 'fms'): boolean {
    const ovr = degisiklikler.get(u.id)?.[modul]
    return ovr !== undefined ? ovr : u.yetkiler[modul]
  }

  async function kaydet() {
    setSaving(true)
    try {
      const yetkiler: { user_id: string; modul_kodu: string; gorebilir: boolean }[] = []
      for (const [userId, deg] of degisiklikler.entries()) {
        for (const m of MODULLER) {
          const v = deg[m.kod]
          if (v !== undefined) yetkiler.push({ user_id: userId, modul_kodu: m.kod, gorebilir: v })
        }
      }
      const res = await fetch('/api/sa/modul-yetkileri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firmaId, yetkiler }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.toast({ type: 'success', message: `${data.etkilenen ?? yetkiler.length} kayıt güncellendi` })
        await yetkileriYukle()
      } else {
        toast.toast({ type: 'error', message: data.error ?? 'Kayıt başarısız' })
      }
    } finally { setSaving(false) }
  }

  const filtreliListe = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    return kullanicilar.filter(u => {
      if (rolFiltre !== 'TUMU' && u.rol !== rolFiltre) return false
      if (!q) return true
      const isim = (u.isim_soyisim ?? '').toLocaleLowerCase('tr')
      const email = (u.email ?? '').toLocaleLowerCase('tr')
      return isim.includes(q) || email.includes(q)
    })
  }, [kullanicilar, arama, rolFiltre])

  const rolSayilari = useMemo(() => {
    const c: Record<string, number> = { TUMU: kullanicilar.length, tenant_admin: 0, tenant_user: 0, musteri: 0 }
    for (const u of kullanicilar) c[u.rol] = (c[u.rol] ?? 0) + 1
    return c
  }, [kullanicilar])

  return (
    <div className="verde-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Modül Yetkileri</h2>
        <p style={{ marginTop: 6, color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
          Her kullanıcı için modül erişimini ayrı ayrı yönetebilirsiniz. Mevcut yetkiler
          önceki rol-bazlı varsayılanlardan göçürüldü ve burada kullanıcı bazında düzenlenebilir.
          <br />
          <strong>Oto Yıkama</strong> yetkisi burada yönetilmez — <em>Sistem Ayarları → Lokasyon Yetkileri</em>
          üzerinden, yıkama lokasyonuna atanmış personel otomatik yetkilidir.
        </p>
      </div>

      {isSA && (
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Firma:</label>
          <select
            value={firmaId ?? ''}
            onChange={e => setFirmaId(e.target.value || null)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 13, minWidth: 240, background: '#fff',
            }}
          >
            <option value="">— Firma seçin —</option>
            {firmalar.map(f => (
              <option key={f.id} value={f.id}>
                {f.firma_adi || f.ticari_unvan || f.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Arama + rol filtre */}
      {!loading && kullanicilar.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="İsim veya e-posta ara…"
            value={arama}
            onChange={e => setArama(e.target.value)}
            style={{
              padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 13, minWidth: 240, background: '#fff',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {['TUMU','tenant_admin','tenant_user','musteri'].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRolFiltre(r)}
                style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  border: '1px solid ' + (rolFiltre === r ? '#0f172a' : '#d1d5db'),
                  background: rolFiltre === r ? '#0f172a' : '#fff',
                  color: rolFiltre === r ? '#fff' : '#374151',
                  cursor: 'pointer',
                }}
              >
                {r === 'TUMU' ? 'Tümü' : (ROL_RENK[r]?.etiket ?? r)} ({rolSayilari[r] ?? 0})
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
            {filtreliListe.length} / {kullanicilar.length} kullanıcı
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor…</div>
      ) : kullanicilar.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          {firmaId ? 'Bu firmada (ATALIAN OYAK Renault filtresi ile) yönetilebilir kullanıcı bulunamadı.' : 'Önce firma seçin.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb' }}>
                  Kullanıcı
                </th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', width: 70 }}>
                  Rol
                </th>
                {MODULLER.map(m => (
                  <th key={m.kod} style={{
                    textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e5e7eb',
                    fontSize: 12, fontWeight: 700, width: 90,
                  }}>
                    {m.ikon} {m.ad}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtreliListe.map(u => {
                const rolInfo = ROL_RENK[u.rol]
                const userDirty = degisiklikler.has(u.id)
                return (
                  <tr key={u.id} style={{ background: userDirty ? '#fff7ed' : undefined }}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{u.isim_soyisim ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{u.email ?? '—'}</div>
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: (rolInfo?.renk ?? '#475569') + '15',
                        color: rolInfo?.renk ?? '#475569',
                      }}>
                        {rolInfo?.etiket ?? u.rol}
                      </span>
                    </td>
                    {MODULLER.map(m => {
                      const checked = tickValue(u, m.kod)
                      return (
                        <td key={m.kod} style={{ textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(u.id, m.kod, checked)}
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {dirty
            ? <><strong>{degisiklikler.size}</strong> kullanıcıda kaydedilmemiş değişiklik var</>
            : 'Değişiklik yok'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty && (
            <button
              type="button"
              onClick={() => yetkileriYukle()}
              disabled={saving}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: '1px solid #d1d5db', background: '#fff',
                fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer',
              }}
            >
              İptal
            </button>
          )}
          <button
            type="button"
            onClick={kaydet}
            disabled={!dirty || saving}
            style={{
              padding: '8px 20px', borderRadius: 8,
              border: 'none', background: dirty ? '#0f172a' : '#9ca3af',
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
