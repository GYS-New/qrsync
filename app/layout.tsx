import type { Metadata } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { RouteLoadingOverlay, RouteLoadingProvider } from '@/components/ui/RouteLoadingProvider'
import Heartbeat from '@/components/ui/Heartbeat'
import { createAdminClient } from '@/lib/supabase/server'

export async function generateMetadata(): Promise<Metadata> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('sistem_konfigurasyon').select('uygulama_ismi').limit(1).single()
    const isim = data?.uygulama_ismi ?? 'Syncora'
    return {
      title: { default: isim, template: `%s · ${isim}` },
      description: 'QR/NFC Tabanlı Görev Yönetim Sistemi',
      icons: { icon: '/favicon.svg' },
    }
  } catch {
    return {
      title: 'Syncora',
      description: 'QR/NFC Tabanlı Görev Yönetim Sistemi',
      icons: { icon: '/favicon.svg' },
    }
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <ToastProvider>
          <RouteLoadingProvider>
            <ConfirmProvider>
              {children}
              <RouteLoadingOverlay />
              <Heartbeat />
            </ConfirmProvider>
          </RouteLoadingProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
