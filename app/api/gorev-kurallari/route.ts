import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { auditLog } from '@/lib/audit/log'

// ── GET: Firmanın tüm kurallarını listele ────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const url = new URL(req.url)
  const firmaId = url.searchParams.get('firma_id') ?? me.firma_id
  const projeId = url.searchParams.get('proje_id') ?? null

  // SA tüm firmaları görebilir, TA/U yalnızca kendi firmasını
  if ((me.rol === 'tenant_admin' || me.rol === 'tenant_user' || me.rol === 'musteri') && firmaId !== me.firma_id) {
    return NextResponse.json({ error: 'Yetkisiz firma' }, { status: 403 })
  }

  const admin = createAdminClient()

  const data = await fetchAll(() => {
    let q = admin
      .from('gorev_kurallari')
      .select('*')
      .eq('firma_id', firmaId)
      .order('kayit_tarihi', { ascending: false })
    if (projeId) q = (q as any).eq('proje_id', projeId)
    return q
  })

  return NextResponse.json(data)
}

// ── POST: Yeni kural oluştur ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })
  }

  const body = await req.json()
  const {
    lokasyon_id, tanim, aktif_gunler, gunluk_frekans_sayisi, haftalik_frekans_sayisi,
    frekans_tipi: frekansTipiRaw,
    aktif_olma_saati, baslangic_tarihi, bitis_tarihi, atanan_kullanici_id,
    proje_id,
    acik_bekleme_saat, bekleme_gecmis_saat,  // Kural seviyesi ömür override (NULL = proje/firma'ya düş)
  } = body

  // Override saat değerleri: int veya NULL
  function normSaat(v: any): number | null {
    if (v === undefined || v === null || v === '') return null
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    if (n < 1 || n > 240) return null
    return Math.floor(n)
  }
  const acikBeklemeSaat = normSaat(acik_bekleme_saat)
  const beklemeGecmisSaat = normSaat(bekleme_gecmis_saat)

  const frekans_tipi: 'gunluk' | 'haftalik' = frekansTipiRaw === 'haftalik' ? 'haftalik' : 'gunluk'

  // Validasyon
  if (!lokasyon_id || !tanim?.trim()) {
    return NextResponse.json({ error: 'lokasyon_id ve tanim zorunlu' }, { status: 400 })
  }
  if (!Array.isArray(aktif_gunler) || aktif_gunler.length === 0) {
    return NextResponse.json({ error: 'En az bir aktif gün seçin' }, { status: 400 })
  }
  if (frekans_tipi === 'gunluk') {
    if (!gunluk_frekans_sayisi || gunluk_frekans_sayisi < 1 || gunluk_frekans_sayisi > 24) {
      return NextResponse.json({ error: 'Günlük frekans 1-24 arasında olmalı' }, { status: 400 })
    }
  } else {
    if (!haftalik_frekans_sayisi || haftalik_frekans_sayisi < 1 || haftalik_frekans_sayisi > 20) {
      return NextResponse.json({ error: 'Haftalık frekans 1-20 arasında olmalı' }, { status: 400 })
    }
  }

  // Lokasyonun firmaya ait olduğunu doğrula
  const { data: lok } = await supabase
    .from('lokasyonlar')
.select('firma_id, proje_id')
.eq('id', lokasyon_id)
.single()
  if (!lok) return NextResponse.json({ error: 'Lokasyon bulunamadı' }, { status: 404 })

  const firmaId = me.rol === 'tenant_admin' ? me.firma_id : (body.firma_id ?? lok.firma_id)
  if (me.rol === 'tenant_admin' && lok.firma_id !== me.firma_id) {
    return NextResponse.json({ error: 'Lokasyon size ait değil' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('gorev_kurallari')
    .insert({
      firma_id: firmaId,
      lokasyon_id,
      tanim: tanim.trim(),
      aktif_gunler,
      frekans_tipi,
      gunluk_frekans_sayisi: frekans_tipi === 'gunluk' ? gunluk_frekans_sayisi : null,
      haftalik_frekans_sayisi: frekans_tipi === 'haftalik' ? haftalik_frekans_sayisi : null,
      aktif_olma_saati: aktif_olma_saati ?? '08:00',
      baslangic_tarihi: baslangic_tarihi ?? new Date().toISOString().slice(0, 10),
      bitis_tarihi: bitis_tarihi ?? null,
      atanan_kullanici_id: atanan_kullanici_id ?? null,
      olusturan_id: user.id,
      kaynak: 'manuel',
      proje_id: proje_id ?? lok.proje_id,
      acik_bekleme_saat: acikBeklemeSaat,
      bekleme_gecmis_saat: beklemeGecmisSaat,
    })
    .select()
    .single()

  if (error) {
    void auditLog({
      tip: 'kural_ekle', tablo: 'gorev_kurallari', basarili: false, hata_mesaji: error.message,
      kullanici_id: user.id, firma_id: firmaId, proje_id: proje_id ?? lok.proje_id ?? null,
      detay: { tanim, lokasyon_id, frekans_tipi },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit fire-and-forget — response'u geciktirmesin (~200-500ms tasarruf, çoklu lokasyonda paralel POST'larda kümülatif fayda)
  void auditLog({
    tip: 'kural_ekle', tablo: 'gorev_kurallari',
    kullanici_id: user.id, firma_id: firmaId, proje_id: proje_id ?? lok.proje_id ?? null,
    detay: {
      kural_id: data.id, tanim: data.tanim, lokasyon_id: data.lokasyon_id,
      frekans_tipi, gunluk_frekans_sayisi, haftalik_frekans_sayisi,
      aktif_gunler, aktif_olma_saati: data.aktif_olma_saati,
    },
  })
  return NextResponse.json(data, { status: 201 })
}
