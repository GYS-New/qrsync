import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { formatDate } from '@/lib/utils'

export default async function FirmalarPage() {
  const supabase = createClient()
  const { data: firmalar } = await supabase
    .from('firmalar')
    .select('*')
    .order('kayit_tarihi', { ascending: false })

  return (
    <div>
      <Topbar
        title="Firmalar"
        base="/sa"
        breadcrumbs={[{ label:'Yönetim' }, { label:'Firmalar' }]}
      />
      <div style={{ padding:'24px 28px' }}>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom: 12 }}>
        <a href="/sa/dashboard/firmalar/yeni"><button className="verde-btn-primary">＋ Firma Ekle</button></a>
      </div>

        <div className="verde-card">
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #ffe8c8', display:'flex', gap:8 }}>
            <input className="verde-input" placeholder="Firma ara..." style={{ maxWidth:240 }} />
          </div>
          <table className="verde-table">
            <thead>
              <tr>
                <th>Firma</th>
                <th>Vergi No</th>
                <th>Yetkili</th>
                <th>Telefon</th>
                <th>Durum</th>
                <th>Kayıt Tarihi</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {(firmalar ?? []).map((f: any) => (
                <tr key={f.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <div style={{ width:28, height:28, borderRadius:5, background:'#fff7ed', border:'1px solid #ffd9a0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#ff7f00', flexShrink:0 }}>
                        {(f.firma_adi || f.ticari_unvan)?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight:600, color:'#3d1c00' }}>{f.firma_adi || f.ticari_unvan}</div>
                        <div style={{ fontSize:10.5, color:'#9a7b6a' }}>{f.ticari_unvan}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color:'#6b4423' }}>{f.vergi_no}</td>
                  <td>{f.yetkili_isim}</td>
                  <td style={{ color:'#6b4423' }}>{f.yetkili_tel}</td>
                  <td>
                    <span className={`verde-badge ${f.aktif ? 'status-islemde' : 'status-iptal'}`}>
                      {f.aktif ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td style={{ color:'#9a7b6a', whiteSpace:'nowrap' }}>{formatDate(f.kayit_tarihi)}</td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <a href={`/sa/dashboard/firmalar/${f.id}`}>
                        <button className="verde-btn-ghost" style={{ padding:'4px 10px', fontSize:11 }}>Düzenle</button>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {!firmalar?.length && (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'#9a7b6a', padding:'48px 0' }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>🏢</div>
                  <div>Henüz firma eklenmemiş</div>
                  <a href="/sa/dashboard/firmalar/yeni" style={{ color:'#ff7f00', fontWeight:600, fontSize:12.5, display:'block', marginTop:8 }}>+ İlk firmayı ekle</a>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
