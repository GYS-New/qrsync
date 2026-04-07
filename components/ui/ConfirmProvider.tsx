'use client'

import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import Button from './Button'

type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'primary' | 'danger'
}

type ChoiceOption = {
  label: string
  value: string
  description?: string
}

type ConfirmChoiceOptions = {
  title?: string
  message: string
  options: ChoiceOption[]
  cancelText?: string
}

type Ctx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  confirmChoice: (opts: ConfirmChoiceOptions) => Promise<string | null>
}

const ConfirmCtx = createContext<Ctx | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  // ─── Standart confirm ───────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmOpts, setConfirmOpts] = useState<ConfirmOptions | null>(null)
  // ref kullan — setState race condition'ı yok
  const confirmResolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((o: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve
      setConfirmOpts(o)
      setConfirmOpen(true)
    })
  }, [])

  const closeConfirm = useCallback((result: boolean) => {
    setConfirmOpen(false)
    confirmResolverRef.current?.(result)
    confirmResolverRef.current = null
    setConfirmOpts(null)
  }, [])

  // ─── confirmChoice ──────────────────────────────────────────────────────
  const [choiceOpen, setChoiceOpen] = useState(false)
  const [choiceOpts, setChoiceOpts] = useState<ConfirmChoiceOptions | null>(null)
  const choiceResolverRef = useRef<((v: string | null) => void) | null>(null)

  const confirmChoice = useCallback((o: ConfirmChoiceOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      choiceResolverRef.current = resolve
      setChoiceOpts(o)
      setChoiceOpen(true)
    })
  }, [])

  const closeChoice = useCallback((result: string | null) => {
    setChoiceOpen(false)
    choiceResolverRef.current?.(result)
    choiceResolverRef.current = null
    setChoiceOpts(null)
  }, [])

  // value sabit ref'e dayandığı için useMemo'ya gerek yok
  const value: Ctx = { confirm, confirmChoice }

  return (
    <ConfirmCtx.Provider value={value}>
      {children}

      {/* Standart Onay Modalı */}
      {confirmOpen && confirmOpts && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(15,26,15,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeConfirm(false) }}
        >
          <div
            className="verde-card"
            style={{ width: 'min(520px, calc(100vw - 24px))', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,0.22)', overflow: 'hidden' }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18 }}>{confirmOpts.variant === 'danger' ? '⚠️' : '✅'}</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#111827' }}>{confirmOpts.title ?? 'Onay'}</div>
              <button
                onClick={() => closeConfirm(false)}
                aria-label="Kapat"
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#5b6b5b', fontSize: 18, lineHeight: '18px' }}
              >✕</button>
            </div>
            <div style={{ padding: 16, fontSize: 12.8, color: '#2b3a2b', whiteSpace: 'pre-wrap' }}>{confirmOpts.message}</div>
            <div style={{ padding: 14, borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" type="button" onClick={() => closeConfirm(false)}>
                {confirmOpts.cancelText ?? 'İptal'}
              </Button>
              <Button variant={confirmOpts.variant === 'danger' ? 'danger' : 'primary'} type="button" onClick={() => closeConfirm(true)}>
                {confirmOpts.confirmText ?? 'Tamam'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Seçim Modalı */}
      {choiceOpen && choiceOpts && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(15,26,15,0.32)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeChoice(null) }}
        >
          <div
            className="verde-card"
            style={{ width: 'min(480px, calc(100vw - 24px))', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,0.22)', overflow: 'hidden' }}
          >
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18 }}>🗑️</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#111827' }}>{choiceOpts.title ?? 'Seçin'}</div>
              <button
                onClick={() => closeChoice(null)}
                aria-label="Kapat"
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#5b6b5b', fontSize: 18, lineHeight: '18px' }}
              >✕</button>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 12.8, color: '#2b3a2b' }}>{choiceOpts.message}</div>
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {choiceOpts.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => closeChoice(opt.value)}
                  style={{
                    textAlign: 'left', padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                    border: opt.value === 'hard' ? '1.5px solid #e53e3e' : '1.5px solid #c8d8c8',
                    background: opt.value === 'hard' ? '#fff5f5' : '#fafafa',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = opt.value === 'hard' ? '#ffe4e4' : '#ecf5ec')}
                  onMouseLeave={e => (e.currentTarget.style.background = opt.value === 'hard' ? '#fff5f5' : '#fafafa')}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: opt.value === 'hard' ? '#c53030' : '#1a2e1a' }}>
                    {opt.value === 'hard' ? '⚠️ ' : '📋 '}{opt.label}
                  </div>
                  {opt.description && (
                    <div style={{ fontSize: 11.5, color: '#5b6b5b', marginTop: 3 }}>{opt.description}</div>
                  )}
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" type="button" onClick={() => closeChoice(null)}>
                {choiceOpts.cancelText ?? 'İptal'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
