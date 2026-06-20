'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Mail, Plus, Trash2, Power, Clock, Calendar, Loader2, Send, X } from 'lucide-react'

type Tekrar = 'gunluk' | 'haftalik' | 'aylik'

type Zamanlama = {
  id: string
  firma_id: string
  alici_emails: string[]
  konu: string | null
  tekrar_tipi: Tekrar
  gun_secimi: number[] | null
  saat: string
  aciklama: string | null
  aktif: boolean
  son_gonderim_tarihi: string | null
  sonraki_gonderim_tarihi: string
  olusturma_tarihi: string
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  purple: '#7c3aed', purpleLight: '#f3e8ff',
  grayLight: '#f8fafc',
}

const GUN_AD = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const GUN_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const TEKRAR_AD: Record<Tekrar, string> = {
  gunluk: 'Günlük', haftalik: 'Haftalık', aylik: 'Aylık',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul',
  }).format(new Date(iso))
}

export default function RaporGonderimiClient({ firmaId }: { firmaId: string }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [zamanlamalar, setZamanlamalar] = useState<Zamanlama[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [yeniModal, setYeniModal] = useState(false)

  async function yukle() {
    setYukleniyor(true)
    try {
      const res = await fetch(`/api/oto-yikama/rapor-zamanlama?firma_id=${firmaId}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      setZamanlamalar(j.data ?? [])
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(() => { yukle() /* eslint-disable-next-line */ }, [firmaId])

  async function toggleAktif(z: Zamanlama) {
    try {
      const res = await fetch(`/api/oto-yikama/rapor-zamanlama`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: z.id, aktif: !z.aktif }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: z.aktif ? 'Devre dışı' : 'Aktive edildi', message: z.alici_emails[0] ?? '' })
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function sil(z: Zamanlama) {
    const ok = await confirm({
      title: 'Zamanlamayı Sil',
      message: `Bu rapor gönderim planı silinecek. Alıcılar: ${z.alici_emails.join(', ')}. Onaylıyor musunuz?`,
      confirmText: 'Sil', cancelText: 'İptal', variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/oto-yikama/rapor-zamanlama?id=${z.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: 'Silindi', message: z.alici_emails[0] ?? '' })
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Üst bar */}
      <div className="verde-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Mail size={16} color={T.blue} /> Otomatik Rapor Gönderimi
          </div>
          <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
            Belirlediğiniz periyot ve saatte alıcılara Excel rapor mail olarak gönderilir.
            Cron her 15 dakikada bir vakti gelmiş zamanlamaları işler.
          </div>
        </div>
        <button onClick={() => setYeniModal(true)}
          style={{
            padding: '9px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(145deg, #1d4ed8, #1e40af)', color: '#fff',
            cursor: 'pointer', fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
          <Plus size={14} /> Yeni Gönderim Planla
        </button>
      </div>

      {/* Liste */}
      <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
        {yukleniyor ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textSoft }}>
            <Loader2 size={22} style={{ animation: 'spin 0.9s linear infinite' }} />
            <div style={{ marginTop: 6 }}>Yükleniyor…</div>
          </div>
        ) : zamanlamalar.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: T.textSoft }}>
            <Mail size={28} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Henüz rapor gönderim planı yok</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>"Yeni Gönderim Planla" ile başlayın.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.grayLight }}>
                <Th>Alıcılar</Th>
                <Th>Periyot</Th>
                <Th>Saat</Th>
                <Th>Sonraki Gönderim</Th>
                <Th>Son Gönderim</Th>
                <Th align="center">Durum</Th>
                <Th align="right">İşlem</Th>
              </tr>
            </thead>
            <tbody>
              {zamanlamalar.map(z => (
                <tr key={z.id} style={{ opacity: z.aktif ? 1 : 0.55 }}>
                  <Td>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                      {z.alici_emails.slice(0, 2).join(', ')}
                      {z.alici_emails.length > 2 && (
                        <span style={{ color: T.textSoft, fontWeight: 400 }}> +{z.alici_emails.length - 2} daha</span>
                      )}
                    </div>
                    {z.konu && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>{z.konu}</div>}
                  </Td>
                  <Td>
                    <span style={{
                      padding: '3px 9px', borderRadius: 999,
                      background: z.tekrar_tipi === 'gunluk' ? T.blueLight : z.tekrar_tipi === 'haftalik' ? T.greenLight : T.purpleLight,
                      color: z.tekrar_tipi === 'gunluk' ? T.blue : z.tekrar_tipi === 'haftalik' ? T.green : T.purple,
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {TEKRAR_AD[z.tekrar_tipi]}
                    </span>
                    {z.tekrar_tipi === 'haftalik' && z.gun_secimi?.[0] && (
                      <div style={{ fontSize: 11, color: T.textSoft, marginTop: 3 }}>{GUN_AD[z.gun_secimi[0]]}</div>
                    )}
                    {z.tekrar_tipi === 'aylik' && z.gun_secimi?.[0] && (
                      <div style={{ fontSize: 11, color: T.textSoft, marginTop: 3 }}>Ayın {z.gun_secimi[0]}. günü</div>
                    )}
                  </Td>
                  <Td><span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>{z.saat.slice(0, 5)}</span></Td>
                  <Td muted><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmtDateTime(z.sonraki_gonderim_tarihi)}</span></Td>
                  <Td muted><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmtDateTime(z.son_gonderim_tarihi)}</span></Td>
                  <Td align="center">
                    <button onClick={() => toggleAktif(z)}
                      title={z.aktif ? 'Devre dışı bırak' : 'Aktive et'}
                      style={{
                        padding: '4px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: z.aktif ? T.greenLight : '#f1f5f9',
                        color: z.aktif ? T.green : T.textSoft,
                        fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}>
                      <Power size={11} /> {z.aktif ? 'AKTİF' : 'KAPALI'}
                    </button>
                  </Td>
                  <Td align="right">
                    <button onClick={() => sil(z)} title="Sil"
                      style={{ padding: 6, borderRadius: 5, border: `1px solid ${T.redLight}`, background: '#fff', cursor: 'pointer', color: T.red }}>
                      <Trash2 size={13} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {yeniModal && (
        <YeniModal firmaId={firmaId} onClose={() => setYeniModal(false)} onSaved={() => { setYeniModal(false); yukle() }} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function YeniModal({ firmaId, onClose, onSaved }: {
  firmaId: string; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast()
  const [emails, setEmails] = useState('')
  const [konu, setKonu] = useState('')
  const [tekrar, setTekrar] = useState<Tekrar>('haftalik')
  const [haftaGunu, setHaftaGunu] = useState<number>(1)  // Pzt
  const [ayGunu, setAyGunu] = useState<number>(1)
  const [saat, setSaat] = useState('08:00')
  const [aciklama, setAciklama] = useState('')
  const [kaydet, setKaydet] = useState(false)

  const aliciList = useMemo(() => {
    return emails.split(/[,;\n]/).map(e => e.trim()).filter(Boolean)
  }, [emails])
  const gecerliMi = aliciList.length > 0 && aliciList.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))

  async function kaydetClick() {
    if (!gecerliMi) {
      toast({ type: 'error', title: 'Hata', message: 'Geçerli en az bir e-posta gerekli' })
      return
    }
    setKaydet(true)
    try {
      const body: any = {
        firma_id: firmaId,
        alici_emails: aliciList,
        tekrar_tipi: tekrar,
        saat,
        konu: konu.trim() || null,
        aciklama: aciklama.trim() || null,
      }
      if (tekrar === 'haftalik') body.gun_secimi = [haftaGunu]
      if (tekrar === 'aylik') body.gun_secimi = [ayGunu]
      const res = await fetch('/api/oto-yikama/rapor-zamanlama', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: 'Planlandı', message: `${aliciList.length} alıcıya gönderim planı oluşturuldu` })
      onSaved()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setKaydet(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="verde-card"
        style={{ width: 'min(560px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Send size={16} color={T.blue} /> Yeni Gönderim Planla
          </div>
          <button onClick={onClose} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.textSoft }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Alıcı E-postaları *" hint="Virgül, noktalı virgül veya satır ile ayırın">
            <textarea value={emails} onChange={e => setEmails(e.target.value)}
              placeholder="ornek@firma.com, ikinci@firma.com"
              style={{ width: '100%', minHeight: 70, padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: gecerliMi ? T.green : T.amber, marginTop: 4 }}>
              {aliciList.length > 0
                ? `${aliciList.length} alıcı ${gecerliMi ? '✓' : '⚠️ geçersiz adres var'}`
                : 'Henüz alıcı yok'}
            </div>
          </Field>

          <Field label="Mail Konusu" hint="Boş bırakılırsa otomatik üretilir">
            <input type="text" value={konu} onChange={e => setKonu(e.target.value)}
              placeholder="Oto Yıkama Raporu (otomatik)"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6 }} />
          </Field>

          <Field label="Gönderim Periyodu *">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {(['gunluk', 'haftalik', 'aylik'] as Tekrar[]).map(t => (
                <button key={t} type="button" onClick={() => setTekrar(t)}
                  style={{
                    padding: '10px 8px', borderRadius: 7, cursor: 'pointer',
                    border: `1.5px solid ${tekrar === t ? T.blue : T.border}`,
                    background: tekrar === t ? T.blueLight : '#fff',
                    color: tekrar === t ? T.blue : T.text,
                    fontSize: 13, fontWeight: 700,
                  }}>
                  {TEKRAR_AD[t]}
                </button>
              ))}
            </div>
          </Field>

          {tekrar === 'haftalik' && (
            <Field label="Haftanın Günü *">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 7].map(g => (
                  <button key={g} type="button" onClick={() => setHaftaGunu(g)}
                    style={{
                      padding: '8px 4px', borderRadius: 6, cursor: 'pointer',
                      border: `1.5px solid ${haftaGunu === g ? T.blue : T.border}`,
                      background: haftaGunu === g ? T.blue : '#fff',
                      color: haftaGunu === g ? '#fff' : T.text,
                      fontSize: 12, fontWeight: 700,
                    }}>
                    {GUN_KISA[g]}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {tekrar === 'aylik' && (
            <Field label="Ayın Günü *" hint="1-28 arası (bazı aylarda 29-31 günler yok)">
              <input type="number" min={1} max={28} value={ayGunu}
                onChange={e => setAyGunu(Math.max(1, Math.min(28, parseInt(e.target.value || '1', 10))))}
                style={{ width: 100, padding: '8px 10px', fontSize: 14, fontWeight: 700, border: `1px solid ${T.border}`, borderRadius: 6 }} />
            </Field>
          )}

          <Field label="Gönderim Saati *" hint="Türkiye saati (TR)">
            <input type="time" value={saat} onChange={e => setSaat(e.target.value)}
              style={{ width: 130, padding: '8px 10px', fontSize: 14, fontWeight: 700, border: `1px solid ${T.border}`, borderRadius: 6 }} />
          </Field>

          <div style={{ padding: '10px 12px', background: T.amberLight, border: `1px solid #fde68a`, borderRadius: 6, fontSize: 12, color: '#78350f' }}>
            📅 <strong>Rapor aralığı:</strong>{' '}
            {tekrar === 'gunluk' && 'Önceki gün (1 günlük rapor)'}
            {tekrar === 'haftalik' && 'Önceki hafta (Pzt-Paz, 7 günlük rapor)'}
            {tekrar === 'aylik' && 'Önceki ayın tamamı (1.–son gün)'}
          </div>

          <Field label="Açıklama" hint="Mail gövdesine eklenir (opsiyonel)">
            <textarea value={aciklama} onChange={e => setAciklama(e.target.value)}
              placeholder="Örn: Haftalık operasyon özeti."
              style={{ width: '100%', minHeight: 60, padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, resize: 'vertical' }} />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
          <button onClick={onClose} disabled={kaydet}
            style={{ padding: '8px 14px', borderRadius: 7, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            İptal
          </button>
          <button onClick={kaydetClick} disabled={kaydet || !gecerliMi}
            style={{
              padding: '8px 18px', borderRadius: 7, border: 'none',
              background: kaydet || !gecerliMi ? '#cbd5e1' : 'linear-gradient(145deg, #1d4ed8, #1e40af)',
              color: '#fff', cursor: kaydet || !gecerliMi ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {kaydet
              ? <><Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> Planlanıyor…</>
              : <><Send size={13} /> Gönderimi Planla</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: T.textSoft, marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th style={{
      textAlign: align ?? 'left', padding: '10px 12px',
      borderBottom: `2px solid ${T.border}`, color: '#374151',
      fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700,
    }}>{children}</th>
  )
}

function Td({ children, muted, align }: { children: React.ReactNode; muted?: boolean; align?: 'left' | 'right' | 'center' }) {
  return (
    <td style={{
      padding: '11px 12px', borderBottom: `1px solid #f1f5f9`,
      textAlign: align ?? 'left', color: muted ? T.textSoft : T.text,
    }}>{children}</td>
  )
}
