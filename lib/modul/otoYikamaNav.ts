import type { NavGroup } from '@/components/layout/Sidebar'

/**
 * Oto Yıkama modülünün sidebar menüsü.
 *
 * Rol-agnostik: aynı menü tüm rollere gösterilir. Yetki kontrolü
 * sayfa seviyesinde yapılır (örn. ekleyebilir/duzenleyebilir vs).
 * Erişim hakkı zaten `lib/modul/serverYetki.ts` katmanında kontrol edilmiş.
 */
export function getOtoYikamaNav(): NavGroup[] {
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
        { label: 'Araç Kayıtları',  href: '/oto-yikama/araclar',         icon: '🚗' },
        { label: 'Görev Oluştur',   href: '/oto-yikama/gorev-olustur',   icon: '➕' },
        { label: 'Görev Kayıtları', href: '/oto-yikama/gorev-kayitlari', icon: '🗂️' },
        { label: 'Arşiv',           href: '/oto-yikama/arsiv',           icon: '📦' },
        { label: 'Raporlar',        href: '/oto-yikama/raporlar',         icon: '📊' },
      ],
    },
  ]
}
