'use client'

import { useEffect } from 'react'

/**
 * CSS position:sticky body { zoom: 0.75 } altinda guvenilir calismiyor.
 * Bu polyfill .verde-table icindeki <thead>'lara scroll-aware
 * transform uygular — visual olarak thead scroll container'in tepesinde
 * sabit kalir.
 *
 * Yaklasim:
 *  - DOM'da her .verde-table > thead'i bul
 *  - En yakin scrollable (overflow-y: auto/scroll) ancestor'i tespit et
 *  - O scroller'a scroll listener bagla; her scroll'da thead'a
 *    translate3d(0, scrollTop, 0) uygula -> scroll kayinca thead da
 *    ayni kadar asagi kayar -> visual olarak sabit gorunur
 *  - MutationObserver ile sonradan eklenen tablolar da yakalanir
 *
 * Mount: her role layout'unda bir kere (sa, ta, u, oto-yikama).
 */
export default function StickyTheadPolyfill() {
  useEffect(() => {
    const DEBUG = true // TODO: false yap, dogrulama sonrasi
    const log = (...a: any[]) => { if (DEBUG) console.log('[StickyThead]', ...a) }
    log('mounted')

    const attached = new WeakSet<HTMLElement>()

    function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
      let cur: HTMLElement | null = el?.parentElement ?? null
      while (cur && cur !== document.body) {
        const cs = window.getComputedStyle(cur)
        const overflow = cs.overflowY || cs.overflow
        if (overflow === 'auto' || overflow === 'scroll') return cur
        cur = cur.parentElement
      }
      return null
    }

    function attach(thead: HTMLElement) {
      if (attached.has(thead)) return
      const table = thead.closest('table')
      if (!table) { log('no table for thead'); return }
      const scroller = findScrollableAncestor(table as HTMLElement)
      if (!scroller) {
        log('NO scrollable ancestor for table; body or page scrolling instead', { tableClass: table.className })
        return
      }

      attached.add(thead)
      thead.style.position = 'relative'
      thead.style.zIndex = '10'
      thead.style.willChange = 'transform'

      log('attached to scroller', {
        scrollerClass: scroller.className,
        scrollerTag: scroller.tagName,
        scrollerHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        canScroll: scroller.scrollHeight > scroller.clientHeight,
      })

      let rafId = 0
      const update = () => {
        cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          const t = scroller.scrollTop
          thead.style.transform = t > 0 ? `translate3d(0, ${t}px, 0)` : ''
        })
      }

      scroller.addEventListener('scroll', update, { passive: true })
      update()
    }

    function scan() {
      const theads = document.querySelectorAll<HTMLElement>('table.verde-table > thead')
      log('scan found', theads.length, 'theads')
      theads.forEach(attach)
    }

    scan()

    const observer = new MutationObserver(() => scan())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [])

  return null
}
