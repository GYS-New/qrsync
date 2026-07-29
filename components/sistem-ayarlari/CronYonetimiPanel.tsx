'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Play, RefreshCw, Clock } from 'lucide-react'

type CronTipi = 'personel_destek' | 'max_sure' | 'arsivleme' | 'simulasyon' | 'sistem_kontrol' | 'rapor_gonder' | 'gece_dongu' | 'yedekleme'

type CronKarti = {
  tip: CronTipi
  ad: string
  aciklama: string
  periyot: string
  tehlike?: boolean
  projeId?: string  // gece_dongu için proje-bazlı tetikleme
}

// Proje-bazlı gece cron kurulumu (pg_cron zamanları ile senkron):
//   qrsync-gece-dongu-renault:   20:30 UTC = 23:30 TRT
//   qrsync-gece-dongu-canakkale: 20:59 UTC = 23:59 TRT
const PROJE_ID = {
  RENAULT:   'bd9dfb20-16aa-4038-9542-83abb167e6ee',
  CANAKKALE: 'c80e60d3-87fd-4d74-846b-054ab8f9ed37',
}

const CRONLAR: CronKarti[] = [
  { tip: 'gece_dongu',      ad: 'Gece Tam Döngü — Oyak Renault',  aciklama: 'Renault projesi için durum geçişleri + arşivleme + yarınki vardiya günü görev üretimi (V1 23:30 başlangıç öncesi).', periyot: 'Her gece 23:30 TRT', tehlike: true, projeId: PROJE_ID.RENAULT },
  { tip: 'gece_dongu',      ad: 'Gece Tam Döngü — Çanakkale',      aciklama: 'Çanakkale projesi için durum geçişleri + arşivleme + yarınki vardiya günü görev üretimi (V1 00:00 başlangıç öncesi).', periyot: 'Her gece 23:59 TRT', tehlike: true, projeId: PROJE_ID.CANAKKALE },
  { tip: 'yedekleme',       ad: 'Veri Yedekleme',          aciklama: 'Kritik tabloları JSON+gzip olarak Supabase Storage\'a yedekler (26 tablo). 90 günden eski yedekler otomatik silinir.', periyot: 'Her gece 00:30 TRT' },
  { tip: 'personel_destek', ad: 'Personel Görev Desteği', aciklama: 'Vardiya bitiminde BEKLEMEDE görevleri ZAMANINDA_YAPILAMAYAN olarak destek personeline yazar (hedef oran %).', periyot: '00:00, 08:00, 16:00 TRT' },
  { tip: 'max_sure',        ad: 'Max Süre Kontrol',        aciklama: 'ISLEMDE durumdaki görevleri max_sure_dakika dolduğunda otomatik tamamlar; ek olarak 10 dk kala uyarı bildirimi gönderir.', periyot: 'Her 5 dakika' },
  { tip: 'arsivleme',       ad: 'Arşivleme',               aciklama: 'Eski görev/değerlendirme/mesai kayıtlarını arşiv tablolarına taşır (firma/proje arsiv_*_saat ayarlarına göre).', periyot: 'Her 6 saat' },
  { tip: 'simulasyon',      ad: 'Simülasyon Motoru',       aciklama: 'Aktif simülasyon ayarlarına göre görevleri otomatik tamamlar (kural-personel atama).', periyot: 'Her dakika' },
  { tip: 'sistem_kontrol',  ad: 'Sistem Sağlık Kontrolü',  aciklama: 'Tüm cron sistemlerini ve veri bütünlüğünü tarar; sorun varsa TA\'lara kritik uyarı bildirimi gönderir.', periyot: 'Her saat başı' },
  { tip: 'rapor_gonder',    ad: 'Zamanlanmış Rapor Gönderimi', aciklama: 'Zamanlaması gelmiş raporları otomatik mail ile gönderir.', periyot: 'Her 15 dakika' },
]

type SonLog = {
  tarih: string
  sonuc: any
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  gray: '#475569', grayLight: '#f8fafc',
}

export default function CronYonetimiPanel() {
  const supabase = React.useMemo(() => createClient(), [])
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [sonLoglar, setSonLoglar] = useState<Record<string, SonLog>>({})
  const [tetikleniyor, setTetikleniyor] = useState<CronTipi | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  async function yukleLoglar() {
    setYukleniyor(true)
    try {
      // gece_dongu proje-bazlı iki kartta tekrarlanır + cron_log ayrımı yok — bu kart log göstermez
      const tipler = Array.from(new Set(CRONLAR.map(c => c.tip))).filter(t => t !== 'gece_dongu')
      const map: Record<string, SonLog> = {}
      for (const tip of tipler) {
        const { data } = await supabase
          .from('cron_log')
          .select('tarih, sonuc')
          .eq('tip', tip)
          .order('tarih', { ascending: false })
          .limit(1)
        if (data && data[0]) map[tip] = data[0] as any
      }
      setSonLoglar(map)
    } catch {}
    setYukleniyor(false)
  }

  useEffect(() => { yukleLoglar() }, [])

  async function tetikle(tip: CronTipi, ad: string, tehlike?: boolean, projeId?: string) {
    if (tehlike) {
      const ok = await confirm({
        title: '⚠️ Kritik Cron',
        message: `"${ad}" cron'u manuel tetikleniyor. Bu işlem durum geçişleri + arşivleme + görev üretimi yapacak. Devam etmek istiyor musunuz?`,
        confirmText: 'Tetikle',
        cancelText: 'İptal',
        variant: 'danger',
      })
      if (!ok) return
    }
    setTetikleniyor(tip)
    try {
      const res = await fetch('/api/admin/cron-tetikle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tip, proje_id: projeId ?? null }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        toast({ type: 'error', title: 'Tetikleme başarısız', message: json.error ?? 'Bilinmeyen hata' })
      } else {
        const ozet = ozetMetni(tip, json.sonuc)
        toast({ type: 'success', title: '✓ Tetiklendi', message: ozet })
        setTimeout(() => yukleLoglar(), 1500)  // birkaç saniye sonra log'u tazele
      }
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Bağlantı hatası' })
    } finally {
      setTetikleniyor(null)
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: T.blue }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>Cron Yönetimi</h3>
        <button onClick={yukleLoglar} disabled={yukleniyor}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={12} style={yukleniyor ? { animation: 'cy-spin 0.9s linear infinite' } : undefined} />
          Yenile
        </button>
      </div>

      <div style={{ padding: '10px 14px', background: T.amberLight, border: `1px solid ${T.amber}40`, borderRadius: 10, marginBottom: 16, fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
        <strong style={{ color: T.amber }}>⚠️ Dikkat:</strong> Cron'ları manuel tetiklemek <strong>geri alınamaz</strong> işlemler yapabilir (görev tamamlama, arşivleme, durum geçişi). Tüm tetiklemeler audit log'a kaydedilir.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CRONLAR.map(c => {
          const log = sonLoglar[c.tip]
          const sonZaman = log ? formatGecen(log.tarih) : null
          const isLoading = tetikleniyor === c.tip
          const kartKey = `${c.tip}-${c.projeId ?? 'all'}`
          return (
            <div key={kartKey} style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c.ad}</span>
                  {c.tehlike && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: T.redLight, color: T.red }}>KRİTİK</span>
                  )}
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: T.grayLight, color: T.gray }}>{c.periyot}</span>
                </div>
                <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.55, marginBottom: 6 }}>{c.aciklama}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: T.textSoft }}>
                  <Clock size={11} />
                  {sonZaman ? (
                    <span>Son çalışma: <strong style={{ color: T.text }}>{sonZaman}</strong> {log && <span>· {ozetMetni(c.tip, log.sonuc)}</span>}</span>
                  ) : (
                    <span style={{ fontStyle: 'italic' }}>{c.tip === 'gece_dongu' ? 'Pg_cron ile otomatik — manuel tetiklemeler cron_log\'a yazar' : 'Son çalışma kaydı yok'}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => tetikle(c.tip, c.ad, c.tehlike, c.projeId)}
                disabled={isLoading}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: c.tehlike ? T.red : T.text, color: '#fff',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: isLoading ? 0.6 : 1, whiteSpace: 'nowrap',
                }}
              >
                {isLoading ? <RefreshCw size={13} style={{ animation: 'cy-spin 0.9s linear infinite' }} /> : <Play size={13} />}
                {isLoading ? 'Çalışıyor…' : 'Şimdi Çalıştır'}
              </button>
            </div>
          )
        })}
      </div>

      <style>{`@keyframes cy-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function formatGecen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const dk = Math.floor(ms / 60000)
  if (dk < 1) return 'şimdi'
  if (dk < 60) return `${dk} dk önce`
  const sa = Math.floor(dk / 60)
  if (sa < 24) return `${sa} sa önce`
  const gun = Math.floor(sa / 24)
  return `${gun} gün önce`
}

function ozetMetni(tip: string, sonuc: any): string {
  if (!sonuc) return ''
  const s = sonuc.sonuc ?? sonuc  // wrapped vs raw
  if (typeof s !== 'object') return ''
  switch (tip) {
    case 'personel_destek':
      return `${s.toplam_tamamlanan ?? s.tamamlanan ?? 0} görev tamamlandı`
    case 'max_sure':
      return `${(s.gorevler_otomatik_tamamla ?? s.gorevler_iptal ?? 0) + (s.canli_gorevler_otomatik_tamamla ?? s.canli_gorevler_iptal ?? 0)} oto-tamamla, ${s.uyari_gonderildi ?? 0} uyarı`
    case 'arsivleme':
      const t = Object.values(s.results ?? {}).reduce((acc: number, r: any) => acc + (r?.frekansiyel ?? 0) + (r?.spesifik ?? 0) + (r?.personel ?? 0) + (r?.musteri ?? 0), 0)
      return `${t} kayıt arşivlendi`
    case 'simulasyon':
      const sim = (s.sonuclar ?? []).reduce((acc: number, r: any) => acc + (r.tamamlanan ?? 0), 0)
      return `${sim} sim. tamamlama`
    case 'sistem_kontrol':
      return `${s.toplam_sorun ?? 0} sorun / ${s.toplam_sistem ?? 0} sistem`
    case 'rapor_gonder':
      return `${s.processed ?? 0} rapor`
    case 'yedekleme':
      const kb = Math.round((s.boyut_gzip_byte ?? 0) / 1024)
      return `${s.basarili_tablo ?? 0}/${s.toplam_tablo ?? 0} tablo, ${s.toplam_satir ?? 0} satır, ${kb} KB`
    case 'gece_dongu':
      return `üretildi: ${s.uretim?.uretilen ?? 0}, durum geçişi: ${(s.durum_gecis?.aktive ?? 0) + (s.durum_gecis?.beklemeye ?? 0) + (s.durum_gecis?.zamani_gecmis ?? 0)}`
    default:
      return ''
  }
}
