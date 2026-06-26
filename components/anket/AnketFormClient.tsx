'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import { useToast } from '@/components/ui/ToastProvider'
import { Plus, Trash2, Search, Save, Send } from 'lucide-react'

type Firma = { id: string; firma_adi: string; personel_sayisi: number }
type Proje = { id: string; ad: string; firma_id: string }
type User = { id: string; isim_soyisim: string; firma_id: string; firma_adi: string; proje_id: string | null; proje_adi: string | null; rol: string }

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  gray: '#475569', grayLight: '#f8fafc',
}

const inp: React.CSSProperties = {
  height: 36, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, width: '100%',
}

export default function AnketFormClient({ base }: { base: string }) {
  const router = useRouter()
  const { toast } = useToast()

  const [baslik, setBaslik] = useState('')
  const [soru, setSoru] = useState('')
  const [tip, setTip] = useState<'evet_hayir' | 'coktan_secmeli' | 'kisa_metin'>('evet_hayir')
  const [secenekler, setSecenekler] = useState<string[]>(['', ''])
  const [aciklamaIste, setAciklamaIste] = useState(true)
  const [sonGecerli, setSonGecerli] = useState<string>(() => {
    // Default: +7 gün
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const tz = 3 * 60 * 60 * 1000
    return new Date(d.getTime() + tz).toISOString().slice(0, 16)
  })

  const [hedefTab, setHedefTab] = useState<'firma' | 'kisi'>('firma')
  const [secilenFirmaIds, setSecilenFirmaIds] = useState<Set<string>>(new Set())
  const [secilenUserIds, setSecilenUserIds] = useState<Set<string>>(new Set())
  const [arama, setArama] = useState('')

  const [pushGonder, setPushGonder] = useState(true)
  const [durum, setDurum] = useState<'aktif' | 'taslak'>('aktif')

  const [firmalar, setFirmalar] = useState<Firma[]>([])
  const [projeler, setProjeler] = useState<Proje[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Kişi sekmesi filtreleri — proje bazlı izolasyon için
  const [filtreFirmaId, setFiltreFirmaId] = useState<string>('')
  const [filtreProjeId, setFiltreProjeId] = useState<string>('')

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/sa/anketler/hedef-listesi')
        const j = await r.json()
        if (j.ok) {
          setFirmalar(j.firmalar ?? [])
          setProjeler(j.projeler ?? [])
          setUsers(j.users ?? [])
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Filtre dropdown'ları: firma seçilince proje listesi daralır
  const firmaProjeleri = useMemo(() => {
    if (!filtreFirmaId) return projeler
    return projeler.filter(p => p.firma_id === filtreFirmaId)
  }, [projeler, filtreFirmaId])

  // Firma değişince proje filtresini sıfırla (uyumsuz proje seçili kalmasın)
  useEffect(() => {
    if (filtreProjeId && !firmaProjeleri.some(p => p.id === filtreProjeId)) {
      setFiltreProjeId('')
    }
  }, [filtreFirmaId, firmaProjeleri, filtreProjeId])

  const filteredUsers = useMemo(() => {
    let list = users
    // Firma filtresi
    if (filtreFirmaId) list = list.filter(u => u.firma_id === filtreFirmaId)
    // Proje filtresi — sadece o projeye atanmış kullanıcılar
    if (filtreProjeId) list = list.filter(u => u.proje_id === filtreProjeId)
    // Arama metin filtresi
    if (arama.trim()) {
      const q = arama.trim().toLocaleLowerCase('tr')
      list = list.filter(u =>
        u.isim_soyisim.toLocaleLowerCase('tr').includes(q) ||
        u.firma_adi.toLocaleLowerCase('tr').includes(q) ||
        (u.proje_adi ?? '').toLocaleLowerCase('tr').includes(q)
      )
    }
    return list
  }, [users, arama, filtreFirmaId, filtreProjeId])

  // Seçilen toplam hedef adedi (firma altı + ek kişi, distinct user_id)
  const toplamHedef = useMemo(() => {
    const set = new Set<string>(secilenUserIds)
    for (const fid of secilenFirmaIds) {
      for (const u of users) if (u.firma_id === fid) set.add(u.id)
    }
    return set.size
  }, [secilenFirmaIds, secilenUserIds, users])

  function toggleFirma(id: string) {
    setSecilenFirmaIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleUser(id: string) {
    setSecilenUserIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function secenekEkle() {
    if (secenekler.length >= 8) return
    setSecenekler(s => [...s, ''])
  }
  function secenekSil(i: number) {
    setSecenekler(s => s.filter((_, idx) => idx !== i))
  }
  function secenekGuncelle(i: number, v: string) {
    setSecenekler(s => s.map((x, idx) => idx === i ? v : x))
  }

  async function gonder() {
    if (!baslik.trim()) return toast({ type: 'error', title: 'Hata', message: 'Başlık gerekli' })
    if (!soru.trim()) return toast({ type: 'error', title: 'Hata', message: 'Soru gerekli' })
    if (tip === 'coktan_secmeli') {
      const tmz = secenekler.map(s => s.trim()).filter(Boolean)
      if (tmz.length < 2) return toast({ type: 'error', title: 'Hata', message: 'En az 2 seçenek girin' })
    }
    if (secilenFirmaIds.size === 0 && secilenUserIds.size === 0) {
      return toast({ type: 'error', title: 'Hata', message: 'En az bir hedef seç (firma veya kişi)' })
    }

    setSubmitting(true)
    try {
      const body = {
        baslik: baslik.trim(),
        soru: soru.trim(),
        tip,
        secenekler: tip === 'coktan_secmeli' ? secenekler.map(s => s.trim()).filter(Boolean) : null,
        aciklama_iste: aciklamaIste,
        son_gecerli: sonGecerli ? new Date(sonGecerli).toISOString() : null,
        hedef_user_ids: Array.from(secilenUserIds),
        hedef_firma_ids: Array.from(secilenFirmaIds),
        push_gonder: pushGonder,
        durum,
      }
      const res = await fetch('/api/sa/anketler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Kayıt başarısız')
      toast({
        type: 'success',
        title: 'Anket oluşturuldu',
        message: pushGonder && durum === 'aktif' ? `${j.push_adet} kişiye push gönderildi` : 'Push gönderilmedi',
      })
      router.push(`${base}/dashboard/anketler/${j.anket_id}`)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Sunucu hatası' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Topbar title="Yeni Anket" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Mobil Anketler', href: `${base}/dashboard/anketler` }, { label: 'Yeni' }]} />

      <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, alignItems: 'start' }}>
        {/* SOL: Anket içeriği */}
        <div className="verde-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Başlık" hint="Yöneticiye özet, kullanıcı da görür">
            <input value={baslik} onChange={e => setBaslik(e.target.value)} style={inp} placeholder="5G Şebeke Sorusu" />
          </Field>

          <Field label="Soru metni" hint="Kullanıcıya gösterilen tam soru cümlesi">
            <textarea value={soru} onChange={e => setSoru(e.target.value)} rows={3}
              style={{ ...inp, height: 'auto', padding: 10, resize: 'vertical' }}
              placeholder="Örn: Son 1 haftada 'çevrim dışı kaydedildi' uyarısı gördünüz mü?" />
          </Field>

          <Field label="Soru tipi">
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { v: 'evet_hayir', t: 'Evet / Hayır' },
                { v: 'coktan_secmeli', t: 'Çoktan seçmeli' },
                { v: 'kisa_metin', t: 'Kısa metin' },
              ].map(o => (
                <button key={o.v} onClick={() => setTip(o.v as any)}
                  type="button"
                  style={{
                    flex: 1, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                    border: tip === o.v ? `2px solid ${T.blue}` : `1px solid ${T.border}`,
                    background: tip === o.v ? T.blueLight : '#fff',
                    color: tip === o.v ? T.blue : T.text,
                  }}>
                  {o.t}
                </button>
              ))}
            </div>
          </Field>

          {tip === 'coktan_secmeli' && (
            <Field label="Seçenekler" hint="Maks 8">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {secenekler.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input value={s} onChange={e => secenekGuncelle(i, e.target.value)}
                      style={inp} placeholder={`Seçenek ${i + 1}`} />
                    {secenekler.length > 2 && (
                      <button type="button" onClick={() => secenekSil(i)}
                        style={{ height: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.red, cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {secenekler.length < 8 && (
                  <button type="button" onClick={secenekEkle}
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: `1px dashed ${T.border}`, background: '#fff', color: T.textSoft, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Seçenek ekle
                  </button>
                )}
              </div>
            </Field>
          )}

          <Field label="">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={aciklamaIste} onChange={e => setAciklamaIste(e.target.checked)} />
              Kullanıcıya opsiyonel açıklama alanı göster
            </label>
          </Field>

          <Field label="Son geçerlilik" hint="Bu tarihten sonra cevap kabul edilmez (boş bırak = sınırsız)">
            <input type="datetime-local" value={sonGecerli} onChange={e => setSonGecerli(e.target.value)}
              style={inp} />
          </Field>
        </div>

        {/* SAĞ: Hedef + gönderim */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="verde-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Hedef ({toplamHedef} kişi)
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[
                { v: 'firma', t: 'Firma Bazlı' },
                { v: 'kisi', t: 'Kişi Bazlı' },
              ].map(o => (
                <button key={o.v} type="button" onClick={() => setHedefTab(o.v as any)}
                  style={{
                    flex: 1, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    border: hedefTab === o.v ? `2px solid ${T.blue}` : `1px solid ${T.border}`,
                    background: hedefTab === o.v ? T.blueLight : '#fff',
                    color: hedefTab === o.v ? T.blue : T.text,
                  }}>{o.t}</button>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: T.textSoft, fontSize: 12 }}>Yükleniyor…</div>
            ) : hedefTab === 'firma' ? (
              <div style={{ maxHeight: 320, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
                {firmalar.map(f => (
                  <label key={f.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, background: secilenFirmaIds.has(f.id) ? T.blueLight : '#fff' }}>
                    <input type="checkbox" checked={secilenFirmaIds.has(f.id)} onChange={() => toggleFirma(f.id)} />
                    <span style={{ flex: 1, fontSize: 13, color: T.text, fontWeight: 600 }}>{f.firma_adi}</span>
                    <span style={{ fontSize: 11, color: T.textSoft }}>{f.personel_sayisi} personel</span>
                  </label>
                ))}
              </div>
            ) : (
              <>
                {/* Firma + Proje filtreleri — her proje sadece kendi kullanıcılarına anket göndersin */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <select value={filtreFirmaId} onChange={e => setFiltreFirmaId(e.target.value)}
                    style={{ ...inp, height: 30, fontSize: 12 }}>
                    <option value="">Firma (Tümü)</option>
                    {firmalar.map(f => <option key={f.id} value={f.id}>{f.firma_adi}</option>)}
                  </select>
                  <select value={filtreProjeId} onChange={e => setFiltreProjeId(e.target.value)}
                    style={{ ...inp, height: 30, fontSize: 12 }}
                    disabled={firmaProjeleri.length === 0}>
                    <option value="">Proje (Tümü)</option>
                    {firmaProjeleri.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8 }}>
                  <Search size={13} color={T.textSoft} />
                  <input value={arama} onChange={e => setArama(e.target.value)} placeholder="İsim, firma veya proje ara…"
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5 }} />
                </div>
                {(filtreFirmaId || filtreProjeId) && (
                  <div style={{ marginBottom: 6, padding: '4px 8px', borderRadius: 4, background: T.greenLight, color: T.green, fontSize: 11, fontWeight: 600 }}>
                    {filtreProjeId
                      ? `Sadece ${firmaProjeleri.find(p => p.id === filtreProjeId)?.ad} projesinin kullanıcıları`
                      : `Sadece ${firmalar.find(f => f.id === filtreFirmaId)?.firma_adi} firması`} · {filteredUsers.length} kişi
                  </div>
                )}
                <div style={{ maxHeight: 260, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
                  {filteredUsers.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', color: T.textSoft, fontSize: 12 }}>Eşleşen kullanıcı yok</div>
                  ) : filteredUsers.map(u => (
                    <label key={u.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, background: secilenUserIds.has(u.id) ? T.blueLight : '#fff' }}>
                      <input type="checkbox" checked={secilenUserIds.has(u.id)} onChange={() => toggleUser(u.id)} />
                      <span style={{ flex: 1, fontSize: 12.5, color: T.text }}>
                        <strong>{u.isim_soyisim}</strong>
                        <span style={{ color: T.textSoft, marginLeft: 6 }}>
                          ({u.firma_adi}{u.proje_adi ? ` · ${u.proje_adi}` : ''})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div style={{ marginTop: 8, fontSize: 11, color: T.textSoft }}>
              İki tab birden doldurulabilir (firma + ek kişi). Toplam kişi sayısı tekilleştirilir.
            </div>
          </div>

          <div className="verde-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Gönderim
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={pushGonder} onChange={e => setPushGonder(e.target.checked)} />
              Oluşturulduğunda push bildirim gönder
            </label>
            <Field label="Durum">
              <select value={durum} onChange={e => setDurum(e.target.value as any)} style={inp}>
                <option value="aktif">Aktif (yayında)</option>
                <option value="taslak">Taslak (push atılmaz)</option>
              </select>
            </Field>
            <button onClick={gonder} disabled={submitting}
              style={{
                height: 42, borderRadius: 8, border: 'none', background: T.blue, color: '#fff',
                fontSize: 14, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: submitting ? 0.6 : 1,
              }}>
              {pushGonder && durum === 'aktif' ? <Send size={15} /> : <Save size={15} />}
              {submitting ? 'Gönderiliyor…' : (pushGonder && durum === 'aktif' ? 'Oluştur ve Gönder' : 'Kaydet')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <div style={{ fontSize: 11.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
          {label}
        </div>
      )}
      {children}
      {hint && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}
