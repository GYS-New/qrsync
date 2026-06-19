import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/device/getRequestMeta'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  try {
    const deviceToken = req.headers.get('X-Device-Token')

    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'Token gerekli', kod: 'ESLESMEDI' }, { status: 401, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    const { data: tokenData, error } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim, aktif, son_kullanim')
      .eq('device_token', deviceToken)
      .single()

    if (error || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz token', kod: 'ESLESMEDI' }, { status: 401, headers: CORS_HEADERS })
    }

    if (!tokenData.aktif) {
      return NextResponse.json({ ok: false, error: 'Cihaz devre dışı', kod: 'ESLESMEDI' }, { status: 403, headers: CORS_HEADERS })
    }

    const { ip: reqIp, ua: reqUa } = getRequestMeta(req)
    await admin
      .from('device_tokens')
      .update({ son_kullanim: new Date().toISOString(), son_ip: reqIp, son_user_agent: reqUa })
      .eq('device_token', deviceToken)

    // users tablosundan güncel bilgileri al (ust_lokasyon_id dahil — Oto Yıkama
    // personel tespiti hem bu kolonu hem kullanici_lokasyon_yetkileri tablosunu
    // kapsar; iki atama yolundan biri yeterli)
    const { data: userData } = await admin
      .from('users')
      .select('id, isim_soyisim, rol, firma_id, proje_id, email, ust_lokasyon_id, varsayilan_yikama_istasyon_id')
      .eq('id', tokenData.user_id)
      .single()

    // Oto Yıkama personeli mi? İki kaynak OR'lanır:
    //   A) users.ust_lokasyon_id → oto_yikama_lokasyon=true bir üst lokasyonu işaret ediyor
    //   B) kullanici_lokasyon_yetkileri'nde oto_yikama_lokasyon=true bir kayıt var
    // Saha gerçekliği: bazı kullanıcılar (A) ile, bazıları (B) ile atanıyor — UI/DB
    // sync inconsistency'si nedeniyle ikisi de kontrol edilmeli.
    let otoYikamaPersoneli = false
    {
      const adayUstIds = new Set<string>()
      if (userData?.ust_lokasyon_id) adayUstIds.add(userData.ust_lokasyon_id)
      const { data: yetkiler } = await admin
        .from('kullanici_lokasyon_yetkileri')
        .select('ust_lokasyon_id')
        .eq('user_id', tokenData.user_id)
      for (const y of (yetkiler ?? [])) {
        if (y.ust_lokasyon_id) adayUstIds.add(y.ust_lokasyon_id)
      }
      if (adayUstIds.size > 0) {
        const { data: loks } = await admin
          .from('lokasyonlar')
          .select('id')
          .in('id', [...adayUstIds])
          .eq('oto_yikama_lokasyon', true)
          .eq('aktif', true)
        otoYikamaPersoneli = (loks ?? []).length > 0
      }
    }

    // Varsayılan yıkama istasyonu — mobile "Yıkamayı Başlat" tek-tıkla
    // kullanır. SET NULL FK sayesinde istasyon silinirse otomatik null'lanır.
    // Aktif değilse mobile'a vermeyiz — eski/silinmiş istasyona yıkama
    // başlatma denemesi engellenmeli.
    let varsayilanYikamaIstasyonId: string | null = null
    let varsayilanYikamaIstasyonTanim: string | null = null
    if (userData?.varsayilan_yikama_istasyon_id) {
      const { data: ist } = await admin
        .from('lokasyonlar')
        .select('id, tanim, aktif')
        .eq('id', userData.varsayilan_yikama_istasyon_id)
        .maybeSingle()
      if (ist && (ist as any).aktif !== false) {
        varsayilanYikamaIstasyonId = (ist as any).id
        varsayilanYikamaIstasyonTanim = (ist as any).tanim ?? null
      }
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: tokenData.user_id,
        isim_soyisim: userData?.isim_soyisim ?? tokenData.isim_soyisim,
        firma_id: userData?.firma_id ?? tokenData.firma_id,
        proje_id: userData?.proje_id ?? null,
        rol: userData?.rol ?? 'tenant_user',
        email: userData?.email ?? null,
        oto_yikama_personeli: otoYikamaPersoneli,
        varsayilan_yikama_istasyon_id: varsayilanYikamaIstasyonId,
        varsayilan_yikama_istasyon_tanim: varsayilanYikamaIstasyonTanim,
      },
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
