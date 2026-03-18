import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// Rapor türleri tanımı (Rapor Merkezi'ndeki 5 ana rapor türü)
const RAPOR_TURLERI = [
  { id: 'ham_veri', ad: 'Ham Veri Raporları', aciklama: 'Kolon seçimi, tarih aralığı ve Excel/PDF çıktılarıyla detaylı operasyon verisi' },
  { id: 'grafiksel', ad: 'Grafiksel Raporlar', aciklama: 'Sütun, çizgi ve pasta grafiklerle hızlı görsel analiz ve canlı analiz' },
  { id: 'rapor_ozellestir', ad: 'Rapor Özelleştir', aciklama: 'Hazır şablon seçin ya da kendi Excel şablonunuzu yükleyin, parametrelerle rapor üretin' },
  { id: 'lokasyon_qr', ad: 'Lokasyon QR Kodları', aciklama: 'Tüm lokasyonların QR kodlarını tek PDF dosyasında oluşturun ve yazdırın' },
  { id: 'sure_analiz', ad: 'Süre Analiz Raporları', aciklama: 'Tamamlanma süresi, lokasyon bazlı bekleme zamanları ve trend karşılaştırmaları' }
]

// GET - Firma rapor türlerini listele
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const admin = createAdminClient()
  const { searchParams } = new URL(request.url)

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('id, rol, firma_id')
      .eq('id', user.id)
      .single()

    if (meError || !me) {
      return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
    }

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const paramFirmaId = searchParams.get('firma_id')

    // TA için: param gelmezse kendi firma_id'sini kullan
    const firmaId = isSA ? paramFirmaId : (me.firma_id ?? null)

    // TA başka firmanın verisine erişmeye çalışıyorsa reddet
    if (!isSA && paramFirmaId && paramFirmaId !== me.firma_id) {
      return NextResponse.json({ ok: false, error: 'access_denied' }, { status: 403 })
    }

    if (!firmaId) {
      return NextResponse.json({ ok: true, data: [] })
    }

    let query = supabase
      .from('firma_rapor_turleri')
      .select('*')
      .eq('firma_id', firmaId)

    let { data, error } = await query.order('rapor_turu')

    if (error) {
      console.error('Firma rapor türleri API hatası:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    // Firma için kayıt yoksa otomatik oluştur (hem SA hem TA)
    const hedefFirmaId = firmaId || (!isSA ? me.firma_id : null)
    if (hedefFirmaId && data && data.length === 0) {
      const varsayilanTurler = RAPOR_TURLERI.map(turu => ({
        firma_id: hedefFirmaId,
        rapor_turu: turu.id,
        aktif: true,
        olusturan_id: user.id,
        guncelleyen_id: user.id
      }))
      const { data: yeniKayitlar, error: insertErr } = await admin
        .from('firma_rapor_turleri')
        .insert(varsayilanTurler)
        .select()
      if (insertErr) {
        console.error('Rapor türü otomatik oluşturma hatası:', insertErr)
      }
      if (yeniKayitlar) {
        data = yeniKayitlar
      }
    }

    // SA için tüm rapor türlerini, TA için sadece aktif olanları döndür
    const raporTurleri = RAPOR_TURLERI.map(turu => {
      const firmaTuru = data?.find(fr => fr.rapor_turu === turu.id)
      return {
        ...turu,
        firma_ayar_id: firmaTuru?.id,
        aktif: isSA ? firmaTuru?.aktif : firmaTuru?.aktif, // SA için ayarlanabilir, TA için sadece aktif olanlar
        kayit_tarihi: firmaTuru?.kayit_tarihi
      }
    })

    // TA için: aktif=true olanlar + hiç kaydı yoksa tümü (undefined aktif = henüz oluşturulmadı)
    const taFiltered = raporTurleri.filter(rt => rt.aktif !== false)
    return NextResponse.json({ 
      ok: true, 
      data: isSA ? raporTurleri : taFiltered,
      tum_turler: isSA ? RAPOR_TURLERI : undefined
    })
  } catch (error) {
    console.error('API genel hata:', error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}

// POST - Firma rapor türü ekle/güncelle
export async function POST(request: NextRequest) {
  const supabase = createClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('id, rol')
      .eq('id', user.id)
      .single()

    if (meError || !me) {
      return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
    }

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    if (!isSA) {
      return NextResponse.json({ ok: false, error: 'access_denied' }, { status: 403 })
    }

    const body = await request.json()
    const { firma_id, rapor_turu, aktif } = body

    if (!firma_id || !rapor_turu) {
      return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
    }

    // Upsert işlemi
    const { data, error } = await supabase
      .from('firma_rapor_turleri')
      .upsert({
        firma_id,
        rapor_turu,
        aktif,
        olusturan_id: user.id,
        guncelleyen_id: user.id
      }, {
        onConflict: 'firma_id,rapor_turu'
      })
      .select()
      .single()

    if (error) {
      console.error('Firma rapor türü ekleme hatası:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('API genel hata:', error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
