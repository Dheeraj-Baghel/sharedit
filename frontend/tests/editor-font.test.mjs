import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_FONT_SIZE, normalizeFontSize, readFontSize, saveFontSize } from '../src/editor-font.ts'

function storage(initial = null) {
  let value = initial
  return { getItem: key => { assert.equal(key, 'sharedit.editorFontSize'); return value }, setItem: (key, next) => { assert.equal(key, 'sharedit.editorFontSize'); value = next } }
}

test('font size is restored after saving every supported size', () => {
  const store = storage()
  for (let size = 10; size <= 30; size++) {
    saveFontSize(size, store)
    assert.equal(readFontSize(store), size)
  }
  saveFontSize(DEFAULT_FONT_SIZE, store)
  assert.equal(readFontSize(store), 14)
})
test('font controls cannot exceed bounds or save invalid numbers', () => {
  for (const [value, expected] of [[9, 10], [31, 30], [18.6, 19], [NaN, 14], [Infinity, 14]]) {
    assert.equal(normalizeFontSize(value), expected)
    const store = storage()
    saveFontSize(value, store)
    assert.equal(readFontSize(store), expected)
  }
})
test('missing, corrupted and out-of-range font preferences use the default', () => {
  for (const value of [null, '', '0', '9', '31', '400', 'NaN', '14.5', 'hello']) {
    assert.equal(readFontSize(storage(value)), 14)
  }
})
test('font sizing works safely when persistent storage is blocked', () => {
  const blocked = { getItem() { throw Error('Blocked') }, setItem() { throw Error('Blocked') } }
  assert.equal(readFontSize(blocked), 14)
  assert.doesNotThrow(() => saveFontSize(20, blocked))
})
