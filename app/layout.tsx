import type { Metadata } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { RouteLoadingOverlay, RouteLoadingProvider } from '@/components/ui/RouteLoadingProvider'
import Heartbeat from '@/components/ui/Heartbeat'

export const metadata: Metadata = {
  title: 'QR Sync',
  description: 'QR Kod Tabanlı Görev Yönetim Sistemi',
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
