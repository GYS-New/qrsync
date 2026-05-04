import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { resolveScanContext } from '@/lib/scan/core'
import { completeTask } from '@/lib/tasks/completeTask'
import { ardisikBaslatmaKontrol } from '@/lib/tasks/ardisikKontrol'
import { devamEdenGorevKontrol } from '@/lib/tasks/devamEdenGorevKontrol'
import { mesaiVePasifKontrol } from '@/lib/mesai/kontrolEt'
import { lokasyonEkstraFrekansDropdown } from '@/lib/scan/bugunTamamlananlar'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

async function getAuthUser(req: Request): Promise<{ id: string; firma_id?: string | null; proje_id?: string | null } | null> {
  const deviceToken = req.headers.get('X-Device-Token')
  if (deviceToken) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('device_tokens')
      .select('user_id, aktif, firma_id, proje_id')
      .eq('device_token', deviceToken)
      .single()
    if (data?.aktif) return { id: data.user_id, firma_id: data.firma_id ?? null, proje_id: data.proje_id ?? null }
    return null
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? { id: user.id } : null
}

/** Firma ve proje kontrolü — farklı firmaya/projeye ait QR okutulmasını engelle */
function checkFirmaProje(context: any, user: { firma_id?: string | null; proje_id?: string | null }) {
  // Firma kontrolü
  if (user.firma_id && context.firma?.id && context.firma.id !== user.firma_id) {
    const firmaAdi = context.firma?.ad ?? 'başka firma'
    return { ok: false, code: 'FARKLI_FIRMA', error: `Bu QR/NFC '${firmaAdi}' firmasına ait. Siz farklı bir firmada kayıtlısınız.` }
  }
  // Proje kontrolü
  if (user.proje_id && context.lokasyon) {
    const lokProjeId = (context.lokasyon as any)?.proje_id
    if (lokProjeId && lokProjeId !== user.proje_id) {
      return { ok: false, code: 'FARKLI_PROJE', error: 'Bu QR/NFC çalıştığınız projeye ait değil.' }
    }
  }
  return null
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })
  // Mesai + pasif kontrolü
  const mesaiHata = await mesaiVePasifKontrol(createAdminClient(), user.id)
  if (mesaiHata) return NextResponse.json(mesaiHata, { status: mesaiHata.status, headers: CORS_HEADERS })
  try {
    const supabase = createAdminClient()
    const context = await resolveScanContext({ supabase, token: params.token, kanal: 'QR', userId: user.id })
    // Firma/Proje kontrolü
    const fpHata = checkFirmaProje(context, user)
    if (fpHata) return NextResponse.json(fpHata, { status: 403, headers: CORS_HEADERS })

    // Ekstra frekansiyel modal dropdown'u:
    //   bugun_tamamlananlar → bugün (TR) o lokasyonda tamamlanmış kural-tabanlı tanımlar
    //   lokasyon_kurallari  → lokasyonun aktif frekans kuralları (bugün hiç iş yapılmamış olsa da dropdown dolu)
    const { bugun_tamamlananlar, lokasyon_kurallari } = context.lokasyon?.id
      ? await lokasyonEkstraFrekansDropdown(supabase, context.lokasyon.id)
      : { bugun_tamamlananlar: [], lokasyon_kurallari: [] }

    return NextResponse.json({ ok: true, ...context, bugun_tamamlananlar, lokasyon_kurallari }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'İşlem başarısız' }, { status: 400, headers: CORS_HEADERS })
  }
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })
  // Mesai + pasif kontrolü
  const mesaiHata2 = await mesaiVePasifKontrol(createAdminClient(), user.id)
  if (mesaiHata2) return NextResponse.json(mesaiHata2, { status: mesaiHata2.status, headers: CORS_HEADERS })
  try {
    const body = await req.json().catch(() => ({}))
    const action         = body?.action as string | undefined
    const selectedTaskId   = body?.taskId   as string | undefined
    const selectedTaskType = body?.taskType as 'gorevler' | 'canli_gorevler' | undefined
    const checklistResults = Array.isArray(body?.checklistResults) ? body.checklistResults : []
    const supabase = createAdminClient()
    const context = await resolveScanContext({ supabase, token: params.token, kanal: 'QR', userId: user.id })

    // Firma/Proje kontrolü
    const fpHata2 = checkFirmaProje(context, user)
    if (fpHata2) return NextResponse.json(fpHata2, { status: 403, headers: CORS_HEADERS })

    // ── action: 'basla' → görevi sadece başlat, tamamlama ───────────────────
    if (action === 'basla' && selectedTaskId) {
      const tablo = selectedTaskType === 'canli_gorevler' ? 'canli_gorevler' : 'gorevler'
      const nowIso = new Date().toISOString()
      // Zaten başlatılmış mı kontrol et
      const { data: gorev } = await supabase.from(tablo).select('id,baslatilma_tarihi,durum,firma_id,proje_id').eq('id', selectedTaskId).maybeSingle()
      if (gorev?.baslatilma_tarihi) {
        return NextResponse.json({ ok: true, baslatilma_tarihi: gorev.baslatilma_tarihi, mesaj: 'Zaten başlatılmış' }, { headers: CORS_HEADERS })
      }
      // Devam eden başka bir görev var mı? (Aynı kullanıcının başka ISLEMDE görevi)
      if (gorev) {
        const devam = await devamEdenGorevKontrol(supabase, user.id, gorev.firma_id, { excludeTaskId: selectedTaskId })
        if (devam) {
          return NextResponse.json({
            ok: false,
            code: 'DEVAM_EDEN_GOREV',
            error: 'Önce devam eden görevinizi tamamlayın.',
            aktifGorev: devam,
          }, { status: 409, headers: CORS_HEADERS })
        }
      }
      // Ardışık başlatma kontrolü
      if (gorev) {
        const ardisikHata = await ardisikBaslatmaKontrol(supabase, user.id, gorev.firma_id, (gorev as any).proje_id)
        if (ardisikHata) {
          return NextResponse.json({ ok: false, error: ardisikHata, code: 'ARDISIK_BEKLEME' }, { status: 429, headers: CORS_HEADERS })
        }
      }
      const updatePayload: any = { baslatilma_tarihi: nowIso, baslatan_kullanici_id: user.id, islemi_yapan_id: user.id, durum_degisim_tarihi: nowIso, durum: 'ISLEMDE' }
      await supabase.from(tablo).update(updatePayload).eq('id', selectedTaskId)
      return NextResponse.json({ ok: true, baslatilma_tarihi: nowIso, mesaj: 'Görev başlatıldı' }, { headers: CORS_HEADERS })
    }

    // taskType gelmemişse id'ye göre her iki tipte ara
    let task = context.tasks.find((t) => t.id === selectedTaskId && t.taskType === selectedTaskType)
    if (!task && selectedTaskId && !selectedTaskType) {
      task = context.tasks.find((t) => t.id === selectedTaskId)
    }

    if (!task) {
      // Görev context'te yok — tamamlanmış ya da durumu değişmiş olabilir
      if (selectedTaskId) {
        const tablolar = selectedTaskType
          ? [selectedTaskType, selectedTaskType === 'gorevler' ? 'canli_gorevler' : 'gorevler']
          : ['canli_gorevler', 'gorevler']
        for (const tablo of tablolar) {
          const { data: dbGorev } = await supabase
            .from(tablo)
            .select('id,tanim,durum,atanan_kullanici_id,baslatilma_tarihi')
            .eq('id', selectedTaskId)
            .maybeSingle()
          if (!dbGorev) continue
          if (['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'KAPATILDI'].includes(dbGorev.durum)) {
            return NextResponse.json({ ok: true, message: 'Görev zaten tamamlanmış', durum: dbGorev.durum }, { headers: CORS_HEADERS })
          }
          if (['ACIK', 'BEKLEMEDE', 'ISLEMDE'].includes(dbGorev.durum)) {
            // Tamamlanabilir durumda — devam et
            task = { id: dbGorev.id, taskType: tablo as any, tanim: dbGorev.tanim ?? '', durum: dbGorev.durum, atanan_kullanici_id: dbGorev.atanan_kullanici_id, baslatilma_tarihi: dbGorev.baslatilma_tarihi }
            break
          }
        }
      }
      if (!task) {
        return NextResponse.json({ ok: false, error: 'Görev bulunamadı veya erişim yok' }, { status: 404, headers: CORS_HEADERS })
      }
    }
    if (context.checklistTemplate?.maddeler?.length) {
      const missingRequired = context.checklistTemplate.maddeler.filter(
        (madde) => madde.zorunlu_cevap && !checklistResults.some((r: any) => r?.itemId === madde.id && r?.secenek)
      )
      if (missingRequired.length) {
        return NextResponse.json({ ok: false, error: 'Zorunlu checklist maddeleri tamamlanmalı' }, { status: 400, headers: CORS_HEADERS })
      }
      const { data: sablonRow } = await supabase
        .from('checklist_sablonlari').select('versiyon').eq('id', context.checklistTemplate.id).maybeSingle()
      const templateVersion = (sablonRow as any)?.versiyon ?? 1
      const gorevIdKolonu = task.taskType === 'gorevler' ? 'gorev_id' : 'canli_gorev_id'
      const baslikPayload: any = {
        lokasyon_id: context.lokasyon.id,
        sablon_id: context.checklistTemplate.id,
        template_version: templateVersion,
        kanal: 'QR',
        kullanici_id: user.id,
      }
      baslikPayload[gorevIdKolonu] = task.id
      const { data: sonucBaslik, error: baslikError } = await supabase
        .from('checklist_sonuc_basliklari').insert(baslikPayload).select('id').single()
      if (baslikError) throw new Error(baslikError.message)
      const maddePayload = checklistResults
        .filter((r: any) => r?.itemId && r?.secenek)
        .map((r: any) => ({
          sonuc_id:       sonucBaslik.id,
          madde_id:       r.itemId,
          secenek_degeri: r.secenek,
          aciklama:       typeof r.aciklama === 'string' && r.aciklama.trim() ? r.aciklama.trim() : null,
          gorsel_url:     typeof r.gorsel_url === 'string' && r.gorsel_url ? r.gorsel_url : null,
        }))
      if (maddePayload.length) {
        const { error: maddeError } = await supabase.from('checklist_sonuc_maddeleri').insert(maddePayload)
        if (maddeError) throw new Error(maddeError.message)
      }
    }
    // ── QR/NFC tamamlama zorunluluğu: 2. QR okutma gerekli ──
    if (context.lokasyon.sureli_gorev_aktif && context.lokasyon.tamamlama_qr_zorunlu) {
      const confirmToken = body?.confirm_scan_token as string | undefined
      if (!confirmToken) {
        return NextResponse.json(
          { ok: false, error: 'Bu lokasyonda tamamlama için QR veya NFC okutmanız gerekiyor.', code: 'QR_NFC_ZORUNLU' },
          { status: 403, headers: CORS_HEADERS }
        )
      }
      const qrOk = context.lokasyon.qr_veri && confirmToken === context.lokasyon.qr_veri
      const nfcOk = context.lokasyon.nfc_token && confirmToken === context.lokasyon.nfc_token
      if (!qrOk && !nfcOk) {
        return NextResponse.json(
          { ok: false, error: 'Okutulan QR/NFC kodu bu lokasyonla eşleşmiyor.', code: 'QR_NFC_ESLESMEDI' },
          { status: 403, headers: CORS_HEADERS }
        )
      }
    }

    // Ardışık başlatma kontrolü — görev henüz başlatılmamışsa (ACIK durumda tamamlanıyor)
    if (!task.baslatilma_tarihi) {
      const tablo = task.taskType === 'gorevler' ? 'gorevler' : 'canli_gorevler'
      const { data: gorevRow } = await supabase.from(tablo).select('firma_id,proje_id').eq('id', task.id).maybeSingle()
      if (gorevRow) {
        const ardisikHata = await ardisikBaslatmaKontrol(supabase, user.id, (gorevRow as any).firma_id, (gorevRow as any).proje_id)
        if (ardisikHata) {
          return NextResponse.json({ ok: false, error: ardisikHata, code: 'ARDISIK_BEKLEME' }, { status: 429, headers: CORS_HEADERS })
        }
      }
    }

    // Süreli görev: baslatilma_tarihi yoksa otomatik başlat
    if (context.lokasyon.sureli_gorev_aktif && !task.baslatilma_tarihi) {
      const nowIso = new Date().toISOString()
      const tablo = task.taskType === 'gorevler' ? 'gorevler' : 'canli_gorevler'
      const updatePayload: any = { baslatilma_tarihi: nowIso, baslatan_kullanici_id: user.id, islemi_yapan_id: user.id, durum_degisim_tarihi: nowIso, durum: 'ISLEMDE' }
      await supabase.from(tablo).update(updatePayload).eq('id', task.id)
      // Local task objesini güncelle — completeTask süre hesaplasın
      ;(task as any).baslatilma_tarihi = nowIso
    }
    await completeTask({ supabase, taskId: task.id, taskType: task.taskType, userId: user.id, channel: 'QR' })
    return NextResponse.json({ ok: true, message: 'Görev QR ile tamamlandı' }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'İşlem başarısız' }, { status: 400, headers: CORS_HEADERS })
  }
}
