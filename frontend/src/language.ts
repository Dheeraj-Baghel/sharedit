import type { Language } from './runner.worker'

export const LANGUAGE_NAMES: Record<Language, string> = {
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', cpp: 'C++',
}
const KEY = 'sharedit.language'
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function readLanguage(storage?: PreferenceStorage): Language {
  try {
    const saved = (storage ?? window.localStorage).getItem(KEY)
    if (saved && Object.hasOwn(LANGUAGE_NAMES, saved)) return saved as Language
  } catch { /* Private/blocked storage should never prevent using the editor. */ }
  return 'typescript'
}

export function saveLanguage(language: Language, storage?: PreferenceStorage) {
  try { (storage ?? window.localStorage).setItem(KEY, language) }
  catch { /* The selected language still works for this tab. */ }
}
