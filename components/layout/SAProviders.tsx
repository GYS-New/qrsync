'use client'

import { FirmaProvider, useFirma } from '@/components/layout/FirmaContext'
import { ProjeProvider } from '@/components/projeler/ProjeContext'

function ProjeBridge({ children }: { children: React.ReactNode }) {
  const { firmaId } = useFirma()
  return <ProjeProvider firmaId={firmaId}>{children}</ProjeProvider>
}

export default function SAProviders({ children }: { children: React.ReactNode }) {
  return (
    <FirmaProvider>
      <ProjeBridge>{children}</ProjeBridge>
    </FirmaProvider>
  )
}

