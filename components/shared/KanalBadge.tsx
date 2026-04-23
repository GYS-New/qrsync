/**
 * KanalBadge — görev tamamlama kanalı rozeti.
 *
 * Kanallar (DB değeri):
 *   WEB | QR | NFC      — web veya tarayıcıdan scan
 *   MOBİL | MOBIL       — mobil tamamlama (historik iki yazım da desteklenir)
 *   OFFLINE             — mobil çevrimdışı yapılıp sonradan senkron edilmiş
 *
 * `checklist_sonuc_basliklari.kanal` ve `gorevler/canli_gorevler.son_tamamlama_kanali`
 * kolonlarında kullanılır.
 */

type KanalStyle = { bg: string; color: string }

export const KANAL_RENK: Record<string, KanalStyle> = {
  WEB:     { bg: '#e0f2fe', color: '#0369a1' },
  QR:      { bg: '#ede9fe', color: '#5b21b6' },
  NFC:     { bg: '#fce7f3', color: '#9d174d' },
  MOBİL:   { bg: '#f9fafb', color: '#166534' },
  MOBIL:   { bg: '#f9fafb', color: '#166534' },
  OFFLINE: { bg: '#fef3c7', color: '#92400e' },
}

export const KANAL_LABEL: Record<string, string> = {
  OFFLINE: 'Çevrimdışı',
}

export function kanalLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return KANAL_LABEL[value] ?? value
}

export function KanalBadge({ value, size = 'md' }: { value: string | null | undefined; size?: 'sm' | 'md' }) {
  if (!value) return <span style={{ color: '#cbd5e1' }}>—</span>
  const style = KANAL_RENK[value] ?? { bg: '#f1f5f9', color: '#475569' }
  const pad = size === 'sm' ? '1px 6px' : '2px 8px'
  const fs = size === 'sm' ? 10.5 : 11.5
  return (
    <span style={{
      display: 'inline-block',
      padding: pad,
      borderRadius: 12,
      fontSize: fs,
      fontWeight: 700,
      background: style.bg,
      color: style.color,
      whiteSpace: 'nowrap',
    }}>
      {kanalLabel(value)}
    </span>
  )
}
