import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildGenelRaporData } from "@/lib/reports/genel-rapor-data"
import { fillGenelRaporWithPython } from "@/lib/reports/fill-excel-python"

export const runtime = "nodejs"

export async function GET(request: Request) {

  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: "Oturum bulunamadı" },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)

  const firmaId = searchParams.get("firmaId")

  if (!firmaId) {
    return NextResponse.json(
      { error: "Firma ID gerekli" },
      { status: 400 }
    )
  }

  try {
    const data = await buildGenelRaporData({
      firmaId,
      projeId: searchParams.get('projeId') || null,
      ustLokasyonId: searchParams.get("ustLokasyonId"),
      altLokasyonId: searchParams.get("altLokasyonId"),
      raporBaslangic: searchParams.get("raporBaslangic"),
      raporBitis: searchParams.get("raporBitis"),
      raporuAlan: searchParams.get("raporuAlan"),
    })

    const buffer = await fillGenelRaporWithPython(data)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename=genel_rapor_${Date.now()}.xlsx`,
      },
    })
  } catch (err: any) {
    console.error("[genel-rapor-excel] Hata:", err)
    return NextResponse.json(
      { error: err?.message ?? "Bilinmeyen hata" },
      { status: 500 }
    )
  }
}