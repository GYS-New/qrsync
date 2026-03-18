import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TAHizliRaporlarPage() {
  redirect('/ta/dashboard/raporlar/grafiksel')
}
