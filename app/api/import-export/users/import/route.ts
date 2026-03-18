import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { normalizeEmail, normalizeText } from '@/lib/import-export/format'
import { readXlsxFromBuffer } from '@/lib/import-export/xlsx'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const firmaIdParam = form.get('firmaId') ? String(form.get('firmaId')) : null
    if (!(file instanceof File)) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    const scope = await requireImportScope(firmaIdParam)
    const parsed = await readXlsxFromBuffer(Buffer.from(await file.arrayBuffer()))
    if (!parsed.rows.length) return NextResponse.json({ error: 'Excel içinde veri bulunamadı' }, { status: 400 })

    let created = 0
    const errors: string[] = []
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]
      const rowNo = i + 2
      const isim_soyisim = normalizeText(row.isim_soyisim)
      const email = normalizeEmail(row.email)
      const telefon = normalizeText(row.telefon) || null
      const password = normalizeText(row.password)
      if (!isim_soyisim || !email || !password) {
        errors.push(`Satır ${rowNo}: isim_soyisim, email ve password zorunludur.`)
        continue
      }
      const { data: createdUser, error: createErr } = await scope.admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (createErr || !createdUser?.user) {
        errors.push(`Satır ${rowNo}: ${createErr?.message ?? 'Auth kullanıcı oluşturulamadı'}`)
        continue
      }
      const newUserId = createdUser.user.id
      const { error: insertErr } = await scope.admin.from('users').insert({
        id: newUserId,
        isim_soyisim,
        email,
        telefon,
        rol: 'tenant_user',
        firma_id: scope.firmaId,
        kayit_yapan_id: scope.me.id,
        aktif: true,
      })
      if (insertErr) {
        await scope.admin.auth.admin.deleteUser(newUserId)
        errors.push(`Satır ${rowNo}: ${insertErr.message}`)
        continue
      }
      created++
    }
    return NextResponse.json({ ok: true, created, failed: errors.length, errors })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
