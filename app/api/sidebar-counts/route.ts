import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getYetkiliLokasyonIds, getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'

export async function GET(request: Request) {
  const supabase = createClient()

  const {
    data: { user: authUser },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !authUser) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id,rol,firma_id,proje_id')
    .eq('id', authUser.id)
    .single()

  if (meErr || !me) {
    return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
  }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = me.firma_id

  // Query parametrelerini al
  const { searchParams } = new URL(request.url)
  const projeId = searchParams.get('proje_id')
  const firmaIdParam = searchParams.get('firma_id')

  // Base query'ler
  const usersBase = supabase.from('users').select('id', { count: 'exact', head: true })
  // gorevler_normal view: sidebar "Spesifik Görevler" badge'inde Oto Yıkama sayılmaz
  const tasksBase = supabase.from('gorevler_normal').select('id', { count: 'exact', head: true })
  const locationsBase = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true })

  // GorevlerClient default filter ile aynı: ACIK + ISLEMDE + son 24h TAMAMLANDI
  // Aksi halde sidebar "23" gösterip sayfa "5" gösterir → kafa karışıklığı
  const sinir24sIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const ACIK_GOREV_FILTER = `durum.in.(ACIK,ISLEMDE),and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.gt.${sinir24sIso})`
  const applyAcik = <T extends { or: (s: string) => any }>(q: T) => q.or(ACIK_GOREV_FILTER) as T
  const liveBase = supabase
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })

  // Query'leri filtrele
  let usersQuery, tasksQuery, locationsQuery, liveQuery

  if (isSA) {
    // SA: firma + proje kombinasyonuna göre filtrele
    const filterFirma = firmaIdParam || null
    const filterProje = projeId || null

    if (filterFirma && filterProje) {
      usersQuery = usersBase.eq('firma_id', filterFirma).eq('proje_id', filterProje)
      tasksQuery = applyAcik(tasksBase.eq('firma_id', filterFirma).eq('proje_id', filterProje))
      liveQuery = supabase.from('canli_gorevler').select('id', { count: 'exact', head: true }).eq('firma_id', filterFirma).eq('proje_id', filterProje)
      locationsQuery = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('firma_id', filterFirma).eq('proje_id', filterProje)
    } else if (filterFirma) {
      usersQuery = usersBase.eq('firma_id', filterFirma)
      tasksQuery = applyAcik(tasksBase.eq('firma_id', filterFirma))
      liveQuery = liveBase.eq('firma_id', filterFirma)
      locationsQuery = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('firma_id', filterFirma)
    } else {
      usersQuery = usersBase
      tasksQuery = applyAcik(tasksBase)
      liveQuery = liveBase
      locationsQuery = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true })
    }
  } else {
    // tenant_user / musteri: proje_id query param olmaz (ProjeProvider yok),
    // bu roller için kendi user kaydındaki proje_id'yi kullan.
    // tenant_admin: proje_id query param olarak ProjeProvider'dan gelir.
    const isUserRole = me.rol === 'tenant_user' || me.rol === 'musteri'
    const effectiveProjeId = projeId || (isUserRole ? ((me as any).proje_id ?? null) : null)

    // U/M lokasyon kısıtlaması
    const yetkiliLokIds = isUserRole && firmaId
      ? await getYetkiliLokasyonIds(supabase, firmaId, effectiveProjeId)
      : null
    const yetkiliUstLokIds = isUserRole
      ? await getLokasyonYetki(supabase)
      : null

    if (yetkiliUstLokIds && firmaId) {
      usersQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId).in('ust_lokasyon_id', yetkiliUstLokIds)
    } else if (effectiveProjeId) {
      usersQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId!).eq('proje_id', effectiveProjeId)
    } else {
      usersQuery = !firmaId ? usersBase : usersBase.eq('firma_id', firmaId)
    }

    if (effectiveProjeId) {
      let tQ = supabase.from('gorevler_normal').select('id', { count: 'exact', head: true }).eq('proje_id', effectiveProjeId)
      let lQ = supabase.from('canli_gorevler').select('id', { count: 'exact', head: true }).eq('proje_id', effectiveProjeId)
      if (yetkiliLokIds) { tQ = tQ.in('lokasyon_id', yetkiliLokIds); lQ = lQ.in('lokasyon_id', yetkiliLokIds) }
      tasksQuery = applyAcik(tQ); liveQuery = lQ
    } else {
      tasksQuery = applyAcik(!firmaId ? tasksBase : tasksBase.eq('firma_id', firmaId))
      liveQuery = !firmaId ? liveBase : liveBase.eq('firma_id', firmaId)
    }

    if (effectiveProjeId) {
      let locQ = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('proje_id', effectiveProjeId)
      if (yetkiliLokIds) locQ = locQ.in('id', yetkiliLokIds)
      locationsQuery = locQ
    } else {
      locationsQuery = !firmaId ? locationsBase : locationsBase.eq('firma_id', firmaId)
    }
  }

  // Ek query'ler
  const firmsQuery = isSA
    ? supabase.from('firmalar').select('id', { count: 'exact', head: true })
    : null

  // Projeler count
  let projectsQuery
  if (isSA) {
    const filterFirma = firmaIdParam || null
    const filterProje = projeId || null
    if (filterFirma && filterProje) {
      projectsQuery = supabase.from('projeler').select('id', { count: 'exact', head: true }).eq('firma_id', filterFirma).eq('id', filterProje)
    } else if (filterFirma) {
      projectsQuery = supabase.from('projeler').select('id', { count: 'exact', head: true }).eq('firma_id', filterFirma)
    } else {
      projectsQuery = supabase.from('projeler').select('id', { count: 'exact', head: true })
    }
  } else {
    const isUserRole = me.rol === 'tenant_user' || me.rol === 'musteri'
    const ep = projeId || (isUserRole ? ((me as any).proje_id ?? null) : null)
    if (ep) {
      // seçili proje varsa 1 dön (mevcut proje)
      projectsQuery = supabase.from('projeler').select('id', { count: 'exact', head: true }).eq('id', ep)
    } else {
      // tüm projeler veya firma bazlı
      projectsQuery = !firmaId 
        ? supabase.from('projeler').select('id', { count: 'exact', head: true })
        : supabase.from('projeler').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)
    }
  }

  const locationGroupsQuery = isSA
    ? (firmaIdParam
        ? (() => {
            let q = supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
            if (projeId) q = (q as any).eq('proje_id', projeId)
            return q
          })()
        : supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }))
    : (() => {
        const isUserRole = me.rol === 'tenant_user' || me.rol === 'musteri'
        const ep = projeId || (isUserRole ? ((me as any).proje_id ?? null) : null)
        return ep
          ? supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }).eq('proje_id', ep)
          : (!firmaId
              ? supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true })
              : supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId))
      })()

  const checklistTemplatesQuery = isSA 
    ? (firmaIdParam 
        ? supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }))
    : (() => {
        const isUserRole = me.rol === 'tenant_user' || me.rol === 'musteri'
        const ep = projeId || (isUserRole ? ((me as any).proje_id ?? null) : null)
        return ep
          ? supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }).eq('proje_id', ep)
          : (!firmaId
              ? supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true })
              : supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId))
      })()

  const personnelTrackingQuery = isSA 
    ? (firmaIdParam 
        ? supabase.from('personel_takibi').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('personel_takibi').select('id', { count: 'exact', head: true }))
    : (() => {
        const isUserRole = me.rol === 'tenant_user' || me.rol === 'musteri'
        const ep = projeId || (isUserRole ? ((me as any).proje_id ?? null) : null)
        return ep
          ? supabase.from('personel_takibi').select('id', { count: 'exact', head: true }).eq('proje_id', ep)
          : (!firmaId
              ? supabase.from('personel_takibi').select('id', { count: 'exact', head: true })
              : supabase.from('personel_takibi').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId))
      })()

  const reportsQuery = isSA 
    ? (firmaIdParam 
        ? supabase.from('raporlar').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('raporlar').select('id', { count: 'exact', head: true }))
    : (() => {
        const isUserRole = me.rol === 'tenant_user' || me.rol === 'musteri'
        const ep = projeId || (isUserRole ? ((me as any).proje_id ?? null) : null)
        return ep
          ? supabase.from('raporlar').select('id', { count: 'exact', head: true }).eq('proje_id', ep)
          : (!firmaId
              ? supabase.from('raporlar').select('id', { count: 'exact', head: true })
              : supabase.from('raporlar').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId))
      })()


  // Arşiv count
  const arsivQuery = isSA
    ? (firmaIdParam
        ? supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }))
    : (() => {
        const isUserRole = me.rol === 'tenant_user' || me.rol === 'musteri'
        const ep = projeId || (isUserRole ? ((me as any).proje_id ?? null) : null)
        return ep
          ? supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId!).eq('proje_id', ep)
          : firmaId
              ? supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)
              : supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true })
      })()
  // SA için split counts — admins proje bağımsız, employees proje bazlı olabilir
  let adminsQuery = null
  let employeesQuery = null
  if (isSA) {
    const filterFirma = firmaIdParam || null
    const filterProje = projeId || null
    // Firma adminleri (tenant_admin) proje bağımsız — sadece firma filtresi
    adminsQuery = filterFirma
      ? supabase.from('users').select('id', { count: 'exact', head: true }).eq('rol', 'tenant_admin').eq('firma_id', filterFirma)
      : supabase.from('users').select('id', { count: 'exact', head: true }).eq('rol', 'tenant_admin')
    // Firma kullanıcıları (tenant_user) proje seçiliyse proje bazlı
    if (filterFirma && filterProje) {
      employeesQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('rol', 'tenant_user').eq('firma_id', filterFirma).eq('proje_id', filterProje)
    } else if (filterFirma) {
      employeesQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('rol', 'tenant_user').eq('firma_id', filterFirma)
    } else {
      employeesQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('rol', 'tenant_user')
    }
  }

  // Tüm query'leri paralel çalıştır
  const [
    usersRes, 
    tasksRes, 
    locRes, 
    liveRes, 
    adminsRes, 
    employeesRes,
    firmsRes,
    projectsRes,
    locationGroupsRes,
    checklistTemplatesRes,
    personnelTrackingRes,
    reportsRes,
    arsivRes
  ] = await Promise.all([
    usersQuery,
    tasksQuery,
    locationsQuery,
    liveQuery,
    adminsQuery,
    employeesQuery,
    firmsQuery,
    projectsQuery,
    locationGroupsQuery,
    checklistTemplatesQuery,
    personnelTrackingQuery,
    reportsQuery,
    arsivQuery,
  ])

  const anyError =
    usersRes.error ||
    tasksRes.error ||
    locRes.error ||
    liveRes.error ||
    adminsRes?.error ||
    employeesRes?.error ||
    firmsRes?.error ||
    projectsRes?.error ||
    locationGroupsRes?.error ||
    checklistTemplatesRes?.error ||
    personnelTrackingRes?.error ||
    reportsRes?.error ||
    arsivRes?.error

  if (anyError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          usersRes.error?.message ||
          tasksRes.error?.message ||
          locRes.error?.message ||
          liveRes.error?.message ||
          adminsRes?.error?.message ||
          employeesRes?.error?.message ||
          firmsRes?.error?.message ||
          projectsRes?.error?.message ||
          locationGroupsRes?.error?.message ||
          checklistTemplatesRes?.error?.message ||
          personnelTrackingRes?.error?.message ||
          reportsRes?.error?.message ||
          arsivRes?.error?.message ||
          'unknown',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    users_total: usersRes.count ?? 0,
    users_admin_total: adminsRes?.count ?? null,
    users_employee_total: employeesRes?.count ?? null,
    tasks_total: tasksRes.count ?? 0,
    locations_total: locRes.count ?? 0,
    live_total: liveRes.count ?? 0,
    firms_total: firmsRes?.count ?? 0,
    projects_total: projectsRes?.count ?? 0,
    location_groups_total: locationGroupsRes?.count ?? 0,
    checklist_templates_total: checklistTemplatesRes?.count ?? 0,
    personnel_tracking_total: personnelTrackingRes?.count ?? 0,
    reports_total: reportsRes?.count ?? 0,
    arsiv_total: arsivRes?.count ?? 0,
    debug: {
      isSA,
      rol: me.rol,
      firmaId,
      projeId,
      effectiveProjeId: !isSA ? (projeId || ((me.rol === 'tenant_user' || me.rol === 'musteri') ? ((me as any).proje_id ?? null) : null)) : null,
      firmaIdParam,
    }
  })
}
