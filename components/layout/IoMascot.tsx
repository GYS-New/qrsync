'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * İO Asistan maskotu — beyaz gövdeli, kulaklıklı, duygulu karakter.
 *
 * Özellikler:
 * - 10 yüz ifadesi (idle, happy, wink, blink, surprised, angry, sad, thinking, sleep, love)
 * - Mouse takibi (idle/sad'de aktif)
 * - Otomatik çift göz kırpma (3.5–7 sn aralık)
 * - Otomatik rastgele ifade döngüsü (6–12 sn aralık, 1.5–2.8 sn sergile)
 * - `expression` prop'u ile dış override (verildiğinde otomatik döngü askıya alınır)
 */

export type IoExpression =
  | 'idle'
  | 'happy'
  | 'wink'
  | 'blink'
  | 'surprised'
  | 'angry'
  | 'sad'
  | 'thinking'
  | 'sleep'
  | 'love'

type EyeForm = 'oval' | 'happy' | 'wink' | 'angry' | 'surprised' | 'heart'

interface ExpressionConfig {
  eyeL: EyeForm
  eyeR: EyeForm
  browL: string | null
  browR: string | null
  mouth: string | null
  mouthColor: string
  mouthO: boolean
  pupil: boolean | 'look-up-right'
  led: string
}

const EXPRESSIONS: Record<IoExpression, ExpressionConfig> = {
  idle:      { eyeL: 'oval',      eyeR: 'oval',      browL: null,                               browR: null,                               mouth: 'M 108 172 Q 120 181, 132 172', mouthColor: '#22D3EE', mouthO: false, pupil: true,             led: '#22D3EE' },
  happy:     { eyeL: 'happy',     eyeR: 'happy',     browL: 'M 78 108 Q 95 102, 112 110',       browR: 'M 128 110 Q 145 102, 162 108',     mouth: 'M 96 168 Q 120 196, 144 168',  mouthColor: '#22D3EE', mouthO: false, pupil: false,            led: '#22D3EE' },
  wink:      { eyeL: 'wink',      eyeR: 'oval',      browL: null,                               browR: null,                               mouth: 'M 100 170 Q 120 188, 140 170', mouthColor: '#22D3EE', mouthO: false, pupil: true,             led: '#22D3EE' },
  blink:     { eyeL: 'wink',      eyeR: 'wink',      browL: null,                               browR: null,                               mouth: 'M 108 174 Q 120 178, 132 174', mouthColor: '#22D3EE', mouthO: false, pupil: false,            led: '#22D3EE' },
  surprised: { eyeL: 'surprised', eyeR: 'surprised', browL: 'M 78 96 Q 95 88, 112 96',          browR: 'M 128 96 Q 145 88, 162 96',        mouth: null,                           mouthColor: '#22D3EE', mouthO: true,  pupil: false,            led: '#FBBF24' },
  angry:     { eyeL: 'angry',     eyeR: 'angry',     browL: 'M 78 114 L 112 124',               browR: 'M 128 124 L 162 114',              mouth: 'M 104 180 Q 120 172, 136 180', mouthColor: '#EF4444', mouthO: false, pupil: false,            led: '#EF4444' },
  sad:       { eyeL: 'oval',      eyeR: 'oval',      browL: 'M 78 110 Q 95 118, 112 110',       browR: 'M 128 110 Q 145 118, 162 110',     mouth: 'M 104 182 Q 120 170, 136 182', mouthColor: '#60A5FA', mouthO: false, pupil: true,             led: '#60A5FA' },
  thinking:  { eyeL: 'oval',      eyeR: 'oval',      browL: 'M 78 104 Q 95 94, 112 104',        browR: 'M 128 112 Q 145 110, 162 112',     mouth: 'M 110 176 Q 118 170, 128 178', mouthColor: '#A78BFA', mouthO: false, pupil: 'look-up-right',  led: '#A78BFA' },
  sleep:     { eyeL: 'wink',      eyeR: 'wink',      browL: null,                               browR: null,                               mouth: 'M 110 176 L 130 176',          mouthColor: '#67E8F9', mouthO: false, pupil: false,            led: '#67E8F9' },
  love:      { eyeL: 'heart',     eyeR: 'heart',     browL: 'M 78 106 Q 95 100, 112 106',       browR: 'M 128 106 Q 145 100, 162 106',     mouth: 'M 100 170 Q 120 192, 140 170', mouthColor: '#F472B6', mouthO: false, pupil: false,            led: '#F472B6' },
}

// Rastgele döngüde gösterilebilecek ifadeler. Happy ve wink ağırlıklı — sık tekrar eden, pozitif his.
const RANDOM_POOL: IoExpression[] = ['happy', 'happy', 'wink', 'wink', 'surprised', 'love']

interface Props {
  size?: number
  /** Dış override — verildiğinde otomatik döngü durur ve bu ifade aktif olur */
  expression?: IoExpression
  onClick?: () => void
  title?: string
  style?: React.CSSProperties
}

export default function IoMascot({ size = 86, expression, onClick, title, style }: Props) {
  const [internal, setInternal] = useState<IoExpression>('idle')
  const [blinking, setBlinking] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Aktif ifade: blink > dış override > iç state
  const active: IoExpression = blinking ? 'blink' : (expression ?? internal)
  const config = EXPRESSIONS[active]

  // ---------- Mouse tracking ----------
  useEffect(() => {
    let rafId = 0
    let mx = typeof window !== 'undefined' ? window.innerWidth / 2 : 0
    let my = typeof window !== 'undefined' ? window.innerHeight / 2 : 0

    function update() {
      const svg = svgRef.current
      if (!svg) return
      const pupils = svg.querySelectorAll<SVGCircleElement>('.io-eye-pupil')
      pupils.forEach(pupil => {
        if (config.pupil === false) { pupil.setAttribute('transform', 'translate(0 0)'); return }
        if (config.pupil === 'look-up-right') { pupil.setAttribute('transform', 'translate(3 -2)'); return }
        pupil.setAttribute('transform', 'translate(0 0)')
        const r = pupil.getBoundingClientRect()
        if (r.width === 0) return
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const dx = mx - cx
        const dy = my - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const nd = Math.min(dist / 260, 1)
        const a = Math.atan2(dy, dx)
        const max = 5
        pupil.setAttribute('transform', `translate(${(Math.cos(a) * max * nd).toFixed(2)} ${(Math.sin(a) * max * nd).toFixed(2)})`)
      })
    }

    function onMove(e: MouseEvent) {
      mx = e.clientX
      my = e.clientY
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }
    function onScroll() {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    const initTimer = setTimeout(update, 200)
    update()

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafId)
      clearTimeout(initTimer)
    }
  }, [config.pupil])

  // ---------- Auto blink ----------
  useEffect(() => {
    if (expression) return // dış override varken blink yok (thinking gibi özel durumlarda)
    let t1: ReturnType<typeof setTimeout>
    let t2: ReturnType<typeof setTimeout>

    function cycle() {
      t1 = setTimeout(() => {
        // sadece sakin durumlarda blink (happy/wink gösterirken blink yapmayalım — garip durur)
        if (internal === 'idle' || internal === 'sad') {
          setBlinking(true)
          t2 = setTimeout(() => {
            setBlinking(false)
            cycle()
          }, 140)
        } else {
          cycle()
        }
      }, 3500 + Math.random() * 3500)
    }

    cycle()
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [internal, expression])

  // ---------- Random expression cycle (canlılık) ----------
  useEffect(() => {
    if (expression) return // dış override varken döngü askıya
    let t1: ReturnType<typeof setTimeout>
    let t2: ReturnType<typeof setTimeout>

    function cycle() {
      t1 = setTimeout(() => {
        const pick = RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)]
        setInternal(pick)
        t2 = setTimeout(() => {
          setInternal('idle')
          cycle()
        }, 1500 + Math.random() * 1300)
      }, 6000 + Math.random() * 6000)
    }

    cycle()
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [expression])

  // ---------- Render ----------
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 240 260"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', cursor: onClick ? 'pointer' : 'default', ...style }}
      onClick={onClick}
      role="img"
      aria-label={title || 'İO Asistan'}
    >
      <title>{title || 'İO Asistan'}</title>

      {/* LED anten */}
      <line x1="120" y1="38" x2="120" y2="22" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="120" cy="19" r="4.5" fill={config.led} style={{ transition: 'fill 0.35s ease' }}>
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Kulaklık bandı */}
      <path d="M 48 125 C 48 55, 192 55, 192 125" stroke="#475569" strokeWidth="7" fill="none" strokeLinecap="round" />
      <ellipse cx="42" cy="130" rx="19" ry="26" fill="#334155" />
      <ellipse cx="45" cy="130" rx="13" ry="20" fill="#1E293B" />
      <ellipse cx="198" cy="130" rx="19" ry="26" fill="#334155" />
      <ellipse cx="195" cy="130" rx="13" ry="20" fill="#1E293B" />

      {/* Mikrofon */}
      <path d="M 210 148 Q 218 180, 200 198" stroke="#334155" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="197" cy="200" rx="6" ry="5" fill="#1E293B" />

      {/* Gövde */}
      <ellipse cx="120" cy="135" rx="72" ry="76" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="2" />
      <ellipse cx="120" cy="165" rx="70" ry="50" fill="#E2E8F0" opacity="0.55" />
      <ellipse cx="92" cy="82" rx="28" ry="12" fill="#FFFFFF" opacity="0.95" />
      <ellipse cx="100" cy="76" rx="14" ry="4" fill="#FFFFFF" />

      {/* Yüz ekranı */}
      <ellipse cx="120" cy="140" rx="58" ry="54" fill="#0F172A" />
      <ellipse cx="94" cy="108" rx="18" ry="8" fill="#1E293B" opacity="0.65" />

      {/* Kaşlar */}
      <path
        d={config.browL ?? 'M 78 108 Q 95 102, 112 110'}
        stroke="#22D3EE"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        style={{ opacity: config.browL ? 1 : 0, transition: 'opacity 0.22s ease, d 0.25s ease' }}
      />
      <path
        d={config.browR ?? 'M 128 110 Q 145 102, 162 108'}
        stroke="#22D3EE"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        style={{ opacity: config.browR ? 1 : 0, transition: 'opacity 0.22s ease, d 0.25s ease' }}
      />

      {/* Sol göz — tüm formlar katmanlı, opaciteyle açılır/kapanır */}
      <g style={{ opacity: config.eyeL === 'oval' ? 1 : 0, transition: 'opacity 0.18s ease' }}>
        <ellipse cx="95" cy="138" rx="19" ry="22" fill="#22D3EE" opacity="0.2" />
        <ellipse cx="95" cy="138" rx="15" ry="18" fill="#22D3EE" />
        <ellipse cx="95" cy="138" rx="10" ry="13" fill="#67E8F9" opacity="0.75" />
        <circle className="io-eye-pupil" cx="95" cy="138" r="5" fill="#FFFFFF" />
        <circle cx="99" cy="133" r="2.2" fill="#FFFFFF" />
      </g>
      <path d="M 78 142 Q 95 126, 112 142" stroke="#22D3EE" strokeWidth="4" fill="none" strokeLinecap="round" style={{ opacity: config.eyeL === 'happy' ? 1 : 0, transition: 'opacity 0.18s ease' }} />
      <path d="M 78 138 Q 95 144, 112 138" stroke="#22D3EE" strokeWidth="4" fill="none" strokeLinecap="round" style={{ opacity: config.eyeL === 'wink' ? 1 : 0, transition: 'opacity 0.12s ease' }} />
      <path d="M 77 130 L 113 140 L 113 146 L 77 146 Z" fill="#22D3EE" style={{ opacity: config.eyeL === 'angry' ? 1 : 0, transition: 'opacity 0.18s ease' }} />
      <g style={{ opacity: config.eyeL === 'surprised' ? 1 : 0, transition: 'opacity 0.18s ease' }}>
        <ellipse cx="95" cy="138" rx="18" ry="22" fill="#22D3EE" opacity="0.25" />
        <ellipse cx="95" cy="138" rx="14" ry="17" fill="#FFFFFF" />
        <circle cx="95" cy="138" r="6" fill="#0F172A" />
        <circle cx="97" cy="135" r="1.8" fill="#FFFFFF" />
      </g>
      <path d="M 95 150 C 88 142, 78 140, 78 131 C 78 126, 84 122, 89 126 C 92 128, 94 131, 95 133 C 96 131, 98 128, 101 126 C 106 122, 112 126, 112 131 C 112 140, 102 142, 95 150 Z" fill="#F472B6" style={{ opacity: config.eyeL === 'heart' ? 1 : 0, transition: 'opacity 0.18s ease' }} />

      {/* Sağ göz */}
      <g style={{ opacity: config.eyeR === 'oval' ? 1 : 0, transition: 'opacity 0.18s ease' }}>
        <ellipse cx="145" cy="138" rx="19" ry="22" fill="#22D3EE" opacity="0.2" />
        <ellipse cx="145" cy="138" rx="15" ry="18" fill="#22D3EE" />
        <ellipse cx="145" cy="138" rx="10" ry="13" fill="#67E8F9" opacity="0.75" />
        <circle className="io-eye-pupil" cx="145" cy="138" r="5" fill="#FFFFFF" />
        <circle cx="149" cy="133" r="2.2" fill="#FFFFFF" />
      </g>
      <path d="M 128 142 Q 145 126, 162 142" stroke="#22D3EE" strokeWidth="4" fill="none" strokeLinecap="round" style={{ opacity: config.eyeR === 'happy' ? 1 : 0, transition: 'opacity 0.18s ease' }} />
      <path d="M 128 138 Q 145 144, 162 138" stroke="#22D3EE" strokeWidth="4" fill="none" strokeLinecap="round" style={{ opacity: config.eyeR === 'wink' ? 1 : 0, transition: 'opacity 0.12s ease' }} />
      <path d="M 127 140 L 163 130 L 163 146 L 127 146 Z" fill="#22D3EE" style={{ opacity: config.eyeR === 'angry' ? 1 : 0, transition: 'opacity 0.18s ease' }} />
      <g style={{ opacity: config.eyeR === 'surprised' ? 1 : 0, transition: 'opacity 0.18s ease' }}>
        <ellipse cx="145" cy="138" rx="18" ry="22" fill="#22D3EE" opacity="0.25" />
        <ellipse cx="145" cy="138" rx="14" ry="17" fill="#FFFFFF" />
        <circle cx="145" cy="138" r="6" fill="#0F172A" />
        <circle cx="147" cy="135" r="1.8" fill="#FFFFFF" />
      </g>
      <path d="M 145 150 C 138 142, 128 140, 128 131 C 128 126, 134 122, 139 126 C 142 128, 144 131, 145 133 C 146 131, 148 128, 151 126 C 156 122, 162 126, 162 131 C 162 140, 152 142, 145 150 Z" fill="#F472B6" style={{ opacity: config.eyeR === 'heart' ? 1 : 0, transition: 'opacity 0.18s ease' }} />

      {/* Ağız (path ve O-şekli) */}
      <path
        d={config.mouth ?? 'M 108 172 Q 120 181, 132 172'}
        stroke={config.mouthColor}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        style={{ opacity: config.mouth ? 1 : 0, transition: 'opacity 0.2s ease, d 0.28s ease, stroke 0.3s ease' }}
      />
      <ellipse
        cx="120"
        cy="178"
        rx="6"
        ry="7"
        fill={config.mouthColor}
        style={{ opacity: config.mouthO ? 1 : 0, transition: 'opacity 0.18s ease, fill 0.3s ease' }}
      />
    </svg>
  )
}
