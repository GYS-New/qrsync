/**
 * lib/mesai/kontrolEt.ts
 *
 * Personel takibi aktifse ve kullanıcı bugün iş başı yapmamışsa (veya iş bitimi yaptıysa)
 * görev ataması engellenir.
 *
 * Kullanım:
 *   const engel = await mesaiKontrolEt(admin, { firmaId, projeId, atananUserId })
 *   if (engel) return NextResponse.json({ error: engel }, { status: 422 })
 */

export async function mesaiKontrolEt(
  admin: any,
  opts: {
    firmaId: string
    projeId?: string | null
    atananUserId: string | null | undefined
  }
): Promise<string | null> {
  const { firmaId, projeId, atananUserId } = opts

  // Atanan kullanıcı yoksa kontrol gerekmez
  if (!atananUserId) return null

  // Firma personel takibi aktif mi?
  const { data: firma } = await admin
    .from('firmalar')
    .select('personel_takibi_aktif')
    .eq('id', firmaId)
    .single()

  if (!firma?.personel_takibi_aktif) return null // kapalı → serbest

  // Proje varsa proje kontrolü
  if (projeId) {
    const { data: proje } = await admin
      .from('projeler')
      .select('personel_takibi_aktif')
      .eq('id', projeId)
      .single()

    if (!proje?.personel_takibi_aktif) return null // proje kapalı → serbest
  }

  // TRT bugün
  const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  // Kullanıcının bugün aktif mesai kaydı var mı?
  // (giris_saati dolu, cikis_saati null, arsivlenmemiş)
  const { data: mesai } = await admin
    .from('personel_mesai_kayitlari')
    .select('id')
    .eq('user_id', atananUserId)
    .eq('firma_id', firmaId)
    .eq('kayit_tarihi', bugun)
    .eq('arsivlendi', false)
    .is('cikis_saati', null)
    .not('giris_saati', 'is', null)
    .maybeSingle()

  if (!mesai) {
    return 'Bu personel bugün iş başı yapmamış. Personel takibi aktif olduğunda işe başlamamış personele görev atanamaz.'
  }

  return null // aktif mesai var → atama serbest
}
