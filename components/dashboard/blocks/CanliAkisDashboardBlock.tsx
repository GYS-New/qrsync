"use client"

import BlockWrapper from "./BlockWrapper"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { CANLI_DURUM_LABEL } from "@/lib/utils"

const ROW_COUNT = 8

interface Props {
  firmaId?: string | null
  projeId?: string | null
  basePath?: string
}

export default function CanliAkisDashboardBlock({ firmaId, projeId, basePath }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      let q = supabase
        .from("canli_gorevler")
        .select("id,tanim,durum,durum_degisim_tarihi")
        .order("durum_degisim_tarihi", { ascending: false })
        .limit(ROW_COUNT)

      if (firmaId) q = q.eq("firma_id", firmaId)
      if (projeId) q = (q as any).eq("proje_id", projeId)

      const { data } = await q
      setRows(data || [])
    }

    load()
    const i = setInterval(load, 1000)
    return () => clearInterval(i)
  }, [firmaId, projeId])

  const durumRenk: Record<string, string> = {
    HAZIR:    '#6b7280',
    ACIK:     '#374151',
    BEKLEMEDE:'#e6a817',
    TAMAMLANDI:'#185a9b',
    IPTAL:    '#c0392b',
    ZAMANI_GECMIS: '#c0392b',
    ZAMANINDA_YAPILAMAYAN: '#c0392b',
    KAPATILDI: '#4b5563',
    SILINDI:  '#b0b0b0',
  }

  return (
    <BlockWrapper
      title="Frekansiyel Görev Akışı"
      size="big"
      href={basePath ? `${basePath}/dashboard/canli-islemler` : "/dashboard/canli-islemler"}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: ROW_COUNT }).map((_, i) => {
          const r = rows[i]
          return (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f0f4f0', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', width: 18, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r?.tanim || ''}</div>
              {r?.durum && (
                <div style={{ fontSize: 11, fontWeight: 700, color: durumRenk[r.durum] ?? '#4b5563', flexShrink: 0 }}>
                  {CANLI_DURUM_LABEL[r.durum] ?? r.durum}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </BlockWrapper>
  )
}
