import type { NavGroup } from '@/components/layout/Sidebar'

/**
 * Oto Yıkama modülünün sidebar menüsü.
 *
 * Rol-agnostik: aynı menü tüm rollere gösterilir. Yetki kontrolü
 * sayfa seviyesinde yapılır (örn. ekleyebilir/duzenleyebilir vs).
 * Erişim hakkı zaten `lib/modul/serverYetki.ts` katmanında kontrol edilmiş.
 *
 * İstisna: 'Onay Bekleyenler' menüsü sadece SA veya firmanın atanmış
 * oto_yikama_onay_yetkilisi'ne gösterilir.
 */
export interface OtoYikamaNavOpts {
  isSA?: boolean
  isAmir?: boolean  // firmalar.oto_yikama_onay_yetkilisi_id === me.id
  onayBekleyenSayisi?: number  // sidebar badge icin
}

export function getOtoYikamaNav(opts: OtoYikamaNavOpts = {}): NavGroup[] {
  const gorebilirOnay = !!(opts.isSA || opts.isAmir)
  const onaySayisi = opts.onayBekleyenSayisi ?? 0
  return [
    {
      label: 'Ana Menü',
      items: [
        { label: 'Gösterge Paneli', href: '/oto-yikama/dashboard', icon: '🚿' },
      ],
    },
    {
      label: 'Yönetim',
      items: [
        { label: 'Yıkama İstasyonları', href: '/oto-yikama/lokasyonlar', icon: '📍' },
        { label: 'Kullanıcılar',    href: '/oto-yikama/kullanicilar', icon: '👥' },
      ],
    },
    {
      label: 'Operasyon',
      items: [
        { label: 'Canlı İşlemler',  href: '/oto-yikama/gunluk',          icon: '📋', live: true },
        ...(gorebilirOnay
          ? [{
              label: 'Onay Bekleyenler',
              href: '/oto-yikama/onay-bekleyen',
              icon: '✋',
              badge: onaySayisi > 0 ? { value: onaySayisi, tone: 'red' as const } : undefined,
            }]
          : []
        ),
        { label: 'Yıkama Takvimi',  href: '/oto-yikama/takvim',          icon: '📅' },
        { label: 'Araç Kayıtları',  href: '/oto-yikama/araclar',         icon: '🚗' },
        { label: 'Ekstra Görev',    href: '/oto-yikama/gorev-olustur',   icon: '➕' },
        { label: 'Görev Kayıtları', href: '/oto-yikama/gorev-kayitlari', icon: '🗂️' },
        { label: 'Arşiv',           href: '/oto-yikama/arsiv',           icon: '📦' },
        { label: 'Raporlar',        href: '/oto-yikama/raporlar',         icon: '📊' },
        { label: 'Rapor Gönderimi', href: '/oto-yikama/rapor-gonderimi', icon: '📧' },
      ],
    },
  ]
}
