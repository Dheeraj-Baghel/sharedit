import { useEffect, useRef, useState } from 'react'

export const PANEL_SIZES = { terminal: [160, 420, 210], tutor: [280, 560, 360] } as const
type Panel = keyof typeof PANEL_SIZES

export function usePanelSize(panel: Panel) {
  const [min, max, initial] = PANEL_SIZES[panel]
  const key = `sharedit.${panel}Size`
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))
  const [size, setSize] = useState<number>(() => {
    try {
      const value = localStorage.getItem(key)
      if (value && /^\d+$/.test(value)) return clamp(Number(value))
    } catch { /* Optional preference. */ }
    return initial
  })
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(key, String(size)) } catch { /* Optional preference. */ }
    }, 150)
    return () => window.clearTimeout(timer)
  }, [key, size])
  return [size, (value: number) => setSize(clamp(value))] as const
}

export function PanelResize({ panel, value, onChange }: { panel: Panel; value: number; onChange: (value: number) => void }) {
  const drag = useRef<{ origin: number; size: number } | null>(null)
  const [min, max, initial] = PANEL_SIZES[panel]
  const vertical = panel === 'tutor'
  const label = vertical ? 'Resize AI tutor width' : 'Resize terminal height'
  return <div role="separator" tabIndex={0} aria-label={label} title={`${label} (drag or use arrow keys; double-click to reset)`}
    aria-orientation={vertical ? 'vertical' : 'horizontal'} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
    className={`panel-resize resize-${panel}`}
    onDoubleClick={() => onChange(initial)}
    onPointerDown={e => {
      if (e.button !== 0 || drag.current) return
      const card = e.currentTarget.parentElement?.querySelector(vertical ? '.tutor-card' : '.terminal-card')
      const bounds = card?.getBoundingClientRect()
      drag.current = { origin: vertical ? e.clientX : e.clientY, size: (vertical ? bounds?.width : bounds?.height) ?? value }
      e.currentTarget.setPointerCapture(e.pointerId)
    }}
    onPointerMove={e => {
      if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) onChange(drag.current.size + drag.current.origin - (vertical ? e.clientX : e.clientY))
    }}
    onLostPointerCapture={() => { drag.current = null }}
    onKeyDown={e => {
      const increase = vertical ? 'ArrowLeft' : 'ArrowUp'
      const decrease = vertical ? 'ArrowRight' : 'ArrowDown'
      const next = e.key === increase ? value + 16 : e.key === decrease ? value - 16 : e.key === 'Home' ? min : e.key === 'End' ? max : null
      if (next === null) return
      e.preventDefault(); onChange(next)
    }} />
}
