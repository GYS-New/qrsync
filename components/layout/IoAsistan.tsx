'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// [SECENEKLER]a|b|c[/SECENEKLER] marker'ını ayıklar, metin + seçenekleri döner
function parseSecim(content: string): { text: string; secenekler: string[] | null } {
  const m = content.match(/\[SECENEKLER\]([\s\S]*?)\[\/SECENEKLER\]/)
  if (!m) return { text: content, secenekler: null }
  const secenekler = m[1].split('|').map(s => s.trim()).filter(Boolean)
  const text = content.replace(m[0], '').trim()
  return { text, secenekler: secenekler.length ? secenekler : null }
}

export default function IoAsistan({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Merhaba! Ben İO Asistan 👋\nİOGYS hakkında size nasıl yardımcı olabilirim?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

  // Focus input on open
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  async function handleSend(override?: string) {
    const text = (override ?? input).trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    if (!override) setInput('')
    setLoading(true)
    setStreamingText('')

    try {
      const res = await fetch('/api/io-asistan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.filter(m => m.role === 'user' || m.role === 'assistant') }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        if (errData.error === 'rate_limit') {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Çok fazla mesaj gönderdiniz. Lütfen biraz bekleyin. ⏳' }])
        } else {
          console.error('[io-asistan] Error:', errData)
          setMessages(prev => [...prev, { role: 'assistant', content: `Bir hata oluştu (${errData.error || res.status}). Lütfen tekrar deneyin.` }])
        }
        setLoading(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') break
              try {
                const parsed = JSON.parse(data)
                if (parsed.text) {
                  fullText += parsed.text
                  setStreamingText(fullText)
                }
              } catch {}
            }
          }
        }
      }

      if (fullText) {
        setMessages(prev => [...prev, { role: 'assistant', content: fullText }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Bağlantı hatası. Lütfen tekrar deneyin.' }])
    } finally {
      setLoading(false)
      setStreamingText('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!mounted || !open) return null

  const widget = (
    <div style={{
      position: 'fixed', bottom: 20, left: 270, zIndex: 9999,
      width: 380, height: 520,
      background: '#fff', borderRadius: 20,
      boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'ioSlideUp 0.3s ease',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes ioSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ioDots {
          0%, 20% { opacity: 0.3; }
          50% { opacity: 1; }
          80%, 100% { opacity: 0.3; }
        }
        .io-msg-user { background: linear-gradient(135deg, #185FA5, #378ADD); color: #fff; border-radius: 16px 16px 4px 16px; }
        .io-msg-assistant { background: #f1f5f9; color: #1e293b; border-radius: 16px 16px 16px 4px; }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #042C53, #0C447C)',
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/io.gif" alt="İO" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>İO Asistan</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
            Çevrimiçi
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
            width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
            fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1
          const parsed = msg.role === 'assistant' ? parseSecim(msg.content) : { text: msg.content, secenekler: null }
          const showButtons = isLast && parsed.secenekler && !loading
          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 6,
            }}>
              <div
                className={msg.role === 'user' ? 'io-msg-user' : 'io-msg-assistant'}
                style={{
                  padding: '10px 14px', maxWidth: '82%',
                  fontSize: 13.5, lineHeight: 1.55, fontWeight: 450,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >
                {parsed.text}
              </div>
              {showButtons && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '82%' }}>
                  {parsed.secenekler!.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s)}
                      style={{
                        padding: '6px 12px', borderRadius: 16,
                        border: '1.5px solid #378ADD', background: '#fff',
                        color: '#185FA5', fontSize: 12.5, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.background = '#185FA5'; e.currentTarget.style.color = '#fff' }}
                      onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#185FA5' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Streaming — [SECENEKLER] geldikten sonrasını gizle (bittiğinde butonlarla gelir) */}
        {loading && streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="io-msg-assistant" style={{
              padding: '10px 14px', maxWidth: '82%',
              fontSize: 13.5, lineHeight: 1.55, fontWeight: 450,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {streamingText.replace(/\[SECENEKLER\][\s\S]*?(\[\/SECENEKLER\]|$)/, '').trim() || '…'}
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {loading && !streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="io-msg-assistant" style={{ padding: '12px 18px', display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#94a3b8',
                  animation: `ioDots 1.4s ease infinite ${i * 0.2}s`,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid #e2e8f0',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Mesajınızı yazın..."
          disabled={loading}
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1.5px solid #e2e8f0',
            borderRadius: 12, padding: '10px 14px',
            fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
            maxHeight: 80, lineHeight: 1.4,
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = '#378ADD')}
          onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          style={{
            width: 38, height: 38, borderRadius: 10,
            background: loading || !input.trim() ? '#cbd5e1' : 'linear-gradient(135deg, #185FA5, #378ADD)',
            border: 'none', color: '#fff', cursor: loading || !input.trim() ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )

  return createPortal(widget, document.body)
}
