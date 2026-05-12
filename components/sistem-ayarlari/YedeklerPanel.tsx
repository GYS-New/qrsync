'use client'

import React, { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { RefreshCw, Eye, Download, Database, Calendar, FileArchive, RotateCcw, HelpCircle, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'

type YedekDosya = { tablo: string; boyut: number; olusturma: string | null }
type YedekListesi = { tarihler: string[]; detay: Record<string, YedekDosya[]> }

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  gray: '#475569', grayLight: '#f8fafc',
}

function formatBoyut(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`
  return `${(byte / (1024 * 1024)).toFixed(2)} MB`
}

function formatTarih(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })
}

export default function YedeklerPanel() {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [liste, setListe] = useState<YedekListesi | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [seciliTarih, setSeciliTarih] = useState<string | null>(null)
  const [previewVeri, setPreviewVeri] = useState<{ tarih: string; tablo: string; toplam: number; ornek: any[]; boyut_gzip: number; boyut_ham: number } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null)
  const [rehberAcik, setRehberAcik] = useState(false)
  const [acikSenaryo, setAcikSenaryo] = useState<number | null>(0)

  async function yukle() {
    setYukleniyor(true)
    try {
      const res = await fetch('/api/admin/yedekler', { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Yedek listesi alınamadı')
      setListe(j)
      if (!seciliTarih && j.tarihler?.[0]) setSeciliTarih(j.tarihler[0])
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [])

  async function previewYedek(tarih: string, tablo: string) {
    setPreviewLoading(true)
    setPreviewVeri(null)
    try {
      const res = await fetch(`/api/admin/yedekler/${tarih}/${tablo}?preview=1`)
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Önizleme alınamadı')
      setPreviewVeri(j)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setPreviewLoading(false)
    }
  }

  async function indirYedek(tarih: string, tablo: string) {
    try {
      const res = await fetch(`/api/admin/yedekler/${tarih}/${tablo}`)
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'İndirilemedi')
      const blob = new Blob([JSON.stringify(j.rows, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tarih}_${tablo}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ type: 'success', title: 'İndirildi', message: `${j.toplam} satır JSON olarak indirildi` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function geriYukle(tarih: string, tablo: string) {
    const ok = await confirm({
      title: '⚠️ Veri Geri Yükleme',
      message: `"${tablo}" tablosu için ${tarih} tarihli yedek geri yüklenecek.\n\n• Yedekteki kayıtlar mevcut DB ile id bazlı UPSERT edilir (var olanlar üzerine yazılır, eksik olanlar eklenir).\n• DB'de olup yedekte olmayan kayıtlar SİLİNMEZ.\n• İşlem audit_log'a yazılır, geri alınamaz.\n\nDevam etmek için onay kodunu girmeniz gerekiyor.`,
      confirmText: 'Onay Kodu Gir',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return

    // İkinci aşama: onay kodu prompt
    const onay = window.prompt(
      `Lütfen onay kodunu yazın:\n\nRESTORE-${tablo}\n\n(Büyük harf, tire dahil, tam olarak)`
    )
    if (!onay) return

    setRestoreLoading(`${tarih}_${tablo}`)
    try {
      const res = await fetch('/api/admin/yedekler/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarih, tablo, onay }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Restore başarısız')
      toast({
        type: 'success',
        title: '✓ Geri yüklendi',
        message: `${j.toplam_satir} satır upsert edildi (${j.sure_saniye} sn)`,
      })
    } catch (e: any) {
      toast({ type: 'error', title: 'Restore Hatası', message: e.message })
    } finally {
      setRestoreLoading(null)
    }
  }

  const dosyalar = seciliTarih ? (liste?.detay?.[seciliTarih] ?? []) : []
  const toplamBoyut = dosyalar.reduce((s, d) => s + d.boyut, 0)

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: T.blue }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>Veri Yedekleri</h3>
        <button onClick={() => setRehberAcik(true)}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.blue}40`, background: T.blueLight, color: T.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <HelpCircle size={13} />
          Nasıl Yapılır?
        </button>
        <button onClick={yukle} disabled={yukleniyor}
          style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={12} style={yukleniyor ? { animation: 'yp-spin 0.9s linear infinite' } : undefined} />
          Yenile
        </button>
      </div>

      <div style={{ padding: '10px 14px', background: T.blueLight, border: `1px solid ${T.blue}40`, borderRadius: 10, marginBottom: 16, fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
        <strong style={{ color: T.blue }}>ℹ️ Bilgi:</strong> Her gece <strong>TR 00:30</strong>'da kritik tablolar (26 tablo) Supabase Storage'a yedeklenir. <strong>90 gün</strong> retention — eskisi otomatik silinir. Supabase Pro tier'ın built-in backup'larından bağımsız ek bir katmandır.
      </div>

      {!liste || liste.tarihler.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 14, background: T.grayLight, borderRadius: 10 }}>
          {yukleniyor ? 'Yükleniyor…' : 'Henüz yedek alınmamış. Cron Yönetimi panelinden manuel tetikleyebilirsiniz.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
          {/* SOL: Tarih listesi */}
          <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
            <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tarihler ({liste.tarihler.length})
            </div>
            {liste.tarihler.map(tarih => (
              <button key={tarih}
                onClick={() => { setSeciliTarih(tarih); setPreviewVeri(null) }}
                style={{
                  display: 'block', width: '100%', padding: '8px 10px', marginTop: 4,
                  borderRadius: 6, border: 'none', textAlign: 'left',
                  background: tarih === seciliTarih ? T.blue : 'transparent',
                  color: tarih === seciliTarih ? '#fff' : T.text,
                  fontSize: 13, fontWeight: tarih === seciliTarih ? 700 : 500,
                  cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={12} />
                  {tarih}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>
                  {(liste.detay[tarih] ?? []).length} tablo
                </div>
              </button>
            ))}
          </div>

          {/* SAĞ: Seçili tarihteki tablolar */}
          <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 16px' }}>
            {seciliTarih ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
                  <Calendar size={14} color={T.blue} />
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: 0 }}>{formatTarih(seciliTarih)}</h4>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textSoft }}>
                    {dosyalar.length} tablo · {formatBoyut(toplamBoyut)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dosyalar.map(d => {
                    const restoreId = `${seciliTarih}_${d.tablo}`
                    const isRestoring = restoreLoading === restoreId
                    return (
                      <div key={d.tablo} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8,
                        background: T.grayLight, border: `1px solid ${T.border}`,
                      }}>
                        <Database size={14} color={T.textSoft} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: 'monospace', flex: 1 }}>
                          {d.tablo}
                        </span>
                        <span style={{ fontSize: 11, color: T.textSoft, minWidth: 60, textAlign: 'right' }}>
                          {formatBoyut(d.boyut)}
                        </span>
                        <button onClick={() => previewYedek(seciliTarih, d.tablo)} disabled={previewLoading}
                          title="Önizleme — ilk 50 satır"
                          style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.text }}>
                          <Eye size={11} /> Önizle
                        </button>
                        <button onClick={() => indirYedek(seciliTarih, d.tablo)}
                          title="JSON olarak indir"
                          style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.text }}>
                          <Download size={11} /> İndir
                        </button>
                        <button onClick={() => geriYukle(seciliTarih, d.tablo)} disabled={isRestoring}
                          title="Bu yedeği geri yükle (upsert) — KRİTİK İŞLEM"
                          style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: T.red, color: '#fff', cursor: isRestoring ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, opacity: isRestoring ? 0.6 : 1 }}>
                          {isRestoring ? <RefreshCw size={11} style={{ animation: 'yp-spin 0.9s linear infinite' }} /> : <RotateCcw size={11} />}
                          {isRestoring ? 'Yükleniyor…' : 'Geri Yükle'}
                        </button>
                      </div>
                    )
                  })}
                </div>

              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>
                Soldan bir tarih seçin.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Önizleme popup'ı — overlay modal */}
      {(previewLoading || previewVeri) && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { setPreviewVeri(null); setPreviewLoading(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(900px, 96vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              background: '#0f172a', color: '#e2e8f0', borderRadius: 12,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid #1e293b',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid #1e293b' }}>
              <FileArchive size={16} color="#60a5fa" />
              {previewVeri ? (
                <>
                  <strong style={{ color: '#f1f5f9', fontSize: 14, fontFamily: 'monospace' }}>{previewVeri.tablo}</strong>
                  <span style={{ color: '#475569' }}>·</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>{previewVeri.tarih}</span>
                  <span style={{ color: '#475569' }}>·</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}><strong style={{ color: '#cbd5e1' }}>{previewVeri.toplam}</strong> satır toplam, ilk {Math.min(50, previewVeri.toplam)} gösteriliyor</span>
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
                    {formatBoyut(previewVeri.boyut_ham)} → {formatBoyut(previewVeri.boyut_gzip)}
                  </span>
                </>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: 13 }}>Yükleniyor…</span>
              )}
              <button
                onClick={() => { setPreviewVeri(null); setPreviewLoading(false) }}
                style={{ marginLeft: previewVeri ? 12 : 'auto', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 0 }}
                aria-label="Kapat"
              >×</button>
            </div>

            {/* İçerik */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.55 }}>
              {previewLoading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>
                  <RefreshCw size={20} style={{ animation: 'yp-spin 0.9s linear infinite', marginBottom: 8 }} />
                  <div>Önizleme yükleniyor…</div>
                </div>
              ) : previewVeri ? (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(previewVeri.ornek, null, 2)}
                </pre>
              ) : null}
            </div>

            {/* Footer */}
            {previewVeri && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderTop: '1px solid #1e293b', fontSize: 11.5, color: '#94a3b8' }}>
                <span>ESC veya dışına tıklayarak kapat</span>
                <button
                  onClick={() => indirYedek(previewVeri.tarih, previewVeri.tablo)}
                  style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}
                >
                  <Download size={12} /> Tam JSON İndir
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* "Nasıl Yapılır?" rehber popup'ı */}
      {rehberAcik && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setRehberAcik(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(820px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              background: '#fff', borderRadius: 14,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              border: `1px solid ${T.border}`,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${T.border}`, background: T.blueLight }}>
              <HelpCircle size={20} color={T.blue} />
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>Yedekleme ve Geri Yükleme Rehberi</h3>
                <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>Veri kaybı senaryolarında ne yapacağınız adım adım anlatılmıştır.</div>
              </div>
              <button
                onClick={() => setRehberAcik(false)}
                style={{ background: 'transparent', border: 'none', color: T.textSoft, cursor: 'pointer', fontSize: 24, lineHeight: 1, padding: 0 }}
                aria-label="Kapat"
              >×</button>
            </div>

            {/* İçerik — accordion */}
            <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
              {/* Bilgi şeridi */}
              <div style={{ padding: '10px 14px', background: T.amberLight, border: `1px solid ${T.amber}40`, borderRadius: 10, marginBottom: 14, fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>
                <strong style={{ color: T.amber }}>⚠️ Önemli:</strong> Bu sistem Supabase'in yerleşik (built-in) backup'larından <strong>bağımsız bir katman</strong>dır. Tablo bazlı seçici restore için tasarlanmıştır. Veritabanı tamamen çökerse Supabase Dashboard'tan yerleşik backup kullanılır.
              </div>

              {SENARYOLAR.map((s, i) => {
                const acik = acikSenaryo === i
                return (
                  <div key={i} style={{
                    marginBottom: 10, border: `1px solid ${acik ? s.renk : T.border}`,
                    borderRadius: 10, overflow: 'hidden',
                    background: acik ? `${s.renk}08` : '#fff',
                  }}>
                    <button onClick={() => setAcikSenaryo(acik ? null : i)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        textAlign: 'left',
                      }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: 999, background: s.renk, color: '#fff',
                        fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{s.baslik}</div>
                        <div style={{ fontSize: 12, color: T.textSoft, marginTop: 1 }}>{s.ozet}</div>
                      </div>
                      <span style={{
                        padding: '2px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                        background: `${s.renk}1a`, color: s.renk,
                      }}>{s.etiket}</span>
                      {acik ? <ChevronDown size={16} color={T.textSoft} /> : <ChevronRight size={16} color={T.textSoft} />}
                    </button>

                    {acik && (
                      <div style={{ padding: '0 16px 14px', borderTop: `1px dashed ${T.border}`, marginTop: -1 }}>
                        <div style={{ paddingTop: 12, fontSize: 13, color: T.text, lineHeight: 1.65 }}>
                          {s.durum && (
                            <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5 }}>
                              <strong style={{ color: T.textSoft }}>Durum: </strong>{s.durum}
                            </div>
                          )}
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                            Yapılacak Adımlar
                          </div>
                          <ol style={{ paddingLeft: 22, margin: 0 }}>
                            {s.adimlar.map((a, j) => (
                              <li key={j} style={{ marginBottom: 8 }}>
                                {typeof a === 'string' ? a : (
                                  <>
                                    {a.metin}
                                    {a.kod && (
                                      <div style={{ marginTop: 4, padding: '6px 10px', background: '#0f172a', color: '#e2e8f0', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
                                        {a.kod}
                                      </div>
                                    )}
                                  </>
                                )}
                              </li>
                            ))}
                          </ol>
                          {s.uyari && (
                            <div style={{ marginTop: 12, padding: '10px 12px', background: T.amberLight, borderRadius: 8, fontSize: 12.5, color: T.text, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
                              <div><strong style={{ color: T.amber }}>Uyarı: </strong>{s.uyari}</div>
                            </div>
                          )}
                          {s.guvenli && (
                            <div style={{ marginTop: 8, padding: '10px 12px', background: T.greenLight, borderRadius: 8, fontSize: 12.5, color: T.text, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <CheckCircle2 size={14} color={T.green} style={{ flexShrink: 0, marginTop: 2 }} />
                              <div><strong style={{ color: T.green }}>Güvenlik: </strong>{s.guvenli}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '10px 18px', borderTop: `1px solid ${T.border}`, background: T.grayLight, fontSize: 12, color: T.textSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Bu rehberi her zaman üst sağdaki <strong style={{ color: T.text }}>Nasıl Yapılır?</strong> butonundan açabilirsiniz.</span>
              <button onClick={() => setRehberAcik(false)}
                style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: 'none', background: T.text, color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes yp-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Senaryo içerikleri ────────────────────────────────────────────────
type Adim = string | { metin: string; kod?: string }
type Senaryo = {
  baslik: string
  ozet: string
  etiket: string
  renk: string
  durum?: string
  adimlar: Adim[]
  uyari?: string
  guvenli?: string
}

const SENARYOLAR: Senaryo[] = [
  {
    baslik: 'Belirli görevler / kayıtlar kaybolmuş',
    ozet: 'Bug, yanlış toplu silme veya beklenmedik DELETE sonucu birkaç tablo etkilenmiş.',
    etiket: 'TABLO-BAZLI',
    renk: '#1d4ed8',
    durum: 'Örnek: "2 gün önceki görevler listede yok ama o gün yapılmıştı." Sistem genel çalışıyor, sadece veri eksik.',
    adimlar: [
      'Hangi tablonun etkilendiğini tespit edin (genelde canli_gorevler_arsiv, gorevler_arsiv, musteri_degerlendirmeleri).',
      'Sol kolondaki tarih listesinden BUG ÖNCESİ en yakın yedek tarihini seçin (yedekler her gece 00:30 TR alınır — örn. 12 May için 12 May 00:30 yedeği, 11 May verisini içerir).',
      'Sağdaki tablo listesinden etkilenen tabloyu bulun.',
      '"Önizle" butonu ile içeriği kontrol edin — kayıp verinin orada olduğunu doğrulayın.',
      { metin: '"Geri Yükle" butonuna basın. Onay diyaloğunu okuyun, sonra prompt\'a tam onay kodunu yazın:', kod: 'RESTORE-canli_gorevler_arsiv' },
      'Toast "✓ Geri yüklendi — N satır upsert edildi" gözükmeli. İşlem audit_log\'a yazılır.',
      'İlgili sayfayı yenileyerek kaybın düzeldiğini doğrulayın.',
    ],
    guvenli: 'Restore upsert mantığı ile çalışır — id bazlı eşleşme. Yedekte olmayıp DB\'de olan kayıtlar (10 May sonrası eklenen yeni işler vb.) silinmez. Eksik olanlar tamamlanır, var olanlar güncellenir.',
    uyari: 'Görev verisi kayıpsa ve checklist sonuçları da eksikse checklist_sonuc_basliklari_arsiv + checklist_sonuc_maddeleri_arsiv tablolarını da aynı tarihten restore edin (parent → child sırasıyla).',
  },
  {
    baslik: 'Yanlışlıkla yapılmış toplu güncelleme / migration',
    ozet: 'Bir SQL/migration toplu olarak yanlış değer yazdı ve geri alınamıyor.',
    etiket: 'CERRAHI',
    renk: '#d97706',
    durum: 'Örnek: "Migration 045 tüm görevlerin durumunu yanlış değiştirdi" veya "UPDATE statement WHERE clause yanlıştı".',
    adimlar: [
      'Sorunu durdurun — eğer cron veya tetik halen çalışıp daha fazla satırı bozuyorsa Sistem Ayarları > Cron Yönetimi\'nden ilgili cron\'u manuel devre dışı bırakın.',
      'Bug öncesi en yakın yedeği belirleyin (saat farkına bakın — yedek 00:30\'da alınır, bug 10:00\'da olduysa 10:00 yedeği YOK demektir, bir gün öncesini seçin).',
      'Etkilenen tabloyu restore edin (Senaryo 1\'deki adımlar).',
      'Bug öncesinden sonra (yedek anı ile bug anı arasında) yapılmış meşru değişiklikler varsa onları manuel olarak yeniden uygulayın.',
    ],
    uyari: 'Bu sistem 24 saatten daha eski olmayan veri kaybı için optimaldir. Bug uzun süre fark edilmediyse (örn. 10 gün sonra) o aralıktaki tüm meşru değişiklikler de yedeklenmiş olur — geri yükleme onları da değiştirir. Bu durumda daha çok manuel inceleme gerekir.',
  },
  {
    baslik: 'Veritabanı tamamen çöktü / büyük veri kaybı',
    ozet: 'Tüm tablolar boş, DB corruption, hardware sorunu — bizim sistem yetersiz.',
    etiket: 'FULL-DB',
    renk: '#dc2626',
    durum: 'Örnek: Supabase\'de bir extension bug\'ı, accidental drop database, infra arıza. Bizim yedekleme sistemi DEVREYE GİRMEZ — Supabase\'in yerleşik backup\'ı kullanılır.',
    adimlar: [
      'Panik yapmayın — Supabase Pro tier (aktif) günlük yerleşik backup alır (14-30 gün retention).',
      'Supabase Dashboard\'a giriş yapın → seçili proje → Database → Backups menüsü.',
      'Bug öncesi son sağlam backup\'ı seçin → "Restore" butonuna basın.',
      'Tüm veritabanı o ana geri yüklenir (tablolar + RLS + function\'lar + Storage\'daki yedek dosyaları). 30 dakika ila 2 saat sürebilir.',
      'Restore tamamlanınca uygulamayı test edin. Bizim Storage yedekleri de geri gelmiş olur (90 günlük arşiv).',
      'Restore noktasından sonra yapılmış işler kaybolur — kullanıcılarla iletişime geçilmesi gerekebilir.',
    ],
    uyari: 'Built-in backup günlük alındığı için en son backup\'tan itibaren yapılmış tüm işler kaybolur. Saniyelik granularity için PITR (Point-in-Time Recovery) opsiyonu Supabase Pro+\'da ekstra ücretle aktif edilir.',
    guvenli: 'Bu işlem sırasında bizim Storage backup\'ları da etkilenmez (Supabase Storage farklı bir altyapı). Restore sonrası Storage dosyaları doğrudan erişilebilir kalır.',
  },
  {
    baslik: 'Sistem kodu / Next.js uygulaması çöktü',
    ozet: 'Hatalı deploy, runtime error, build fail — kod hasarı, DB sağlam.',
    etiket: 'KOD',
    renk: '#7c3aed',
    durum: 'Örnek: Bir commit production\'a gitti, sayfa açılmıyor veya hata veriyor. Veritabanı sağlam, sadece app katmanı bozuk. Bizim yedekleme sistemi bu durumda yardımcı OLMAZ — Git/Railway kullanılır.',
    adimlar: [
      'Railway Dashboard → Deployments → son sağlam deploy\'u bulun → "Rollback" butonu.',
      { metin: 'Alternatif: Git ile son sağlam commit\'e dönün:', kod: 'git log --oneline\ngit revert <hatali_commit>\ngit push' },
      'Railway otomatik olarak yeni deploy yapar (~2-3 dakika).',
      'Uygulamanın geri geldiğini doğrulayın.',
      'Bu işlem veritabanına dokunmaz — tüm veriler korunur.',
    ],
    guvenli: 'Kod rollback DB\'yi etkilemez. Bizim yedekleme sistemi sadece DB içeriği için — kod yedeği GitHub\'tır.',
  },
]
