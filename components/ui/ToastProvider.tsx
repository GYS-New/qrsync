'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  type: ToastType
  title?: string
  message: string
}

type Ctx = {
  toast: (t: Omit<ToastItem, 'id'>) => void
}

const ToastCtx = createContext<Ctx | null>(null)

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = uid()
    const item: ToastItem = { id, ...t }
    setItems(prev => [item, ...prev].slice(0, 4))
    window.setTimeout(() => {
      setItems(prev => prev.filter(x => x.id !== id))
    }, 4200)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div style={{ position:'fixed', top:14, left:0, right:0, zIndex:9999, display:'flex', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ width:'min(720px, calc(100vw - 24px))', display:'flex', flexDirection:'column', gap:10 }}>
          {items.map(it => (
            <div
              key={it.id}
              style={{
                pointerEvents:'auto',
                borderRadius:10,
                border:'1px solid #e5e7eb',
                background: it.type === 'error' ? '#fef2f2' : it.type === 'success' ? '#f9fafb' : '#f3f4f6',
                color:'#111827',
                boxShadow:'0 8px 24px rgba(0,0,0,0.10)',
                padding:'10px 12px',
                display:'flex',
                gap:10,
                alignItems:'flex-start',
              }}
            >
              <div style={{ marginTop:2, fontSize:16 }}>
                {it.type === 'success' ? '✅' : it.type === 'error' ? '⚠️' : 'ℹ️'}
              </div>
              <div style={{ flex:1 }}>
                {it.title && <div style={{ fontSize:12.5, fontWeight:800 }}>{it.title}</div>}
                <div style={{ fontSize:12.5, color:'#2b3a2b', whiteSpace:'pre-wrap' }}>{it.message}</div>
              </div>
              <button
                onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))}
                style={{
                  pointerEvents:'auto',
                  background:'transparent',
                  border:'none',
                  cursor:'pointer',
                  color:'#5b6b5b',
                  fontSize:16,
                  lineHeight:'16px',
                }}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
