import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diagnosticLocation, matchesPrediction } from '../src/run-details.ts'

test('diagnostics locate source lines, not dependency frames', () => {
  assert.deepEqual(diagnosticLocation('python', '  File "/main.py", line 7, in <module>\n  File "/lib/helpers.py", line 3\n  File "/main.py", line 2, in fail'), { line: 2, column: 1 })
  assert.deepEqual(diagnosticLocation('cpp', '/tmp/main.cpp:4:17: error: expected semicolon'), { line: 4, column: 17 })
  assert.deepEqual(diagnosticLocation('javascript', '    at f (editor.js:5:9)\n    at <eval> (editor.js:10)'), { line: 5, column: 9 })
  assert.equal(diagnosticLocation('python', 'File "/lib/helpers.py", line 3'), undefined)
  assert.equal(diagnosticLocation('cpp', 'main.cpp:4:17: warning: unused'), undefined)
  assert.equal(diagnosticLocation('javascript', 'at editor.js:0'), undefined)
})

test('prediction ignores line endings and trailing whitespace, not meaningful differences', () => {
  assert.equal(matchesPrediction('one  \r\ntwo\r\n', 'one\ntwo'), true)
  assert.equal(matchesPrediction('', ''), true)
  assert.equal(matchesPrediction(' one', 'one'), false)
  assert.equal(matchesPrediction('One', 'one'), false)
})
