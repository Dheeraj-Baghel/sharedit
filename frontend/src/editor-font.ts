export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 30
export const DEFAULT_FONT_SIZE = 14
const KEY = 'sharedit.editorFontSize'
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function normalizeFontSize(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value))) : DEFAULT_FONT_SIZE
}

export function readFontSize(storage?: PreferenceStorage): number {
  try {
    const raw = (storage ?? window.localStorage).getItem(KEY)
    if (raw && /^\d+$/.test(raw)) {
      const value = Number(raw)
      if (value >= MIN_FONT_SIZE && value <= MAX_FONT_SIZE) return value
    }
  } catch { /* Storage can be blocked; the control still works in this tab. */ }
  return DEFAULT_FONT_SIZE
}

export function saveFontSize(value: number, storage?: PreferenceStorage) {
  try { (storage ?? window.localStorage).setItem(KEY, String(normalizeFontSize(value))) }
  catch { /* Keep the in-memory preference when storage is unavailable. */ }
}
