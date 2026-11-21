import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { LANGUAGE_NAMES } from './language'
import type { Language } from './runner.worker'

const languages = Object.keys(LANGUAGE_NAMES) as Language[]
const badges: Record<Language, string> = { python: 'Py', javascript: 'JS', typescript: 'TS', cpp: 'C++' }

function placeMenu(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(208, document.documentElement.clientWidth - 16)
  const height = document.documentElement.clientHeight
  const below = Math.max(0, height - rect.bottom - 14)
  const above = Math.max(0, rect.top - 14)
  const flip = below < 212 && above > below
  return {
    width, left: Math.max(8, rect.right - width),
    ...(flip ? { bottom: height - rect.top + 6 } : { top: rect.bottom + 6 }),
    maxHeight: flip ? above : below,
  }
}

export function LanguagePicker({ value, disabled, onChange }: {
  value: Language; disabled: boolean; onChange: (value: Language) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties>({})
  const visible = open && !disabled

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => {
    if (!visible) return
    const reposition = () => { if (trigger.current) setPosition(placeMenu(trigger.current)) }
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    document.addEventListener('pointerdown', dismiss)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      document.removeEventListener('pointerdown', dismiss)
    }
  }, [visible])
  useEffect(() => {
    if (visible) menu.current?.querySelectorAll('[role=option]')[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, visible])

  function show(index = languages.indexOf(value)) {
    if (!trigger.current) return
    setPosition(placeMenu(trigger.current))
    setActive(index)
    setOpen(true)
  }

  function choose(index: number) {
    if (disabled) return
    onChange(languages[index])
    setOpen(false)
    trigger.current?.focus()
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown': case 'ArrowUp':
        event.preventDefault()
        if (!visible) show()
        else setActive(index => Math.min(languages.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1))))
        break
      case 'Home': case 'End': {
        event.preventDefault()
        const index = event.key === 'Home' ? 0 : languages.length - 1
        if (visible) setActive(index)
        else show(index)
        break
      }
      case 'Enter': case ' ':
        event.preventDefault()
        if (event.repeat) break
        if (visible) choose(active)
        else show()
        break
      case 'Escape':
        if (visible) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
        break
      default:
        if (/^[a-z]$/i.test(event.key)) {
          const index = languages.findIndex(language => LANGUAGE_NAMES[language].toLowerCase().startsWith(event.key.toLowerCase()))
          if (index !== -1) {
            event.preventDefault()
            if (visible) setActive(index)
            else show(index)
          }
        }
    }
  }

  return <>
    <button ref={trigger} type="button" role="combobox" aria-label="Editor language" aria-expanded={visible}
      aria-controls={visible ? id : undefined} aria-activedescendant={visible ? `${id}-${active}` : undefined}
      disabled={disabled} className="language-picker" onKeyDown={handleKey} onBlur={() => setOpen(false)}
      onClick={() => { if (visible) setOpen(false); else show() }}>
      <span className={`language-badge language-${value}`} aria-hidden="true">{badges[value]}</span>
      {LANGUAGE_NAMES[value]}
      <svg className="language-chevron" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {visible && createPortal(<div ref={menu} className="language-menu" style={position}>
      <div className="language-menu-heading" aria-hidden="true">Editor language</div>
      <div id={id} role="listbox" aria-label="Editor languages">
        {languages.map((language, index) => <div key={language} id={`${id}-${index}`} role="option" aria-selected={value === language}
          className={`language-option${active === index ? ' is-active' : ''}`}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
          <span className={`language-badge language-${language}`} aria-hidden="true">{badges[language]}</span>
          <span>{LANGUAGE_NAMES[language]}</span>
          {value === language && <span className="language-check" aria-hidden="true">✓</span>}
        </div>)}
      </div>
    </div>, document.body)}
  </>
}
