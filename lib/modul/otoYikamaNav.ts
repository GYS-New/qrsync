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
      label: 'Operasyon',
      items: [
        { label: 'Araç Kayıtları',  href: '/oto-yikama/araclar',        icon: '🚗' },
        { label: 'Görev Oluştur',   href: '/oto-yikama/gorev-olustur',  icon: '➕' },
        { label: 'Günlük Tablo',    href: '/oto-yikama/gunluk',          icon: '📋' },
        { label: 'Raporlar',        href: '/oto-yikama/raporlar',        icon: '📊' },
      ],
    },
  ]
}
