import { createAdminClient, createClient } from '@/lib/supabase/server'

export type ImportScope = {
  me: any
  firmaId: string
  isSA: boolean
  isTA: boolean
  admin: ReturnType<typeof createAdminClient>
}

export async function requireImportScope(requestedFirmaId?: string | null): Promise<ImportScope> {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('Unauthorized')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me) throw new Error('Kullanıcı bulunamadı')

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) throw new Error('Yetkisiz işlem')

  const firmaId = isSA ? (requestedFirmaId || null) : me.firma_id
  if (!firmaId) throw new Error('Firma seçimi gerekli')

  return { me, firmaId, isSA, isTA, admin: createAdminClient() }
}
