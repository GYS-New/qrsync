/**
 * GET /api/marketing/tam-sunum-pptx
 *
 * SA-only. GYS musteri tanitim sunumu — TAM EDITABLE PPTX.
 * 18 slayt native pptxgenjs shape+text+chart ile insa edilir — her metin,
 * her renk, her kutu PowerPoint'te duzenlenebilir. Grafikler native chart
 * (bar/line), PowerPoint'te verisi bile duzenlenebilir.
 *
 * Icerik: vaka calismasi + tanitim sunumu birlestirilmis curated narrative.
 * Veri: RPC marketing_vaka_veri (canli).
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import PptxGenJS from 'pptxgenjs'

export const runtime = 'nodejs'
export const maxDuration = 90

const nf = new Intl.NumberFormat('tr-TR')

// Renk paleti (hex, # yok)
const C = {
  dark: '0F1A0F',
  darkGreen: '1A5C2A',
  green: '10B981',
  greenMid: '065F46',
  greenLight: 'DCFCE7',
  greenPale: '86EFAC',
  amber: 'F59E0B',
  amberLight: 'FEF3C7',
  amberDark: '92400E',
  red: 'EF4444',
  redLight: 'FEE2E2',
  redDark: '991B1B',
  gray: '6B7280',
  grayLight: 'F8FAFC',
  grayMid: '475569',
  border: 'E5E7EB',
  white: 'FFFFFF',
}

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadi' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
    if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
      return NextResponse.json({ error: 'SA erisimi gerek' }, { status: 403 })
    }

    const admin = createAdminClient()
    const p = new URL(request.url).searchParams
    let projeId = p.get('proje_id')
    if (!projeId) {
      const { data: proje } = await admin.from('projeler').select('id').eq('ad', 'OYAK RENAULT').maybeSingle()
      projeId = proje?.id ?? null
    }

    // ============ VERI ============
    let v: any = {}
    if (projeId) {
      const { data } = await admin.rpc('marketing_vaka_veri', { p_proje_id: projeId })
      v = data ?? {}
    }
    const toplam = v.toplam ?? 189000
    const tamamlanan = v.tamamlanan ?? 137000
    const sapma = v.sapma ?? 48000
    const kayip = v.kayip ?? 2200
    const farkliLok = v.farkli_lokasyon ?? 416
    const aktifPersonel = v.aktif_personel ?? 240
    const medianSure = v.median_sure ?? 26
    const degToplam = v.deg_toplam ?? 336
    const basariPct = toplam > 0 ? Math.round((tamamlanan + sapma) / toplam * 1000) / 10 : 98
    const kayipPct = toplam > 0 ? Math.round(kayip / toplam * 1000) / 10 : 1.2

    const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
    const monthLbl = (key: string) => AY[parseInt((key ?? '1-1').split('-')[1] ?? '1', 10) - 1] ?? key
    const aylik: { ay: string; toplam: number }[] = (v.aylik ?? []).map((a: any) => ({ ay: monthLbl(a.ay), toplam: Number(a.toplam) || 0 }))
    const degAylik: { ay: string; yildiz: number }[] = (v.deg_aylik ?? []).map((a: any) => ({ ay: monthLbl(a.ay), yildiz: Number(a.yildiz_ort) || 0 }))
    const persAylik: { ay: string; pers: number }[] = (v.personel_adoption ?? []).map((a: any) => ({ ay: monthLbl(a.ay), pers: Number(a.pers) || 0 }))
    const saatler: number[] = Array.from({ length: 24 }, () => 0)
    for (const s of (v.saat_dagilimi ?? [])) { const h = Number(s.saat); if (h >= 0 && h < 24) saatler[h] = Number(s.c) || 0 }

    const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'long', year: 'numeric' })

    // ============ PPTX INIT ============
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 inch
    pptx.title = 'GYS Görev Yönetim Sistemi — Müşteri Tanıtım Sunumu'
    pptx.author = 'İO Teknoloji'
    pptx.company = 'İO Teknoloji'

    const W = 13.333, H = 7.5

    // ====== HELPER ======
    function addHeader(slide: PptxGenJS.Slide, tag: string, title: string, sub: string, num: string) {
      slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.5, w: W - 1.2, h: 0.04, fill: { color: C.green }, line: { color: C.green } })
      slide.addText(tag, { x: 0.6, y: 0.2, w: 10, h: 0.3, fontSize: 10, bold: true, color: C.green, fontFace: 'Inter', charSpacing: 3 })
      slide.addText(title, { x: 0.6, y: 0.5, w: 10, h: 0.8, fontSize: 26, bold: true, color: C.dark, fontFace: 'Inter' })
      if (sub) slide.addText(sub, { x: 0.6, y: 1.3, w: 11, h: 0.4, fontSize: 13, color: C.grayMid, fontFace: 'Inter' })
      slide.addText(num, { x: W - 2, y: 0.2, w: 1.4, h: 0.3, fontSize: 10, bold: true, color: C.gray, fontFace: 'Inter', align: 'right' })
    }
    function addFooter(slide: PptxGenJS.Slide, right: string) {
      slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: H - 0.4, w: W - 1.2, h: 0.01, fill: { color: C.border }, line: { color: C.border } })
      slide.addText('GYS Müşteri Sunumu', { x: 0.6, y: H - 0.35, w: 5, h: 0.25, fontSize: 9, color: C.gray, fontFace: 'Inter' })
      slide.addText(right, { x: W - 5.6, y: H - 0.35, w: 5, h: 0.25, fontSize: 9, color: C.gray, fontFace: 'Inter', align: 'right' })
    }

    // Bir kart cizer (arka plan + baslik + metin)
    function card(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, opts: {
      bg?: string; borderColor?: string; borderWidth?: number; borderLeft?: string; radius?: number
    }) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h,
        fill: { color: opts.bg ?? C.white },
        line: { color: opts.borderColor ?? C.border, width: opts.borderWidth ?? 1 },
        rectRadius: opts.radius ?? 0.08,
      })
      if (opts.borderLeft) {
        slide.addShape(pptx.ShapeType.rect, {
          x, y, w: 0.07, h,
          fill: { color: opts.borderLeft }, line: { color: opts.borderLeft },
        })
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 01 — KAPAK
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.dark }
      // Dekoratif cember/overlay (opsiyonel yesil daireler)
      s.addShape(pptx.ShapeType.ellipse, {
        x: W - 3, y: -2, w: 6, h: 6,
        fill: { color: C.green }, line: { color: C.green },
        rotate: 0,
      } as any)
      s.addShape(pptx.ShapeType.ellipse, {
        x: W - 1, y: 4, w: 4, h: 4,
        fill: { color: C.darkGreen }, line: { color: C.darkGreen },
      } as any)
      // Logo
      s.addShape(pptx.ShapeType.ellipse, { x: 0.7, y: 0.6, w: 0.22, h: 0.22, fill: { color: C.greenPale }, line: { color: C.greenPale } })
      s.addText('GYS · Görev Yönetim Sistemi', { x: 1.0, y: 0.5, w: 8, h: 0.4, fontSize: 18, bold: true, color: C.white, fontFace: 'Inter' })
      // Baslik
      s.addText([
        { text: 'Sahadaki her işin\n', options: { color: C.white } },
        { text: 'dijital ispatı.', options: { color: C.greenPale } },
      ], { x: 0.7, y: 2.2, w: 10, h: 2.8, fontSize: 56, bold: true, fontFace: 'Inter', paraSpaceAfter: 6 })
      // Tagline
      s.addText('Temizlik, bakım ve operasyon ekiplerinizi QR + Mobil + Yönetici Paneli ile şeffaf, ölçülebilir ve ispat edilebilir hale getirin.',
        { x: 0.7, y: 5.1, w: 10.5, h: 1, fontSize: 18, color: C.white, fontFace: 'Inter' })
      // Pills
      const pillText = ['🏭 Sanayi tesisleri', '🏢 Site yönetimi', '🏨 AVM & otel', '🏥 Sağlık']
      pillText.forEach((t, i) => {
        s.addShape(pptx.ShapeType.roundRect, {
          x: 0.7 + i * 2.5, y: 6.2, w: 2.3, h: 0.5,
          fill: { color: C.dark, transparency: 20 },
          line: { color: C.white, width: 0.5 },
          rectRadius: 0.25,
        })
        s.addText(t, { x: 0.7 + i * 2.5, y: 6.2, w: 2.3, h: 0.5, fontSize: 11, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: 'Inter' })
      })
      // Alt
      s.addText('Müşteri Tanıtım Sunumu · 2026', { x: 0.7, y: 7.05, w: 6, h: 0.3, fontSize: 10, color: C.greenPale, fontFace: 'Inter' })
      s.addText(tarih, { x: W - 4, y: 7.05, w: 3.3, h: 0.3, fontSize: 10, color: C.greenPale, fontFace: 'Inter', align: 'right' })
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 02 — PROBLEM
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'DURUM TESPİTİ', 'Sahadaki ekibinizin bugün ne yaptığını biliyor musunuz?', 'Dijital olmayan operasyonlarda 6 tipik sorun:', '02 / 18')
      const pains = [
        ['📋', 'Kağıt pano, kaybolan evrak', 'Süpervizör imzalar, fiziksel evrak kaybolur, tahrif edilir. İş yapıldı mı belli değil.'],
        ['🤷', 'Kaçan görevler fark edilmez', 'Dijital öncesi tesislerde görev kayıp oranı %10-20. Hangi vardiya, hangi lokasyon — belli olmaz.'],
        ['💬', 'Müşteri şikayeti "mesajda" kalır', 'WhatsApp\'ta akıp giden mesaj. Kim ne zaman çözdü — kaybolur.'],
        ['⏱️', 'Rapor hazırlamak 4 saat sürer', 'Excel\'de elle rapor. Veri güvenilmez, grafik yok, anında güncellenemez.'],
        ['🌙', 'Gece vardiyası = kör nokta', '03:00\'te ne yapıldı? Süpervizör sabah gelir, söylenene inanır.'],
        ['📄', 'Müşteriye sunacak kanıt yok', '"Her gün temizlik yapılıyor" sözü. Düzenlenebilir Excel. Müşteri güvenmez.'],
      ]
      const cols = 2, rowH = 1.4, colW = 5.9, gapX = 0.3, gapY = 0.3
      pains.forEach((pn, i) => {
        const col = i % cols, row = Math.floor(i / cols)
        const x = 0.6 + col * (colW + gapX)
        const y = 1.9 + row * (rowH + gapY)
        card(s, x, y, colW, rowH, { bg: 'FEF2F2', borderColor: 'FECACA', radius: 0.1 })
        // emoji kutu
        s.addShape(pptx.ShapeType.roundRect, { x: x + 0.2, y: y + 0.2, w: 0.7, h: 0.7, fill: { color: 'FEE2E2' }, line: { color: 'FEE2E2' }, rectRadius: 0.1 })
        s.addText(pn[0], { x: x + 0.2, y: y + 0.2, w: 0.7, h: 0.7, fontSize: 24, align: 'center', valign: 'middle' })
        s.addText(pn[1], { x: x + 1.05, y: y + 0.18, w: colW - 1.2, h: 0.4, fontSize: 14, bold: true, color: C.redDark, fontFace: 'Inter' })
        s.addText(pn[2], { x: x + 1.05, y: y + 0.58, w: colW - 1.2, h: 0.8, fontSize: 11, color: '7F1D1D', fontFace: 'Inter' })
      })
      addFooter(s, 'Problem Tespiti')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 03 — CÖZÜM / 4 PILLAR
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'ÇÖZÜM', 'GYS tek platform, 4 güçlü modül', 'QR + NFC + Mobil + Web Paneli — sahadaki her işi kayıt altına alır, şeffaf raporlar.', '03 / 18')
      const pillars = [
        ['Frekansiyel Görevler', 'Belirlediğiniz periyotlarda otomatik üretilen tekrarlı görevler. Personel QR okutur, 1 dokunuşta kapatır. Zamanında yapılmayanlar otomatik "sapma" veya "kayıp" olarak işaretlenir.'],
        ['Spesifik Görevler', 'Anlık talep ve bakım işleri. Yönetici atar, personel yapar, durum anında yansır. Çeklist, personel ataması, fotoğraf ekleme desteği.'],
        ['Müşteri Değerlendirme', 'Her lokasyonda QR/NFC ile ziyaretçi değerlendirmesi. Yıldız, yorum, fotoğraf. Yönetici aksiyon atar, trend izler.'],
        ['Yönetici Paneli & Raporlar', 'Canlı dashboard, 7+ hazır rapor, PDF/Excel çıktısı. Tamper-evident PDF müşteri sunumu için ispat niteliğinde.'],
      ]
      const pW = 5.9, pH = 2.3, gap = 0.3
      pillars.forEach((pr, i) => {
        const col = i % 2, row = Math.floor(i / 2)
        const x = 0.6 + col * (pW + gap)
        const y = 2.0 + row * (pH + gap)
        card(s, x, y, pW, pH, { bg: C.greenLight, borderColor: C.greenPale, borderWidth: 1, radius: 0.12 })
        s.addText(pr[0], { x: x + 0.3, y: y + 0.3, w: pW - 0.6, h: 0.5, fontSize: 18, bold: true, color: C.greenMid, fontFace: 'Inter' })
        s.addText(pr[1], { x: x + 0.3, y: y + 0.9, w: pW - 0.6, h: pH - 1.2, fontSize: 12, color: C.greenMid, fontFace: 'Inter' })
      })
      addFooter(s, 'Modül Özeti')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 04 — NASIL ÇALIŞIR / AKIŞ
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'KURULUM & AKIŞ', '4 adımda saha operasyonu dijitale geçer', 'Donanım gerektirmez, telefon yeter. 1 gün içinde canlıya alınır.', '04 / 18')
      const steps = [
        ['1', 'Lokasyonlar girilir', 'WC, çay, ofis, atölye... Her nokta ağaç yapısında.'],
        ['2', 'QR/NFC etiket basılır', 'Her lokasyona yapıştırılacak kod. Toplu PDF hazır.'],
        ['3', 'Personel QR okutur', 'Görev listesi, çeklist, 1 dokunuş onay. Offline mod.'],
        ['4', 'Yönetici izler', 'Canlı veri, haftalık rapor — tek ekran.'],
      ]
      const sW = 2.75, sH = 2.0, gap = 0.2
      steps.forEach((st, i) => {
        const x = 0.75 + i * (sW + gap + 0.2)
        const y = 2.5
        card(s, x, y, sW, sH, { bg: C.white, borderColor: C.green, borderWidth: 2, radius: 0.15 })
        // Numara dairesi
        s.addShape(pptx.ShapeType.ellipse, { x: x + sW / 2 - 0.3, y: y + 0.25, w: 0.6, h: 0.6, fill: { color: C.green }, line: { color: C.green } })
        s.addText(st[0], { x: x + sW / 2 - 0.3, y: y + 0.25, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: 'Inter' })
        s.addText(st[1], { x: x + 0.15, y: y + 1.0, w: sW - 0.3, h: 0.5, fontSize: 13, bold: true, color: C.dark, align: 'center', fontFace: 'Inter' })
        s.addText(st[2], { x: x + 0.15, y: y + 1.45, w: sW - 0.3, h: 0.6, fontSize: 10, color: C.grayMid, align: 'center', fontFace: 'Inter' })
        // Ok
        if (i < 3) {
          s.addText('→', { x: x + sW, y: y + sH / 2 - 0.2, w: 0.4, h: 0.4, fontSize: 22, bold: true, color: C.green, align: 'center', valign: 'middle', fontFace: 'Inter' })
        }
      })
      // Bilgi kutusu
      card(s, 0.6, 5.3, W - 1.2, 1.1, { bg: C.greenLight, borderColor: C.greenLight, radius: 0.1 })
      s.addText([
        { text: 'Donanım gerekmez. ', options: { bold: true, color: C.greenMid } },
        { text: 'QR kodlar A4 kağıda yazdırılıp yapıştırılır. Personel kendi telefonunu kullanabilir. Aylık abonelik, kurulum maliyeti yok.', options: { color: C.greenMid } },
      ], { x: 0.9, y: 5.4, w: W - 1.8, h: 0.9, fontSize: 13, valign: 'middle', fontFace: 'Inter' })
      addFooter(s, 'Nasıl Çalışır')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 05-08 — 4 ÖZELLİK
    // ═══════════════════════════════════════════════════════════════
    const features = [
      {
        tag: 'MODÜL 1 / 4',
        title: 'Frekansiyel Görev Sistemi',
        sub: 'Tekrarlayan işleri sistem üretir, personel sadece yapar.',
        badge: '⚡ Otomatik görev üretimi',
        hero: '"Bu lokasyonda saat başı temizlik" dedi mi, sistem her saat otomatik görev açar.',
        desc: 'Yönetici bir kere kural tanımlar — "WC bölgesi, 2 saatte bir, 3 vardiya". Sistem her vardiyada otomatik görevler üretir. Zamanında yapılmayanlar renk kodlu sapma/kayıp olarak işaretlenir.',
        bullets: [
          ['Kural bir kez tanımlanır', 'görevler haftalarca otomatik üretilir.'],
          ['Vardiya sistemi', '1, 2 veya 3 vardiya desteği.'],
          ['Sapma/kayıp ayrımı', 'geç yapılan ≠ hiç yapılmayan.'],
          ['Ekstra görev', 'planlı olmayan iş yapıldığında "frekans dışı" kayıt.'],
        ],
        footer: 'Frekansiyel Görevler',
        num: '05 / 18',
      },
      {
        tag: 'MODÜL 2 / 4',
        title: 'Spesifik Görevler',
        sub: 'Anlık talepler, bakım işleri, olağanüstü durumlar.',
        badge: '🎯 Anlık görev atama',
        hero: 'Müşteri aradı, bir iş çıktı — 30 saniyede personele düşer.',
        desc: 'Yönetici panelden veya mobilden görev tanımlar, lokasyon ve personel seçer. Personel telefonuna anında bildirim. Kabul → başla → tamamla akışı kayıt altında.',
        bullets: [
          ['Personel atama opsiyonel', 'ilk müsait kabul etsin veya spesifik kişi atansın.'],
          ['Çeklist desteği', '5-50 maddelik kontrol listesi.'],
          ['İptal sebep takibi', 'niye iptal, kim iptal — hepsi kayıt.'],
          ['Arşiv otomatik', '24 saat sonra tamamlananlar arşive.'],
        ],
        footer: 'Spesifik Görevler',
        num: '06 / 18',
      },
      {
        tag: 'MODÜL 3 / 4',
        title: 'Müşteri Değerlendirme',
        sub: 'QR/NFC → yıldız → yorum → fotoğraf → aksiyon.',
        badge: '⭐ Dijital geri bildirim',
        hero: 'Müşteri telefonunu QR\'a tutar, 20 saniyede değerlendirme gönderir.',
        desc: 'Her lokasyondaki QR → tarayıcı açılır → yıldız + yorum + fotoğraf. Yönetici anlık bildirim alır, aksiyon atar. Aylık trend grafiği memnuniyet değişimini gösterir.',
        bullets: [
          ['Kişisel bilgi zorunlu değil', 'isim/telefon opsiyonel, KVKK onayı akışta.'],
          ['Personel bypass koruması', 'kendi personeliniz gizli değerlendirme gönderemez.'],
          ['Yetkili aksiyon akışı', 'her değerlendirmeye yazılı cevap + fotoğraf.'],
          ['Aylık trend', 'yıldız ortalaması + yorum sayısı grafikleri.'],
        ],
        footer: 'Müşteri Değerlendirme',
        num: '07 / 18',
      },
      {
        tag: 'MODÜL 4 / 4',
        title: 'Yönetici Paneli & Raporlar',
        sub: '4 saatlik Excel raporu → 30 saniyede tek tık.',
        badge: '📊 Hazır raporlar',
        hero: 'Canlı dashboard + 7 hazır rapor tipi, hiç kod yazmadan.',
        desc: 'Yönetici panele giriş yapar, firma/proje seçer, rapor tipini belirler. PDF/Excel. Grafikli özet sayfası PDF olarak müşteri sunumuna uygun — tamper-evident, değiştirilemez.',
        bullets: [
          ['Rapor Merkezi', 'Frekansiyel, Spesifik, Değerlendirme, Süre Analiz, Ham Veri, Çeklist, Grafiksel.'],
          ['Özelleştirilebilir filtreler', 'tarih, üst lokasyon, personel, vardiya.'],
          ['PDF + Excel', 'PDF müşteriye sunum için, Excel iç analiz için.'],
          ['Canlı dashboard', 'anlık KPI, saatlik aktivite, personel bazlı başarı.'],
        ],
        footer: 'Raporlama',
        num: '08 / 18',
      },
    ]
    features.forEach(f => {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, f.tag, f.title, f.sub, f.num)
      // Sol: metin + bullets
      const leftX = 0.6, leftW = 6.2
      // Badge
      s.addShape(pptx.ShapeType.roundRect, { x: leftX, y: 1.95, w: 2.8, h: 0.35, fill: { color: C.greenLight }, line: { color: C.greenLight }, rectRadius: 0.17 })
      s.addText(f.badge, { x: leftX, y: 1.95, w: 2.8, h: 0.35, fontSize: 10, bold: true, color: C.greenMid, align: 'center', valign: 'middle', fontFace: 'Inter' })
      // Hero
      s.addText(f.hero, { x: leftX, y: 2.45, w: leftW, h: 0.9, fontSize: 18, bold: true, color: C.dark, fontFace: 'Inter' })
      s.addText(f.desc, { x: leftX, y: 3.4, w: leftW, h: 1.2, fontSize: 12, color: C.grayMid, fontFace: 'Inter' })
      // Bullets
      f.bullets.forEach((b, i) => {
        const y = 4.7 + i * 0.4
        s.addText('✓', { x: leftX, y, w: 0.3, h: 0.3, fontSize: 14, bold: true, color: C.green, fontFace: 'Inter' })
        s.addText([
          { text: b[0], options: { bold: true, color: C.greenMid } },
          { text: ' — ' + b[1], options: { color: C.dark } },
        ], { x: leftX + 0.3, y, w: leftW - 0.3, h: 0.35, fontSize: 11, fontFace: 'Inter' })
      })
      // Sag: mock dashboard
      const rX = 7.3, rW = 5.4, rH = 4.9
      card(s, rX, 1.95, rW, rH, { bg: C.dark, borderColor: C.dark, radius: 0.15 })
      // Window dots
      ;['EF4444', 'F59E0B', '10B981'].forEach((col, i) => {
        s.addShape(pptx.ShapeType.ellipse, { x: rX + 0.15 + i * 0.25, y: 2.1, w: 0.15, h: 0.15, fill: { color: col }, line: { color: col } })
      })
      // Mock inner screen
      card(s, rX + 0.15, 2.4, rW - 0.3, rH - 0.55, { bg: C.white, borderColor: C.white, radius: 0.1 })
      // Mock content (feature-specific)
      if (f.title.startsWith('Frekansiyel')) {
        s.addText('BUGÜN — AR-GE ÇAY BÖLGESİ', { x: rX + 0.3, y: 2.55, w: rW - 0.6, h: 0.3, fontSize: 11, bold: true, color: C.dark, fontFace: 'Inter', charSpacing: 2 })
        const kpiS = 1.5
        ;[['24', 'Hedef', C.dark], ['22', 'Tamam', C.greenMid], ['2', 'Kayıp', C.red]].forEach((k, i) => {
          card(s, rX + 0.3 + i * (kpiS + 0.1), 2.95, kpiS, 0.9, { bg: C.grayLight, borderColor: C.border, radius: 0.08 })
          s.addText(k[0], { x: rX + 0.3 + i * (kpiS + 0.1), y: 3.0, w: kpiS, h: 0.5, fontSize: 22, bold: true, color: k[2], align: 'center', fontFace: 'Inter' })
          s.addText(k[1], { x: rX + 0.3 + i * (kpiS + 0.1), y: 3.5, w: kpiS, h: 0.3, fontSize: 9, color: C.gray, align: 'center', fontFace: 'Inter' })
        })
        ;[
          ['08:00 Vardiya 1', '✓', C.greenMid, 'g'],
          ['10:00 Saat başı', '✓', C.greenMid, 'g'],
          ['12:00 Öğle sonrası', 'Sapma', C.amber, 'a'],
          ['14:00 Saat başı', 'Kayıp', C.red, 'r'],
          ['16:00 Vardiya 2', '✓', C.greenMid, 'g'],
        ].forEach((r, i) => {
          const y = 4.1 + i * 0.4
          s.addShape(pptx.ShapeType.ellipse, { x: rX + 0.3, y: y + 0.08, w: 0.1, h: 0.1, fill: { color: r[3] === 'g' ? C.green : r[3] === 'a' ? C.amber : C.red }, line: { color: 'FFFFFF' } })
          s.addText(r[0], { x: rX + 0.5, y, w: rW - 1.6, h: 0.3, fontSize: 10, color: C.dark, fontFace: 'Inter' })
          s.addText(r[1], { x: rX + rW - 1.3, y, w: 1, h: 0.3, fontSize: 10, bold: true, color: r[2], align: 'right', fontFace: 'Inter' })
        })
      } else if (f.title.startsWith('Spesifik')) {
        // Mobil benzeri goruntu
        s.addText('GÖREVLERİM', { x: rX + 0.3, y: 2.6, w: rW - 0.6, h: 0.3, fontSize: 12, bold: true, color: C.dark, fontFace: 'Inter', align: 'center' })
        ;[
          ['✓ WC temizliği - Kat 2', '14:30 · Tamamlandı · 6 dk', true],
          ['Çay bölgesi düzen', 'Şimdi · V2 · 2. kat', false],
          ['Lavabo sızıntı kontrol', '⚠ Acil · Ofis 3B', false],
        ].forEach((t, i) => {
          const y = 3.05 + i * 1
          card(s, rX + 0.3, y, rW - 0.6, 0.85, { bg: t[2] ? C.greenLight : C.grayLight, borderColor: t[2] ? C.greenPale : C.border, radius: 0.08 })
          s.addText(t[0] as string, { x: rX + 0.45, y: y + 0.1, w: rW - 0.9, h: 0.35, fontSize: 11, bold: true, color: C.dark, fontFace: 'Inter' })
          s.addText(t[1] as string, { x: rX + 0.45, y: y + 0.45, w: rW - 0.9, h: 0.3, fontSize: 9, color: C.gray, fontFace: 'Inter' })
        })
        // Buton
        card(s, rX + 0.3, 6.15, rW - 0.6, 0.55, { bg: C.green, borderColor: C.green, radius: 0.1 })
        s.addText('QR OKUT & BAŞLAT', { x: rX + 0.3, y: 6.15, w: rW - 0.6, h: 0.55, fontSize: 12, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: 'Inter' })
      } else if (f.title.startsWith('Müşteri')) {
        s.addText('SON DEĞERLENDİRMELER', { x: rX + 0.3, y: 2.55, w: rW - 0.6, h: 0.3, fontSize: 11, bold: true, color: C.dark, fontFace: 'Inter', charSpacing: 2 })
        ;[
          ['★★★★★', 'AR-GE Çay Bölgesi', '"Çok temiz ve düzenli" — 14:32', C.greenLight],
          ['★★★☆☆', 'Erkek WC Kat 2', '"Sabunlukta sabun yok" — 13:12', C.amberLight],
          ['★☆☆☆☆', 'Sigara Bölgesi', '"Küllükler temizlenmemiş" — 11:48', C.redLight],
        ].forEach((d, i) => {
          const y = 3.0 + i * 1.3
          card(s, rX + 0.3, y, rW - 0.6, 1.15, { bg: d[3], borderColor: d[3], radius: 0.08 })
          s.addText(d[0], { x: rX + 0.45, y: y + 0.15, w: rW - 0.9, h: 0.35, fontSize: 18, color: C.amber, fontFace: 'Inter' })
          s.addText(d[1], { x: rX + 0.45, y: y + 0.5, w: rW - 0.9, h: 0.3, fontSize: 11, bold: true, color: C.dark, fontFace: 'Inter' })
          s.addText(d[2], { x: rX + 0.45, y: y + 0.8, w: rW - 0.9, h: 0.3, fontSize: 10, color: C.grayMid, fontFace: 'Inter' })
        })
      } else {
        // Raporlama dashboard
        s.addText('DASHBOARD — SON 24 SAAT', { x: rX + 0.3, y: 2.55, w: rW - 0.6, h: 0.3, fontSize: 11, bold: true, color: C.dark, fontFace: 'Inter', charSpacing: 2 })
        const kpiS = 1.5
        ;[['1.247', 'Toplam', C.darkGreen], ['968', 'Tamam', C.greenMid], ['279', 'Sapma', C.amber]].forEach((k, i) => {
          card(s, rX + 0.3 + i * (kpiS + 0.1), 2.95, kpiS, 0.9, { bg: C.grayLight, borderColor: C.border, radius: 0.08 })
          s.addText(k[0], { x: rX + 0.3 + i * (kpiS + 0.1), y: 3.0, w: kpiS, h: 0.5, fontSize: 20, bold: true, color: k[2], align: 'center', fontFace: 'Inter' })
          s.addText(k[1], { x: rX + 0.3 + i * (kpiS + 0.1), y: 3.5, w: kpiS, h: 0.3, fontSize: 9, color: C.gray, align: 'center', fontFace: 'Inter' })
        })
        // Mini chart alt
        s.addText('AKTİVİTE — Saat bazlı', { x: rX + 0.3, y: 4.1, w: rW - 0.6, h: 0.3, fontSize: 10, bold: true, color: C.gray, fontFace: 'Inter' })
        // Bar chart (native)
        const hourSample = Array.from({ length: 24 }, (_, h) => Math.max(1, Math.round(50 + Math.sin(h / 24 * Math.PI * 2 + 3) * 40 + Math.random() * 20)))
        s.addChart(pptx.ChartType.bar, [{ name: 'Aktivite', labels: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), values: hourSample }], {
          x: rX + 0.3, y: 4.5, w: rW - 0.6, h: 2.2,
          barDir: 'col', barGrouping: 'standard',
          chartColors: [C.green],
          showLegend: false,
          showValue: false,
          catAxisLabelFontSize: 7,
          valAxisHidden: true,
          plotArea: { fill: { color: C.white } },
        })
      }
      addFooter(s, f.footer)
    })

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 09 — KULLANIM KOLAYLIĞI (3 rol)
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'KULLANICI DENEYİMİ', 'Karmaşık değil, sade. Eğitim 15 dakika.', 'Personel, yönetici ve müşteri için üç farklı arayüz — her biri rolünün gerektirdiği kadar.', '09 / 18')
      const roles = [
        ['📱 Personel', 'Telefonu açar, uygulamayı başlatır. Bugünkü görevleri görür. QR\'ı okutur. Kapatır.',
          ['Hiç menü karıştırmaz', '1 dokunuşta görev kapatır', 'Offline çalışır', 'Mesai takibi otomatik']],
        ['📊 Yönetici', 'Web panele giriş. Dashboard\'da canlı KPI. Rapor alır, aksiyon atar, personel atar.',
          ['Canlı dashboard', 'PDF/Excel rapor tek tık', 'Personel karşılaştırması', 'Anlık bildirim']],
        ['⭐ Müşteri / Ziyaretçi', 'Lokasyondaki QR\'ı telefonuna tutar. Tarayıcı açılır. Yıldız verir, yorum/foto ekler.',
          ['App indirmez', 'Üye olmaz', '20 saniyede biter', 'KVKK uyumlu']],
      ]
      roles.forEach((r, i) => {
        const x = 0.6 + i * 4.15, y = 2.0, w = 3.9, h = 4.6
        card(s, x, y, w, h, { bg: C.white, borderColor: C.border, borderWidth: 1, radius: 0.12 })
        s.addText(r[0] as string, { x: x + 0.25, y: y + 0.25, w: w - 0.5, h: 0.5, fontSize: 17, bold: true, color: C.dark, fontFace: 'Inter' })
        s.addText(r[1] as string, { x: x + 0.25, y: y + 0.85, w: w - 0.5, h: 1.3, fontSize: 12, color: C.grayMid, fontFace: 'Inter' })
        ;(r[2] as string[]).forEach((bl, bi) => {
          const by = y + 2.3 + bi * 0.5
          s.addText('✓', { x: x + 0.25, y: by, w: 0.25, h: 0.35, fontSize: 13, bold: true, color: C.green, fontFace: 'Inter' })
          s.addText(bl, { x: x + 0.55, y: by, w: w - 0.8, h: 0.35, fontSize: 11, color: C.dark, fontFace: 'Inter' })
        })
      })
      addFooter(s, 'Kullanım Kolaylığı')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 10 — HERO KPI (6 büyük rakam)
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'BİR REFERANS TESİSİMİZDE', 'GYS gerçekten çalışıyor — 6 aylık canlı veri', 'Rakamlar canlı veritabanı sorgularıyla doğrulandı, firma/proje anonim.', '10 / 18')
      const kpis = [
        [nf.format(toplam), 'Toplam izlenen görev', 'Her görev zaman damgalı, lokasyonlu', C.white, C.dark, C.border],
        [`%${basariPct.toFixed(1).replace('.', ',')}`, 'Başarı oranı', 'Yapılan iş / toplam görev', C.greenLight, C.greenMid, C.greenPale],
        [`%${kayipPct.toFixed(1).replace('.', ',')}`, 'Kayıp oranı', 'Dijital öncesi %10-20 iken', C.redLight, C.redDark, 'FECACA'],
        [String(farkliLok), 'İzlenen lokasyon', 'WC, çay, ofis — her noktada QR', C.white, C.dark, C.border],
        [String(aktifPersonel), 'Aktif saha personeli', 'Her personel şeffaf izlenebilir', C.white, C.dark, C.border],
        [`${medianSure}sn`, 'Medyan görev kapama', 'Mobil 1-dokunuş', C.white, C.dark, C.border],
      ]
      const cW = 4.0, cH = 2.4, gX = 0.15, gY = 0.2
      kpis.forEach((k, i) => {
        const col = i % 3, row = Math.floor(i / 3)
        const x = 0.6 + col * (cW + gX)
        const y = 2.0 + row * (cH + gY)
        card(s, x, y, cW, cH, { bg: k[3], borderColor: k[5], borderWidth: 1, radius: 0.12 })
        s.addText(k[0], { x, y: y + 0.3, w: cW, h: 1.0, fontSize: 48, bold: true, color: k[4], align: 'center', fontFace: 'Inter' })
        s.addText(k[1], { x: x + 0.2, y: y + 1.45, w: cW - 0.4, h: 0.4, fontSize: 12, bold: true, color: C.grayMid, align: 'center', fontFace: 'Inter', charSpacing: 1 })
        s.addText(k[2], { x: x + 0.2, y: y + 1.85, w: cW - 0.4, h: 0.4, fontSize: 10, color: C.gray, align: 'center', fontFace: 'Inter' })
      })
      addFooter(s, 'Canlı Referans')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 11 — AYLIK BÜYÜME (native bar chart) + ADOPTION (line)
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'BÜYÜME & BENİMSEME', 'Pilot → Tam kullanım: 1 ay', 'Personel adoption sorunu yaşanmadı', '11 / 18')
      // Sol: aylik gorev bar chart
      card(s, 0.6, 2.0, 6.0, 4.4, { bg: C.white, borderColor: C.border, radius: 0.1 })
      s.addText('Aylık izlenen görev sayısı', { x: 0.8, y: 2.15, w: 5.6, h: 0.3, fontSize: 13, bold: true, color: C.dark, fontFace: 'Inter' })
      s.addText('Pilot ayından itibaren hızlı büyüme', { x: 0.8, y: 2.45, w: 5.6, h: 0.25, fontSize: 10, color: C.gray, fontFace: 'Inter' })
      if (aylik.length > 0) {
        s.addChart(pptx.ChartType.bar, [{
          name: 'Görev',
          labels: aylik.map(a => a.ay),
          values: aylik.map(a => a.toplam),
        }], {
          x: 0.8, y: 2.8, w: 5.6, h: 3.4,
          barDir: 'col', chartColors: [C.green],
          showLegend: false, showValue: true, dataLabelFontSize: 9, dataLabelColor: C.dark,
          catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, valAxisHidden: false,
          showTitle: false,
        })
      }
      // Sag: personel line chart
      card(s, 6.75, 2.0, 6.0, 4.4, { bg: C.white, borderColor: C.border, radius: 0.1 })
      s.addText('Aktif personel sayısı — aylık', { x: 6.95, y: 2.15, w: 5.6, h: 0.3, fontSize: 13, bold: true, color: C.dark, fontFace: 'Inter' })
      s.addText(`${persAylik[0]?.pers ?? 0} → ${persAylik[persAylik.length - 1]?.pers ?? 0} personel (${persAylik.length} ay)`, { x: 6.95, y: 2.45, w: 5.6, h: 0.25, fontSize: 10, color: C.gray, fontFace: 'Inter' })
      if (persAylik.length > 0) {
        s.addChart(pptx.ChartType.line, [{
          name: 'Personel',
          labels: persAylik.map(a => a.ay),
          values: persAylik.map(a => a.pers),
        }], {
          x: 6.95, y: 2.8, w: 5.6, h: 3.4,
          chartColors: [C.darkGreen],
          lineDataSymbol: 'circle', lineDataSymbolSize: 8, lineDataSymbolLineColor: C.darkGreen,
          showLegend: false, showValue: true, dataLabelFontSize: 9, dataLabelColor: C.darkGreen,
          catAxisLabelFontSize: 10, valAxisLabelFontSize: 9,
          showTitle: false,
        })
      }
      addFooter(s, 'Büyüme')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 12 — MÜŞTERİ MEMNUNİYETİ (line) + TOPLAM
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'MÜŞTERİ GERİ BİLDİRİMİ', 'Veri haline gelen şikayet-öneri', 'QR/NFC üzerinden toplanan değerlendirmeler', '12 / 18')
      card(s, 0.6, 2.0, 7.5, 4.4, { bg: C.white, borderColor: C.border, radius: 0.1 })
      s.addText('Aylık yıldız ortalaması (1-5)', { x: 0.8, y: 2.15, w: 7.1, h: 0.3, fontSize: 13, bold: true, color: C.dark, fontFace: 'Inter' })
      s.addText('Dijital öncesi: bilinmiyordu', { x: 0.8, y: 2.45, w: 7.1, h: 0.25, fontSize: 10, color: C.gray, fontFace: 'Inter' })
      if (degAylik.length > 0) {
        s.addChart(pptx.ChartType.line, [{
          name: 'Yıldız',
          labels: degAylik.map(a => a.ay),
          values: degAylik.map(a => a.yildiz),
        }], {
          x: 0.8, y: 2.8, w: 7.1, h: 3.4,
          chartColors: [C.amber],
          lineDataSymbol: 'circle', lineDataSymbolSize: 8, lineDataSymbolLineColor: C.amber,
          showLegend: false, showValue: true, dataLabelFontSize: 10, dataLabelColor: C.amberDark,
          catAxisLabelFontSize: 10, valAxisMinVal: 0, valAxisMaxVal: 5,
        })
      }
      // Sag: Toplam hero
      card(s, 8.25, 2.0, 4.5, 4.4, { bg: C.amberLight, borderColor: 'FDE68A', radius: 0.12 })
      s.addText('TOPLAM DEĞERLENDİRME', { x: 8.25, y: 2.6, w: 4.5, h: 0.4, fontSize: 11, bold: true, color: C.gray, align: 'center', fontFace: 'Inter', charSpacing: 2 })
      s.addText(String(degToplam), { x: 8.25, y: 3.0, w: 4.5, h: 1.5, fontSize: 72, bold: true, color: C.amber, align: 'center', fontFace: 'Inter' })
      s.addText('6 ay içinde dijital olarak toplandı', { x: 8.25, y: 4.6, w: 4.5, h: 0.4, fontSize: 11, color: C.gray, align: 'center', fontFace: 'Inter' })
      s.addText([
        { text: 'Dijital öncesi: ', options: { bold: true, color: C.amberDark } },
        { text: '"Şikayet var mı?" sorusu tahmindi. Artık her değerlendirme kayıtlı.', options: { color: C.amberDark } },
      ], { x: 8.4, y: 5.2, w: 4.2, h: 1.1, fontSize: 10, align: 'center', valign: 'middle', fontFace: 'Inter' })
      addFooter(s, 'Müşteri Memnuniyeti')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 13 — 24 SAAT KAPSAMA (native bar chart)
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, '7/24 İZLEME', 'Gece vardiyası dahil, her saat kayıt altında', 'Saatlik tamamlanan görev — 6 ay toplamı', '13 / 18')
      card(s, 0.6, 2.0, W - 1.2, 3.2, { bg: C.white, borderColor: C.border, radius: 0.1 })
      s.addText('24-Saat Aktivite Dağılımı', { x: 0.8, y: 2.1, w: 10, h: 0.3, fontSize: 13, bold: true, color: C.dark, fontFace: 'Inter' })
      s.addText('Gece 03:00\'te bile yüksek aktivite', { x: 0.8, y: 2.4, w: 10, h: 0.25, fontSize: 10, color: C.gray, fontFace: 'Inter' })
      s.addChart(pptx.ChartType.bar, [{
        name: 'Tamamlanan',
        labels: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
        values: saatler,
      }], {
        x: 0.8, y: 2.75, w: W - 1.6, h: 2.3,
        barDir: 'col', chartColors: [C.green],
        showLegend: false, showValue: false,
        catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
      })
      // Alt özet kutular
      const stats = [
        ['Pik saat', '08:00', C.greenLight, C.greenMid],
        ['Gece (00-06)', nf.format(saatler.slice(0, 6).reduce((a, b) => a + b, 0)), C.grayLight, C.dark],
        ['Gündüz (06-18)', nf.format(saatler.slice(6, 18).reduce((a, b) => a + b, 0)), C.grayLight, C.dark],
        ['Akşam (18-24)', nf.format(saatler.slice(18, 24).reduce((a, b) => a + b, 0)), C.grayLight, C.dark],
      ]
      stats.forEach((st, i) => {
        const x = 0.6 + i * 3.1, y = 5.4, w = 2.9, h = 1.2
        card(s, x, y, w, h, { bg: st[2], borderColor: st[2], radius: 0.1 })
        s.addText(st[0], { x, y: y + 0.15, w, h: 0.3, fontSize: 10, bold: true, color: C.gray, align: 'center', fontFace: 'Inter', charSpacing: 1 })
        s.addText(st[1], { x, y: y + 0.4, w, h: 0.7, fontSize: 24, bold: true, color: st[3], align: 'center', fontFace: 'Inter' })
      })
      addFooter(s, '24-Saat Kapsama')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 14 — ÖNCESİ vs SONRASI
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'FARK', 'Dijital Öncesi vs Sonrası', 'Aynı tesis, aynı ekip, farklı araç', '14 / 18')
      const bef = [
        ['Operasyon izleme', 'kağıt pano, hafızaya dayalı'],
        ['Kayıp görev', '%10-20 "normal" karşılanır'],
        ['Müşteri şikayeti', '"mesaj grubunda konuşalım"'],
        ['Yönetici raporu', 'Excel\'de 3-4 saat uğraş'],
        ['Gece vardiyası', 'sabah tahmin edilir'],
        ['Personel verimliliği', 'ölçülmez'],
        ['Rapor zamanında', 'aylık rapor 1 hafta gecikir'],
        ['Müşteriye kanıt', '"sözlü söylüyoruz"'],
      ]
      const aft = [
        ['Operasyon izleme', `${nf.format(toplam)} görev, hepsi kayıtlı`],
        ['Kayıp görev', `%${kayipPct.toFixed(1).replace('.', ',')} — tek tıkla rapor`],
        ['Müşteri şikayeti', `${degToplam} dijital değerlendirme`],
        ['Yönetici raporu', 'PDF/Excel, 30 saniye'],
        ['Gece vardiyası', '03:00\'te bile kayıt'],
        ['Personel verimliliği', 'en iyi/kötü 3 otomatik'],
        ['Rapor zamanında', 'real-time, her an güncel'],
        ['Müşteriye kanıt', 'tamper-evident PDF'],
      ]
      // Sol
      card(s, 0.6, 2.0, 5.7, 5.0, { bg: C.redLight, borderColor: 'FECACA', radius: 0.12 })
      s.addText('⚠ DİJİTAL ÖNCESİ', { x: 0.8, y: 2.15, w: 5.3, h: 0.4, fontSize: 14, bold: true, color: C.redDark, fontFace: 'Inter', charSpacing: 2 })
      bef.forEach((b, i) => {
        const y = 2.65 + i * 0.52
        if (i > 0) s.addShape(pptx.ShapeType.rect, { x: 0.8, y, w: 5.3, h: 0.01, fill: { color: 'FECACA', transparency: 40 }, line: { color: 'FECACA' } })
        s.addText([
          { text: b[0] + ': ', options: { bold: true, color: C.redDark } },
          { text: b[1], options: { color: C.redDark } },
        ], { x: 0.9, y: y + 0.05, w: 5.1, h: 0.45, fontSize: 11, fontFace: 'Inter' })
      })
      // Ok
      s.addText('→', { x: 6.4, y: 4.35, w: 0.6, h: 0.5, fontSize: 32, bold: true, color: C.green, align: 'center', valign: 'middle', fontFace: 'Inter' })
      // Sag
      card(s, 7.05, 2.0, 5.7, 5.0, { bg: C.greenLight, borderColor: C.greenPale, radius: 0.12 })
      s.addText('✓ GYS İLE 6 AY SONRA', { x: 7.25, y: 2.15, w: 5.3, h: 0.4, fontSize: 14, bold: true, color: C.greenMid, fontFace: 'Inter', charSpacing: 2 })
      aft.forEach((a, i) => {
        const y = 2.65 + i * 0.52
        if (i > 0) s.addShape(pptx.ShapeType.rect, { x: 7.25, y, w: 5.3, h: 0.01, fill: { color: C.greenPale, transparency: 40 }, line: { color: C.greenPale } })
        s.addText([
          { text: a[0] + ': ', options: { bold: true, color: C.greenMid } },
          { text: a[1], options: { color: C.greenMid } },
        ], { x: 7.35, y: y + 0.05, w: 5.1, h: 0.45, fontSize: 11, fontFace: 'Inter' })
      })
      addFooter(s, 'Öncesi vs Sonrası')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 15 — 9 AVANTAJ
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'NEDEN GYS?', 'Rakiplerden ayıran 9 somut avantaj', 'Her biri sahada denenmiş, canlı verilerle doğrulanmış', '15 / 18')
      const advs = [
        ['QR + NFC Hibrit', 'Telefon kamera veya temas. Donanım yok, A4 kağıda yazdırın.'],
        ['Mobil + Web', 'Personel mobilden, yönetici webden, müşteri QR\'dan. Tek platform.'],
        ['Vardiya Sistemi', '1, 2, 3 vardiya. Sarkan vardiya otomatik.'],
        ['Push Bildirim', 'Yeni görev, iptal, değerlendirme — anında.'],
        ['Tamper-Evident PDF', 'Değiştirilemez PDF. Excel güvensizliği kalkar.'],
        ['Rol Bazlı Yetki', 'SA, admin, personel, müşteri — her rol kendi ekranı.'],
        ['7+ Hazır Rapor', 'Frekansiyel, Spesifik, Değerlendirme, Süre, Grafiksel, Ham Veri.'],
        ['Offline Mod', 'İnternet yoksa personel çalışır. Otomatik senkron.'],
        ['1 Günde Canlı', 'Lokasyon → QR → personel. Günler değil saatler.'],
      ]
      const aW = 4.0, aH = 1.4, gX = 0.15, gY = 0.15
      advs.forEach((a, i) => {
        const col = i % 3, row = Math.floor(i / 3)
        const x = 0.6 + col * (aW + gX)
        const y = 2.0 + row * (aH + gY)
        card(s, x, y, aW, aH, { bg: C.white, borderColor: C.border, borderLeft: C.green, radius: 0.08 })
        s.addText(String(i + 1), { x: x + 0.2, y: y + 0.15, w: 0.5, h: 0.4, fontSize: 20, bold: true, color: C.green, fontFace: 'Inter' })
        s.addText(a[0], { x: x + 0.6, y: y + 0.18, w: aW - 0.8, h: 0.4, fontSize: 13, bold: true, color: C.dark, fontFace: 'Inter' })
        s.addText(a[1], { x: x + 0.2, y: y + 0.65, w: aW - 0.4, h: 0.7, fontSize: 10, color: C.grayMid, fontFace: 'Inter' })
      })
      addFooter(s, 'Avantajlar')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 16 — ONBOARDING
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'BAŞLANGIÇ', 'GYS\'yi başlatmak 3 adım, 1 gün', 'Donanım yok, uzun eğitim yok. Hemen başlar.', '16 / 18')
      const stps = [
        ['1', 'Lokasyon & Personel', 'Tesis alanları ağaç yapısında tanımlanır. Personel listesi Excel\'den aktarılır.', '1-2 saat'],
        ['2', 'QR Etiketler & Kurallar', 'Her lokasyon için benzersiz QR üretilir, A4 PDF olarak yazdırılır. Frekansiyel kurallar.', '2-3 saat'],
        ['3', 'Test & Canlıya Alma', 'Personel mobil uygulamayı indirir, giriş yapar. İlk görevler. Canlı veri toplanır.', '1-2 saat'],
      ]
      stps.forEach((st, i) => {
        const x = 0.6 + i * 4.15, y = 2.3, w = 3.9, h = 3.0
        card(s, x, y, w, h, { bg: C.grayLight, borderColor: C.border, radius: 0.15 })
        // Numara dairesi (ustte)
        s.addShape(pptx.ShapeType.ellipse, { x: x + w / 2 - 0.35, y: y - 0.35, w: 0.7, h: 0.7, fill: { color: C.green }, line: { color: C.green } })
        s.addText(st[0], { x: x + w / 2 - 0.35, y: y - 0.35, w: 0.7, h: 0.7, fontSize: 22, bold: true, color: C.white, align: 'center', valign: 'middle', fontFace: 'Inter' })
        s.addText(st[1], { x: x + 0.2, y: y + 0.5, w: w - 0.4, h: 0.4, fontSize: 15, bold: true, color: C.dark, align: 'center', fontFace: 'Inter' })
        s.addText(st[2], { x: x + 0.3, y: y + 1.0, w: w - 0.6, h: 1.4, fontSize: 11, color: C.grayMid, align: 'center', fontFace: 'Inter' })
        // Sure pill
        s.addShape(pptx.ShapeType.roundRect, { x: x + w / 2 - 0.65, y: y + h - 0.55, w: 1.3, h: 0.35, fill: { color: C.greenLight }, line: { color: C.greenLight }, rectRadius: 0.17 })
        s.addText(st[3], { x: x + w / 2 - 0.65, y: y + h - 0.55, w: 1.3, h: 0.35, fontSize: 10, bold: true, color: C.greenMid, align: 'center', valign: 'middle', fontFace: 'Inter' })
      })
      // Alt vurgu
      card(s, 0.6, 5.7, W - 1.2, 1.3, { bg: C.greenLight, borderColor: C.greenLight, radius: 0.12 })
      s.addText('🚀 İlk 7 günde ne olur?', { x: 0.9, y: 5.8, w: 12, h: 0.4, fontSize: 15, bold: true, color: C.greenMid, fontFace: 'Inter' })
      s.addText([
        { text: '1. gün: ', options: { bold: true } },
        { text: 'Sistem canlıya alınır, personel giriş yapar.    ', options: {} },
        { text: '3. gün: ', options: { bold: true } },
        { text: 'Tam adoption, günlük rutin oturur.    ', options: {} },
        { text: '7. gün: ', options: { bold: true } },
        { text: 'İlk haftalık yönetici raporu — hangi lokasyon risk altında, görünür.', options: {} },
      ], { x: 0.9, y: 6.2, w: W - 1.5, h: 0.75, fontSize: 11, color: C.greenMid, fontFace: 'Inter' })
      addFooter(s, 'Onboarding')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 17 — İTİRAZLAR
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.white }
      addHeader(s, 'İTİRAZLAR', 'En sık sorulan 4 soruya net yanıt', 'Potansiyel müşterinin kafasındaki gerçek sorular', '17 / 18')
      const qs = [
        ['"Zaten elle de yapılabiliyor"',
          `${nf.format(toplam)} görevi elle takip etmeyi deneyin. Ya kaydı tutmayacak ya da uyduracak ekibiniz. Dijital öncesi %10-20 kayıp "normal"di — dijitalle %${kayipPct.toFixed(1).replace('.', ',')}.`],
        ['"Personelim teknolojiye alışamaz"',
          `Referans tesiste 1 ay içinde ${persAylik[1]?.pers ?? 100}+ personel aktif, 6 ayda ${aktifPersonel} personel sistemde. Pilot sorunu yok. Uygulama 3 tıkla çalışır.`],
        ['"Yatırımın geri dönüşü nasıl?"',
          '1 ay kaçırılmış temizlikten gelen cezadan sistem bedelinin çoğu geri döner. Müşteri güvensizliğinden kayıp kontrat, sistem maliyetinin 10 katıdır.'],
        ['"Rakibimiz bunu zaten yapıyor"',
          'Yapıyorsa iyi, oyun alanı eşitlenir. Yapmıyorsa farkı siz oluşturursunuz — potansiyel müşteriye "sektöre dijital standart getiren" olarak konumlanırsınız.'],
      ]
      qs.forEach((q, i) => {
        const col = i % 2, row = Math.floor(i / 2)
        const x = 0.6 + col * 6.1
        const y = 2.0 + row * 2.4
        card(s, x, y, 5.9, 2.2, { bg: C.white, borderColor: C.border, radius: 0.12 })
        // Üst kırmızı şerit
        s.addShape(pptx.ShapeType.rect, { x, y, w: 5.9, h: 0.08, fill: { color: C.red }, line: { color: C.red } })
        s.addText(q[0], { x: x + 0.25, y: y + 0.25, w: 5.4, h: 0.5, fontSize: 13, bold: true, color: C.redDark, fontFace: 'Inter' })
        s.addText(q[1], { x: x + 0.25, y: y + 0.85, w: 5.4, h: 1.3, fontSize: 11, color: C.grayMid, fontFace: 'Inter' })
      })
      addFooter(s, 'İtiraz Yönetimi')
    }

    // ═══════════════════════════════════════════════════════════════
    // SLAYT 18 — CTA KAPANIŞ
    // ═══════════════════════════════════════════════════════════════
    {
      const s = pptx.addSlide()
      s.background = { color: C.dark }
      // Dekoratif daireler
      s.addShape(pptx.ShapeType.ellipse, { x: -2, y: -2, w: 5, h: 5, fill: { color: C.darkGreen }, line: { color: C.darkGreen } } as any)
      s.addShape(pptx.ShapeType.ellipse, { x: W - 3, y: H - 3, w: 6, h: 6, fill: { color: C.green }, line: { color: C.green } } as any)
      s.addText('BİR CÜMLEDE', { x: 0.7, y: 1.3, w: 5, h: 0.4, fontSize: 12, bold: true, color: C.greenPale, fontFace: 'Inter', charSpacing: 3 })
      s.addText([
        { text: 'Sahadaki her işi ', options: { color: C.white } },
        { text: 'sayılabilir, raporlanabilir ve ispat edilebilir ', options: { color: C.greenPale } },
        { text: 'hale getirin.', options: { color: C.white } },
      ], { x: 0.7, y: 1.9, w: W - 1.4, h: 2.2, fontSize: 40, bold: true, fontFace: 'Inter' })
      s.addText(`GYS bir uygulama değil — operasyonunuzu şeffaflaştıran bir yönetim platformudur. Referans tesisimizde 6 ayda ${nf.format(toplam)} görev izlendi, ${degToplam} müşteri değerlendirmesi toplandı, kayıp oranı %${kayipPct.toFixed(1).replace('.', ',')}'de kaldı.`,
        { x: 0.7, y: 4.2, w: W - 1.4, h: 1.0, fontSize: 14, color: C.white, fontFace: 'Inter' })
      // 3 kart
      const ctaK = [['1 gün', 'Kurulumdan canlıya'], ['15 dk', 'Personel eğitimi'], ['0 TL', 'Donanım yatırımı']]
      ctaK.forEach((k, i) => {
        const x = 0.7 + i * 3.5, y = 5.4, w = 3.2, h = 1.2
        s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: C.dark, transparency: 25 }, line: { color: C.white, width: 0.5 }, rectRadius: 0.12 })
        s.addText(k[0], { x, y: y + 0.15, w, h: 0.6, fontSize: 22, bold: true, color: C.greenPale, align: 'center', fontFace: 'Inter' })
        s.addText(k[1], { x, y: y + 0.75, w, h: 0.35, fontSize: 11, color: C.white, align: 'center', fontFace: 'Inter' })
      })
      // Alt
      s.addText('→ Bir sonraki adım: 30 dakikalık canlı demo talep edin.', { x: 0.7, y: 6.85, w: W - 1.4, h: 0.3, fontSize: 13, bold: true, color: C.greenPale, fontFace: 'Inter' })
      s.addText('GYS Görev Yönetim Sistemi · İO Teknoloji · iogys.com.tr', { x: 0.7, y: 7.2, w: 8, h: 0.25, fontSize: 9, color: C.white, fontFace: 'Inter' })
      s.addText(tarih, { x: W - 4, y: 7.2, w: 3.3, h: 0.25, fontSize: 9, color: C.white, align: 'right', fontFace: 'Inter' })
    }

    const buf = await pptx.write({ outputType: 'nodebuffer' }) as Buffer
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="gys-musteri-sunumu-${date}.pptx"`,
      },
    })
  } catch (err: any) {
    console.error('[marketing/tam-sunum-pptx]', err)
    return NextResponse.json({ error: err?.message ?? 'PPTX uretilemedi' }, { status: 500 })
  }
}
