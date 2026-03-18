import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    .select('id,rol,firma_id')
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
  const tasksBase = supabase.from('gorevler').select('id', { count: 'exact', head: true })
  const locationsBase = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true })
  const liveBase = supabase
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('durum', 'ACIK')

  // Query'leri filtrele
  let usersQuery, tasksQuery, locationsQuery, liveQuery

  if (isSA) {
    // SA: firma + proje kombinasyonuna göre filtrele
    const filterFirma = firmaIdParam || null
    const filterProje = projeId || null

    if (filterFirma && filterProje) {
      usersQuery = usersBase.eq('firma_id', filterFirma).eq('proje_id', filterProje)
      tasksQuery = tasksBase.eq('firma_id', filterFirma).eq('proje_id', filterProje)
      liveQuery = supabase.from('canli_gorevler').select('id', { count: 'exact', head: true }).eq('durum', 'ACIK').eq('firma_id', filterFirma).eq('proje_id', filterProje)
      locationsQuery = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('firma_id', filterFirma).eq('proje_id', filterProje)
    } else if (filterFirma) {
      usersQuery = usersBase.eq('firma_id', filterFirma)
      tasksQuery = tasksBase.eq('firma_id', filterFirma)
      liveQuery = liveBase.eq('firma_id', filterFirma)
      locationsQuery = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('firma_id', filterFirma)
    } else {
      usersQuery = usersBase
      tasksQuery = tasksBase
      liveQuery = liveBase
      locationsQuery = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true })
    }
  } else {
    // TA: proje filtresi varsa o projeye göre, yoksa firmaya göre
    if (projeId) {
      // Proje seçiliyse: o projeye ait kullanıcılar
      usersQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('proje_id', projeId)
    } else {
      // Proje seçili değilse: firmaya ait kullanıcılar
      usersQuery = !firmaId ? usersBase : usersBase.eq('firma_id', firmaId)
    }
    
    if (projeId) {
      // Proje seçiliyse: o projeye ait görevler ve canlı görevler
      tasksQuery = supabase.from('gorevler').select('id', { count: 'exact', head: true }).eq('proje_id', projeId)
      liveQuery = supabase.from('canli_gorevler').select('id', { count: 'exact', head: true }).eq('proje_id', projeId).eq('durum', 'ACIK')
    } else {
      // Proje seçili değilse: firmaya ait görevler
      tasksQuery = !firmaId ? tasksBase : tasksBase.eq('firma_id', firmaId)
      liveQuery = !firmaId ? liveBase : liveBase.eq('firma_id', firmaId)
    }
    
    // Lokasyonlar için özel mantık (doğru çalışıyor)
    if (projeId) {
      // Proje seçiliyse o projeye ait lokasyonlar
      locationsQuery = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('proje_id', projeId)
    } else {
      // Proje seçili değilse firma bazlı
      locationsQuery = !firmaId 
        ? locationsBase 
        : locationsBase.eq('firma_id', firmaId)
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
    if (projeId) {
      // TA: seçili proje varsa 1 dön (mevcut proje)
      projectsQuery = supabase.from('projeler').select('id', { count: 'exact', head: true }).eq('id', projeId)
    } else {
      // TA: tüm projeler veya firma bazlı
      projectsQuery = !firmaId 
        ? supabase.from('projeler').select('id', { count: 'exact', head: true })
        : supabase.from('projeler').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)
    }
  }

  const locationGroupsQuery = isSA 
    ? (firmaIdParam 
        ? supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }))
    : (projeId 
        ? supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }).eq('proje_id', projeId)
        : (!firmaId 
            ? supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true })
            : supabase.from('lokasyon_gruplari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)))

  const checklistTemplatesQuery = isSA 
    ? (firmaIdParam 
        ? supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }))
    : (projeId 
        ? supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }).eq('proje_id', projeId)
        : (!firmaId 
            ? supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true })
            : supabase.from('checklist_sablonlari').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)))

  const personnelTrackingQuery = isSA 
    ? (firmaIdParam 
        ? supabase.from('personel_takibi').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('personel_takibi').select('id', { count: 'exact', head: true }))
    : (projeId 
        ? supabase.from('personel_takibi').select('id', { count: 'exact', head: true }).eq('proje_id', projeId)
        : (!firmaId 
            ? supabase.from('personel_takibi').select('id', { count: 'exact', head: true })
            : supabase.from('personel_takibi').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)))

  const reportsQuery = isSA 
    ? (firmaIdParam 
        ? supabase.from('raporlar').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('raporlar').select('id', { count: 'exact', head: true }))
    : (projeId 
        ? supabase.from('raporlar').select('id', { count: 'exact', head: true }).eq('proje_id', projeId)
        : (!firmaId 
            ? supabase.from('raporlar').select('id', { count: 'exact', head: true })
            : supabase.from('raporlar').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)))


  // Arşiv count
  const arsivQuery = isSA
    ? (firmaIdParam
        ? supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaIdParam)
        : supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }))
    : (projeId
        ? supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId!).eq('proje_id', projeId)
        : firmaId
            ? supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)
            : supabase.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }))
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
      firmaId,
      projeId,
      firmaIdParam,
      queries: {
        usersQuery: isSA ? (firmaIdParam ? `firma_id=${firmaIdParam}` : 'all') : (projeId ? `proje_id=${projeId}` : (firmaId ? `firma_id=${firmaId}` : 'all')),
        projectsQuery: isSA ? (firmaIdParam ? `firma_id=${firmaIdParam}` : 'all') : (projeId ? `proje_id=${projeId}` : (firmaId ? `firma_id=${firmaId}` : 'all')),
      }
    }
  })
}
