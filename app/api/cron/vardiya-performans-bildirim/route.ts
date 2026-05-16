/**
 * POST /api/cron/vardiya-performans-bildirim
 *
 * 5dk'da 1 çalışır. Her firma+proje için tum_vardiya_ayarlari'ndaki vardiyaları
 * tarar; vardiya bitiminden 10dk geçtiyse ve henüz bildirim atılmamışsa, o
 * vardiya için her üst lokasyon yöneticisine performans push'u gönderir.
 *
 * Üst lokasyon yöneticisi = kullanici_lokasyon_yetkileri'nde kayıtlı U/M.
 *
 * Performans (hedef tabanlı):
 *   hedef          = kural-tabanlı (kural_id NOT NULL) toplam görev sayısı
 *                    (TAMAMLANDI + tamamlanmamış + IPTAL — aktif_olma_tarihi vardiya aralığında)
 *   tamamlandi     = kural-tabanlı TAMAMLANDI
 *   zy             = kural-tabanlı, TAMAMLANDI dışı (ACIK/ISLEMDE/BEKLEMEDE/ZAMANI_GECMIS/ZAMANINDA_YAPILAMAYAN)
 *   iptal          = kural-tabanlı IPTAL
 *   ekstra         = kural_id NULL TAMAMLANDI (vardiya aralığında tamamlanma)
 *
 * Başlık eşikleri (tamamlandi/hedef):
 *   < %65  → DÜŞÜK PERFORMANS
 *   %65-80 → BEKLENEN PERFORMANS
 *   ≥ %80  → MÜKEMMEL PERFORMANS
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type VardiyaItem = { no: number; baslangic: string; bitis: string }

/** TR günü YYYY-MM-DD (Europe/Istanbul) */
function trDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}

/** TR günü + dakika ofseti → UTC ISO. dakika 24*60 = ertesi gün 00:00. */
function trToUtcIso(trGun: string, dakika: number): string {
  const dayDelta = Math.floor(dakika / (24 * 60))
  const kalan = ((dakika % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(kalan / 60)
  const m = kalan % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const baseDate = new Date(`${trGun}T12:00:00+03:00`)
  baseDate.setUTCDate(baseDate.getUTCDate() + dayDelta)
  const hedefGun = trDateStr(baseDate)
  return new Date(`${hedefGun}T${pad(h)}:${pad(m)}:00+03:00`).toISOString()
}

function parseHHMM(s: string): number | null {
  if (!s) return null
  const [hh, mm] = s.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

function pctRound(num: number, den: number): number {
  if (den <= 0) return 0
  return Math.round((num / den) * 100)
}

/** Üst lokasyonun altındaki tüm lokasyon ID'leri (BFS) */
function bfsAltLokIds(loks: { id: string; parent_id: string | null }[], ustId: string): string[] {
  const seti = new Set<string>([ustId])
  const queue = [ustId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const l of loks) {
      if (l.parent_id === cur && !seti.has(l.id)) {
        seti.add(l.id)
        queue.push(l.id)
      }
    }
  }
  return [...seti]
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-cron-token')
  const envToken = process.env.CRON_SECRET
  if (!envToken || !token || token !== envToken) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz cron' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const nowMs = now.getTime()
  const trGun = trDateStr(now)
  const dunGun = trDateStr(new Date(nowMs - 24 * 3600 * 1000))

  const sonuc: any[] = []
  let toplamGonderim = 0

  // 1) Tüm aktif firmaları çek
  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id, firma_adi, ticari_unvan, vardiya_sayisi, tum_vardiya_ayarlari')
    .eq('aktif', true)

  for (const f of firmalar ?? []) {
    const vs = f.vardiya_sayisi as number | null
    if (!vs) continue
    const ayarlar: VardiyaItem[] | undefined = (f.tum_vardiya_ayarlari ?? {})?.[String(vs)]
    if (!Array.isArray(ayarlar) || ayarlar.length === 0) continue

    // 2) Firmanın aktif projelerini çek (projesi olmayanlar için null ile tek tur)
    const { data: projeler } = await admin
      .from('projeler')
      .select('id')
      .eq('firma_id', f.id)
      .eq('aktif', true)
    const projeIdler: (string | null)[] = (projeler ?? []).map((p: any) => p.id as string)
    if (projeIdler.length === 0) projeIdler.push(null)

    for (const projeId of projeIdler) {
      // 3) Her vardiya için: bitiş+10dk geçti mi + bugün için log yok mu?
      for (const v of ayarlar) {
        const basMin = parseHHMM(v.baslangic)
        const bitMin0 = parseHHMM(v.bitis)
        if (basMin == null || bitMin0 == null) continue
        let bitMin = bitMin0
        // 00:00 bitis = ertesi gün 00:00
        if (bitMin === 0 && basMin !== 0) bitMin = 24 * 60
        // Sarkan vardiya (örn 20:00-04:00)
        if (bitMin <= basMin && bitMin !== 24 * 60) bitMin += 24 * 60

        // Vardiya başlangıç bu TR günü mü dün mü?
        // Bugünün ve dünün vardiya bitişini kontrol et — gece geçişlerinde sarkan vardiya
        for (const refTrGun of [trGun, dunGun]) {
          const bitisIso = trToUtcIso(refTrGun, bitMin)
          const baslangicIso = trToUtcIso(refTrGun, basMin)
          const bitisMs = new Date(bitisIso).getTime()
          const gecenDk = (nowMs - bitisMs) / 60000

          // Bitiş+10dk geçti mi (10-3000dk pencere — geç tetiklemelerde de tutar; ama duplicate log korur)
          if (gecenDk < 10 || gecenDk > 24 * 60) continue

          // Vardiya tarihi: bitişin gerçekleştiği TR günü
          const vardiyaTarihi = trDateStr(new Date(bitisMs))

          // 4) O firma+proje için bu vardiya+tarih log var mı? (1 alıcı kontrolü yeterli)
          const { data: existingLog } = await admin
            .from('vardiya_bildirim_log')
            .select('id', { count: 'exact', head: false })
            .eq('firma_id', f.id)
            .eq('vardiya_no', v.no)
            .eq('tarih', vardiyaTarihi)
            .limit(1)
          if ((existingLog ?? []).length > 0) continue

          // 5) Lokasyon ağacını çek (firma + proje)
          let lokQ = admin
            .from('lokasyonlar')
            .select('id, tanim, parent_id, firma_id, proje_id, aktif')
            .eq('firma_id', f.id)
            .eq('aktif', true)
          if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
          const { data: loks } = await lokQ
          const ustLoklar = (loks ?? []).filter((l: any) => l.parent_id == null)
          if (ustLoklar.length === 0) continue

          // 6) Üst lokasyon → yöneticiler haritası (sadece U rolü; M rolü muaf)
          const { data: yetkiler } = await admin
            .from('kullanici_lokasyon_yetkileri')
            .select('user_id, ust_lokasyon_id, users!inner(rol)')
            .eq('firma_id', f.id)
            .eq('users.rol', 'tenant_user')
          const ustToUsers = new Map<string, string[]>()
          for (const y of yetkiler ?? []) {
            const arr = ustToUsers.get((y as any).ust_lokasyon_id) ?? []
            arr.push((y as any).user_id)
            ustToUsers.set((y as any).ust_lokasyon_id, arr)
          }

          // 7) Her üst lokasyon için performans hesapla + push gönder
          for (const ust of ustLoklar) {
            const yoneticiler = ustToUsers.get(ust.id) ?? []
            if (yoneticiler.length === 0) continue

            const altIds = bfsAltLokIds(loks as any, ust.id)

            const { data: planli } = await admin
              .from('canli_gorevler')
              .select('id, durum, kural_id')
              .eq('firma_id', f.id)
              .in('lokasyon_id', altIds)
              .not('kural_id', 'is', null)
              .gte('aktif_olma_tarihi', baslangicIso)
              .lt('aktif_olma_tarihi', bitisIso)

            const { data: ekstraRows } = await admin
              .from('canli_gorevler')
              .select('id')
              .eq('firma_id', f.id)
              .in('lokasyon_id', altIds)
              .is('kural_id', null)
              .eq('durum', 'TAMAMLANDI')
              .gte('tamamlanma_tarihi', baslangicIso)
              .lt('tamamlanma_tarihi', bitisIso)

            const planliArr = planli ?? []
            const hedef = planliArr.length
            const tamamlandi = planliArr.filter((g: any) => g.durum === 'TAMAMLANDI').length
            const iptal = planliArr.filter((g: any) => g.durum === 'IPTAL').length
            const zy = hedef - tamamlandi - iptal
            const ekstra = (ekstraRows ?? []).length

            // Hedef 0 ise bildirim gönderme — anlamsız (o vardiya o üst lokasyonda iş yok)
            if (hedef === 0) continue

            const basariPct = pctRound(tamamlandi, hedef)
            const baslik =
              basariPct < 65 ? 'DÜŞÜK PERFORMANS' :
              basariPct < 80 ? 'BEKLENEN PERFORMANS' :
                               'MÜKEMMEL PERFORMANS'

            const body = `Bugün yöneticisi olduğunuz ${ust.tanim} departmanında ${v.no}. vardiya performans verileri: %${basariPct} tamamlandı, %${pctRound(zy, hedef)} zamanında yapılamayan (beklemeye geçmiş), %${pctRound(iptal, hedef)} iptal ve %${pctRound(ekstra, hedef)} ekstra yapılan şeklindedir. Not: Bu veriler her vardiya sonunda tüm yöneticiler ile paylaşılmaktadır.`

            const perfData = { hedef, tamamlandi, zy, iptal, ekstra, basariPct }

            // Push + log (idempotent: unique constraint hata verirse atla)
            for (const userId of yoneticiler) {
              const { error: logErr } = await admin
                .from('vardiya_bildirim_log')
                .insert({
                  firma_id: f.id,
                  proje_id: projeId,
                  ust_lokasyon_id: ust.id,
                  alici_user_id: userId,
                  vardiya_no: v.no,
                  tarih: vardiyaTarihi,
                  performans_data: perfData,
                })
              if (logErr) continue // duplicate veya başka hata — bu user için atla

              try { await sendFCMToUser(userId, baslik, body, 'default') } catch {}
              toplamGonderim++
            }

            sonuc.push({
              firma_id: f.id, proje_id: projeId, ust_lokasyon: ust.tanim,
              vardiya_no: v.no, tarih: vardiyaTarihi, alici_sayisi: yoneticiler.length,
              ...perfData,
            })
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, gonderim: toplamGonderim, detay: sonuc })
}
