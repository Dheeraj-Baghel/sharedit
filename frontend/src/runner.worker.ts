import releaseVariant from '@jitl/quickjs-wasmfile-release-sync'
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'
import { transform } from 'sucrase'
import { diagnosticLocation } from './run-details'
import type { SourceLocation } from './run-details'

export type RunResult = { lines: string[]; error?: string; location?: SourceLocation }
export type Language = 'typescript' | 'javascript' | 'python' | 'cpp'
export type RunRequest = { source: string; language: Language }
export type RunMessage = { phase: 'executing' } | { result: RunResult }

const MAX_LINES = 100
const MAX_LINE_LENGTH = 500
const MEMORY_LIMIT = 32 * 1024 * 1024

async function runJavaScript(source: string, typescript: boolean): Promise<RunResult> {
  const lines: string[] = []
  // Treat the editor text as a standalone script. The VM has no browser or Node APIs.
  const code = typescript ? transform(source, { transforms: ['typescript'], disableESTransforms: true }).code : source
  const engine = await newQuickJSWASMModuleFromVariant(releaseVariant)
  const runtime = engine.newRuntime()
  try {
    runtime.setMemoryLimit(MEMORY_LIMIT)
    runtime.setMaxStackSize(512 * 1024)
    const deadline = Date.now() + 1500
    let timedOut = false
    runtime.setInterruptHandler(() => (timedOut ||= Date.now() >= deadline))

    const vm = runtime.newContext()
    try {
      const consoleObject = vm.newObject()
      try {
        for (const level of ['log', 'info', 'warn', 'error']) {
          const method = vm.newFunction(level, (...values) => {
            if (lines.length === MAX_LINES) lines.push('[Output truncated]')
            if (lines.length > MAX_LINES) return

            let line = level === 'log' ? '' : `${level}: `
            for (const [index, handle] of values.entries()) {
              if (line.length >= MAX_LINE_LENGTH) break
              let text: string
              try {
                const value: unknown = vm.dump(handle)
                text = value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)
              } catch {
                text = '[Unprintable value]'
              }
              line += (index ? ' ' : '') + text.slice(0, MAX_LINE_LENGTH + 1)
            }
            lines.push(line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line)
          })
          try {
            vm.setProp(consoleObject, level, method)
          } finally {
            method.dispose()
          }
        }
        vm.setProp(vm.global, 'console', consoleObject)
      } finally {
        consoleObject.dispose()
      }

      const result = vm.evalCode(code, typescript ? 'editor.ts' : 'editor.js', { type: 'global' })
      if (result.error) {
        try {
          if (timedOut) return { lines, error: 'Execution timed out.' }
          const error = vm.dump(result.error) as { name?: string; message?: string; stack?: string } | null
          const message = error?.message ? `${error.name ?? 'Error'}: ${error.message}` : String(error)
          return { lines, error: message.slice(0, MAX_LINE_LENGTH), location: diagnosticLocation(typescript ? 'typescript' : 'javascript', error?.stack ?? '') }
        } finally {
          result.error.dispose()
        }
      }
      result.value.dispose()
      return timedOut ? { lines, error: 'Execution timed out.' } : { lines }
    } finally {
      vm.dispose()
    }
  } finally {
    runtime.dispose()
  }
}

self.onmessage = async ({ data: { source, language } }: MessageEvent<RunRequest>) => {
  let result: RunResult
  try {
    if (language === 'python' || language === 'cpp') {
      const { runPython, runCpp } = await import('./wasi-runner')
      const ready = () => self.postMessage({ phase: 'executing' } satisfies RunMessage)
      result = await (language === 'python' ? runPython : runCpp)(source, ready)
    } else {
      result = await runJavaScript(source, language === 'typescript')
    }
  } catch (error) {
    const loc = (error as { loc?: { line?: number; column?: number } } | null)?.loc
    result = { lines: [], error: (error instanceof Error ? error.message : String(error)).slice(0, MAX_LINE_LENGTH),
      location: language === 'typescript' && Number.isSafeInteger(loc?.line) && loc!.line! > 0
        ? { line: loc!.line!, column: 1 } : undefined }
  }
  self.postMessage({ result } satisfies RunMessage)
}