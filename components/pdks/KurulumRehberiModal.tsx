'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Printer, FileDown, Edit2, Save, RefreshCw } from 'lucide-react'

interface Props {
  acik: boolean
  onKapat: () => void
  isSA: boolean
  onKayit?: () => void
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  blue: '#1d4ed8',
  gray: '#475569', grayLight: '#f8fafc',
}

type Data = { versiyon: string; tarih: string; icerik: string; guncelleme_tarihi: string | null }

/**
 * Basit markdown → HTML donusum. Ex kutuphane eklemek yerine 4 pattern:
 *   # ## ### baslik | **bold** | `code` | > blockquote | | table | | - liste
 * Adım 4 vurgusu icin özel <div class="uyari"> pattern'i yerine spec markdown
 * blockquote (>) kullaniyoruz, CSS'te vurgulu render.
 */
function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  let html = ''
  let inList = false
  let inTable = false
  let inCode = false
  let inQuote = false
  const closeList = () => { if (inList) { html += '</ul>'; inList = false } }
  const closeTable = () => { if (inTable) { html += '</tbody></table>'; inTable = false } }
  const closeCode = () => { if (inCode) { html += '</code></pre>'; inCode = false } }
  const closeQuote = () => { if (inQuote) { html += '</blockquote>'; inQuote = false } }
  const closeAll = () => { closeList(); closeTable(); closeCode(); closeQuote() }

  const inline = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')

  for (const raw of lines) {
    const line = raw
    // Code fence
    if (/^```/.test(line)) {
      if (inCode) { html += '</code></pre>'; inCode = false } else {
        closeList(); closeTable(); closeQuote()
        html += '<pre class="rehber-pre"><code>'
        inCode = true
      }
      continue
    }
    if (inCode) { html += (line.replace(/&/g, '&amp;').replace(/</g, '&lt;')) + '\n'; continue }

    // Headings
    let m = /^(#{1,4})\s+(.*)$/.exec(line)
    if (m) {
      closeAll()
      const level = m[1].length
      html += `<h${level} class="rehber-h${level}">${inline(m[2])}</h${level}>`
      continue
    }
    // Blockquote (uyari kutusu)
    if (/^>\s?/.test(line)) {
      closeList(); closeTable(); closeCode()
      if (!inQuote) { html += '<blockquote class="rehber-uyari">'; inQuote = true }
      html += `<p>${inline(line.replace(/^>\s?/, ''))}</p>`
      continue
    } else { closeQuote() }

    // Table
    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      const isSep = cells.every(c => /^-+$/.test(c))
      if (isSep) continue
      closeList(); closeCode()
      if (!inTable) { html += '<table class="rehber-table"><thead><tr>' + cells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'; inTable = true; continue }
      html += '<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'
      continue
    } else { closeTable() }

    // List
    if (/^-\s+/.test(line)) {
      closeCode()
      if (!inList) { html += '<ul class="rehber-list">'; inList = true }
      html += `<li>${inline(line.replace(/^-\s+/, ''))}</li>`
      continue
    } else if (line.trim() === '') {
      closeList()
      html += ''
      continue
    } else { closeList() }

    // Paragraph
    html += `<p>${inline(line)}</p>`
  }
  closeAll()
  return html
}

export default function KurulumRehberiModal({ acik, onKapat, isSA, onKayit }: Props) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [duzenleModu, setDuzenleModu] = useState(false)
  const [taslak, setTaslak] = useState<Data | null>(null)
  const [kaydediyor, setKaydediyor] = useState(false)
  const yaziyorRef = useRef<HTMLDivElement | null>(null)

  const yukle = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pdks-kurulum-rehberi', { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) setData(json.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (acik) { yukle(); setDuzenleModu(false) } }, [acik])

  async function kaydet() {
    if (!taslak) return
    setKaydediyor(true)
    try {
      const res = await fetch('/api/pdks-kurulum-rehberi', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versiyon: taslak.versiyon, tarih: taslak.tarih, icerik: taslak.icerik }),
      })
      const json = await res.json()
      if (json.ok) {
        setDuzenleModu(false)
        setData(taslak)
        onKayit?.()
      } else {
        alert('Kaydedilemedi: ' + (json.error ?? ''))
      }
    } finally { setKaydediyor(false) }
  }

  const html = useMemo(() => data ? markdownToHtml(data.icerik) : '', [data])

  function yazdir() {
    if (!yaziyorRef.current) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>PDKS Kurulum Rehberi</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; max-width: 780px; margin: 24px auto; padding: 0 20px; line-height: 1.6; }
        h1 { font-size: 22px; margin: 12px 0 6px; }
        h2 { font-size: 17px; margin: 24px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
        h3 { font-size: 14px; margin: 16px 0 4px; }
        p { margin: 8px 0; }
        code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 90%; }
        pre { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-family: ui-monospace, monospace; font-size: 12px; }
        pre code { background: transparent; color: inherit; padding: 0; }
        blockquote.rehber-uyari { background: #fef2f2; border-left: 4px solid #dc2626; margin: 14px 0; padding: 10px 16px; border-radius: 6px; color: #7f1d1d; }
        table.rehber-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
        table.rehber-table th, table.rehber-table td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; vertical-align: top; }
        table.rehber-table th { background: #f8fafc; font-weight: 800; }
        ul.rehber-list { margin: 6px 0; padding-left: 22px; }
        li { margin: 3px 0; }
        .baslik-blok { border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 12px; }
        .baslik-blok .versiyon { font-size: 11px; color: #64748b; margin-top: 4px; }
        @media print { body { max-width: none; margin: 0; padding: 12mm; } h1 { font-size: 18px; } h2 { font-size: 14px; } h3 { font-size: 12px; } p, li, td, th { font-size: 11px; } pre, code { font-size: 10px; } }
      </style></head><body>
      <div class="baslik-blok">
        <h1>İO-GYS PDKS Tablet Terminali — Kurulum Talimatı</h1>
        <div class="versiyon">Uygulama sürümü: ${data?.versiyon ?? ''} · Paket: com.qrsync.pdks · APK: iogys_pdks_v${data?.versiyon ?? ''}.apk · Belge tarihi: ${data?.tarih ?? ''}</div>
      </div>
      ${yaziyorRef.current.innerHTML}
      </body></html>
    `)
    w.document.close()
    setTimeout(() => { w.print() }, 300)
  }

  function pdfIndir() {
    // Yazdır penceresini aç, kullanıcı "PDF olarak kaydet" seçebilir.
    // Tarayıcı-native, ek kütüphane gerekmez.
    yazdir()
  }

  if (!acik) return null

  return (
    <div onClick={onKapat}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: 860, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>PDKS Tablet Kurulum Rehberi</div>
            <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>
              Sürüm {data?.versiyon ?? '—'} · {data?.tarih ?? '—'}
              {data?.guncelleme_tarihi && <> · son güncelleme {new Date(data.guncelleme_tarihi).toLocaleDateString('tr-TR')}</>}
            </div>
          </div>
          {!duzenleModu ? (
            <>
              <button onClick={yazdir} disabled={!data || loading}
                style={btnSecondary} title="Yazdır">
                <Printer size={14} /> Yazdır
              </button>
              <button onClick={pdfIndir} disabled={!data || loading}
                style={btnSecondary} title="PDF olarak kaydet (yazdır → PDF)">
                <FileDown size={14} /> PDF
              </button>
              {isSA && (
                <button onClick={() => { setTaslak(data); setDuzenleModu(true) }} disabled={!data || loading}
                  style={{ ...btnSecondary, color: T.blue }}>
                  <Edit2 size={14} /> Düzenle
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setDuzenleModu(false)} disabled={kaydediyor} style={btnSecondary}>
                Vazgeç
              </button>
              <button onClick={kaydet} disabled={kaydediyor}
                style={{ ...btnSecondary, background: T.green, color: '#fff', borderColor: T.green }}>
                <Save size={14} /> {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </>
          )}
          <button onClick={onKapat}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, borderRadius: 6, color: T.textSoft }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: '18px 24px', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40, color: T.textSoft }}>
              <RefreshCw size={16} style={{ animation: 'spin 0.9s linear infinite' }} /> Yükleniyor…
            </div>
          ) : duzenleModu && taslak ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>Sürüm</span>
                  <input value={taslak.versiyon} onChange={e => setTaslak({ ...taslak, versiyon: e.target.value })}
                    style={{ height: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13 }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>Tarih</span>
                  <input value={taslak.tarih} onChange={e => setTaslak({ ...taslak, tarih: e.target.value })}
                    style={{ height: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13 }} />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>İçerik (Markdown)</span>
                <textarea value={taslak.icerik} onChange={e => setTaslak({ ...taslak, icerik: e.target.value })}
                  rows={30}
                  style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12.5, fontFamily: 'ui-monospace, Menlo, monospace', lineHeight: 1.5 }} />
              </label>
              <div style={{ fontSize: 11.5, color: T.textSoft, background: T.grayLight, padding: '10px 12px', borderRadius: 6, lineHeight: 1.5 }}>
                Markdown: <code># Başlık</code> · <code>## Alt başlık</code> · <code>**kalın**</code> · <code>`kod`</code> · <code>{'> uyarı kutusu'}</code> (⚠️ kırmızı vurgu) · <code>- liste</code> · Tablo için <code>|kolon|kolon|</code>
              </div>
            </div>
          ) : (
            <div ref={yaziyorRef} className="rehber-icerik" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .rehber-icerik { color: ${T.text}; line-height: 1.7; font-size: 13.5px; }
        .rehber-icerik p { margin: 10px 0; }
        .rehber-icerik .rehber-h1 { font-size: 20px; font-weight: 800; margin: 8px 0 10px; }
        .rehber-icerik .rehber-h2 { font-size: 16px; font-weight: 800; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 1px solid ${T.border}; color: ${T.text}; }
        .rehber-icerik .rehber-h3 { font-size: 14px; font-weight: 800; margin: 16px 0 6px; color: ${T.text}; }
        .rehber-icerik code { background: ${T.grayLight}; padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 90%; color: ${T.red}; }
        .rehber-icerik pre.rehber-pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 8px; overflow-x: auto; margin: 10px 0; }
        .rehber-icerik pre.rehber-pre code { background: transparent; color: inherit; padding: 0; font-size: 12.5px; }
        .rehber-icerik blockquote.rehber-uyari { background: ${T.redLight}; border-left: 4px solid ${T.red}; margin: 14px 0; padding: 12px 16px; border-radius: 6px; color: #7f1d1d; }
        .rehber-icerik blockquote.rehber-uyari p { margin: 4px 0; font-weight: 600; }
        .rehber-icerik table.rehber-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12.5px; }
        .rehber-icerik table.rehber-table th, .rehber-icerik table.rehber-table td { border: 1px solid ${T.border}; padding: 8px 10px; text-align: left; vertical-align: top; }
        .rehber-icerik table.rehber-table th { background: ${T.grayLight}; font-weight: 800; font-size: 11.5px; text-transform: uppercase; letterSpacing: 0.03em; color: ${T.gray}; }
        .rehber-icerik ul.rehber-list { margin: 6px 0; padding-left: 22px; }
        .rehber-icerik ul.rehber-list li { margin: 4px 0; }
      `}</style>
    </div>
  )
}

const btnSecondary: React.CSSProperties = {
  height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff',
  color: T.text, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
}
