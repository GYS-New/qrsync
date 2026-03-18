
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PersonelMesaiPage() {
  const supabase = createClient()

  const [aktif, setAktif] = useState<any[]>([])
  const [bugun, setBugun] = useState<any[]>([])

  const proje_id = null

  useEffect(() => {
    const load = async () => {

      const { data: aktifData } = await supabase
        .from('personel_mesai_kayitlari')
        .select('*, users(isim_soyisim)')
        .is('cikis_saati', null)

      const today = new Date().toISOString().split('T')[0]

      const { data: bugunData } = await supabase
        .from('personel_mesai_kayitlari')
        .select('*, users(isim_soyisim)')
        .eq('kayit_tarihi', today)

      setAktif(aktifData || [])
      setBugun(bugunData || [])
    }

    load()
  }, [])

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Personel Mesai Takibi</h1>

      <div>
        <h2 className="text-lg font-semibold mb-2">Sahada Olan Personel</h2>
        <table className="w-full border">
          <thead>
            <tr>
              <th>Personel</th>
              <th>Giriş</th>
            </tr>
          </thead>
          <tbody>
            {aktif.map((a:any)=>(
              <tr key={a.id}>
                <td>{a.users?.isim_soyisim}</td>
                <td>{a.giris_saati}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Bugünkü Mesai</h2>
        <table className="w-full border">
          <thead>
            <tr>
              <th>Personel</th>
              <th>Giriş</th>
              <th>Çıkış</th>
            </tr>
          </thead>
          <tbody>
            {bugun.map((b:any)=>(
              <tr key={b.id}>
                <td>{b.users?.isim_soyisim}</td>
                <td>{b.giris_saati}</td>
                <td>{b.cikis_saati || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}
