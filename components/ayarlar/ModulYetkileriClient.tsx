'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

interface Firma { id: string; firma_adi?: string; ticari_unvan?: string }

interface Props {
  isSA: boolean
  firmaId?: string | null            // TA için sabit (kendi firması)
  firmalar?: Firma[]                  // SA için firma listesi
}

const MODULLER: { kod: string; ad: string; ikon: string; aciklama: string }[] = [
  { kod: 'oto_yikama', ad: 'Oto Yıkama', ikon: '🚿', aciklama: 'Araç yıkama planlama, plaka eşleştirme, raporlar.' },
  { kod: 'fms',        ad: 'FMS',         ikon: '🏢', aciklama: 'Facility Management System — bakım, varlık, talep.' },
]

const ROLLER: { rol: string; etiket: string; renk: string }[] = [
  { rol: 'tenant_admin', etiket: 'TA — Firma Admini',    renk: '#e65100' },
  { rol: 'tenant_user',  etiket: 'U — Kullanıcı',        renk: '#6a1b9a' },
  { rol: 'musteri',      etiket: 'M — Müşteri',          renk: '#1565c0' },
]

type YetkiSet = Set<string>  // "rol__modul_kodu"
const k = (rol: string, modul: string) => `${rol}__${modul}`

export default function ModulYetkileriClient({ isSA, firmaId: initialFirmaId, firmalar = [] }: Props) {
  const toast = useToast()
  const [firmaId, setFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const [yetkiSet, setYetkiSet] = useState<YetkiSet>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function yetkileriYukle() {
    setLoading(true)
    try {
      const qs = isSA && firmaId ? `?firma_id=${firmaId}` : ''
      const res = await fetch(`/api/sa/modul-yetkileri${qs}`)
      const data = await res.json()
      if (res.ok && data.ok) {
        const set: YetkiSet = new Set()
        for (const y of data.yetkiler ?? []) set.add(k(y.rol, y.modul_kodu))
        setYetkiSet(set)
        setDirty(false)
      } else {
        toast.toast({ type: 'error', message: data.error ?? 'Yetkiler yüklenemedi' })
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { yetkileriYukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [firmaId])

  function toggle(rol: string, modul: string) {
    setYetkiSet(prev => {
      const next = new Set(prev)
      const key = k(rol, modul)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setDirty(true)
  }

  async function kaydet() {
    setSaving(true)
    try {
      const yetkiler = Array.from(yetkiSet).map(s => {
        const [rol, modul_kodu] = s.split('__')
        return { rol, modul_kodu }
      })
      const res = await fetch('/api/sa/modul-yetkileri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firmaId, yetkiler }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.toast({ type: 'success', message: 'Modül yetkileri kaydedildi' })
        setDirty(false)
      } else {
        toast.toast({ type: 'error', message: data.error ?? 'Kayıt başarısız' })
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="verde-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Modül Yetkileri</h2>
        <p style={{ marginTop: 6, color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
          Hangi rolün hangi modüllere erişebileceğini buradan yönetin. GYS modülü
          her zaman aktiftir ve listede gösterilmez. Modül firma için "aktif değil"
          olsa bile yetki verebilirsiniz; modül aktif edilince yetki otomatik geçerli olur.
        </p>
      </div>

      {isSA && (
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Firma kapsamı:</label>
          <select
            value={firmaId ?? ''}
            onChange={e => setFirmaId(e.target.value || null)}
            style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 13, minWidth: 240, background: '#fff',
            }}
          >
            <option value="">Global (tüm firmalar için varsayılan)</option>
            {firmalar.map(f => (
              <option key={f.id} value={f.id}>
                {f.firma_adi || f.ticari_unvan || f.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', minWidth: 240 }}>
                  Modül
                </th>
                {ROLLER.map(r => (
                  <th key={r.rol} style={{
                    textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e5e7eb',
                    color: r.renk, fontWeight: 700, fontSize: 12,
                  }}>
                    {r.etiket}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULLER.map(m => (
                <tr key={m.kod}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 22 }}>{m.ikon}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{m.ad}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{m.aciklama}</div>
                      </div>
                    </div>
                  </td>
                  {ROLLER.map(r => {
                    const checked = yetkiSet.has(k(r.rol, m.kod))
                    return (
                      <td key={r.rol} style={{ textAlign: 'center', padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(r.rol, m.kod)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
  )
}
