import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readLanguage, saveLanguage } from '../src/language.ts'

function storage(initial = null) {
  let value = initial
  return { getItem: key => { assert.equal(key, 'sharedit.language'); return value }, setItem: (key, next) => { assert.equal(key, 'sharedit.language'); value = next } }
}

test('remembers all supported editor languages across reads', () => {
  for (const language of ['python', 'cpp', 'javascript', 'typescript']) {
    const store = storage()
    saveLanguage(language, store)
    assert.equal(readLanguage(store), language)
  }
})
test('missing, corrupted and prototype property preferences fall back safely', () => {
  for (const value of [null, '', 'ruby', 'constructor', '__proto__']) assert.equal(readLanguage(storage(value)), 'typescript')
})
test('blocked browser storage does not prevent changing or loading a language', () => {
  const blocked = { getItem() { throw new Error('Blocked') }, setItem() { throw new Error('Blocked') } }
  assert.equal(readLanguage(blocked), 'typescript')
  assert.doesNotThrow(() => saveLanguage('python', blocked))
})
