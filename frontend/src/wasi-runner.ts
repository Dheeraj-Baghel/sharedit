import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim'
import type { Inode } from '@bjorn3/browser_wasi_shim'
import type { RunResult } from './runner.worker'
import { diagnosticLocation } from './run-details'

const OUTPUT_BYTES = 24_000
const assetUrl = (path: string) => new URL(`/runtimes/${path}`, self.location.origin).href

async function execute(
  bytes: Uint8Array<ArrayBuffer>,
  args: string[],
  ready: () => void,
  root?: Map<string, Inode>,
  env: string[] = [],
): Promise<RunResult> {
  const stdout = new TextDecoder()
  const stderr = new TextDecoder()
  let output = ''
  let remaining = OUTPUT_BYTES
  let truncated = false
  const write = (decoder: TextDecoder) => new ConsoleStdout((chunk) => {
    if (chunk.length > remaining) truncated = true
    if (remaining <= 0) return
    const next = chunk.subarray(0, remaining)
    output += decoder.decode(next, { stream: true })
    remaining -= next.length
  })
  const fds = [new OpenFile(new File([])), write(stdout), write(stderr)]
  const wasi = new WASI(args, env, root ? [...fds, new PreopenDirectory('/', root)] : fds)
  // Only WASI imports are supplied. File descriptors are memory-only; no sockets or host files.
  const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi.wasiImport })
  ready()
  let error: string | undefined
  try {
    const exitCode = wasi.start(instance as Parameters<WASI['start']>[0])
    if (exitCode) error = `Program exited with code ${exitCode}.`
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }
  const text = (output + stdout.decode() + stderr.decode()).trimEnd()
  const lines = text ? text.split('\n') : []
  if (truncated) lines.push('[Output truncated]')
  return { lines, error }
}

export async function runPython(source: string, ready: () => void): Promise<RunResult> {
  const { unzipSync } = await import('fflate')
  const response = await fetch(assetUrl('python.zip'))
  if (!response.ok) throw new Error(`Could not load Python (HTTP ${response.status}).`)
  const contents = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const python = contents['python.wasm']
  if (!python) throw new Error('The Python runtime archive is incomplete.')

  const root = new Map<string, Inode>([['main.py', new File(new TextEncoder().encode(source))]])
  for (const [path, data] of Object.entries(contents)) {
    if (!path.startsWith('lib/') || path.endsWith('/')) continue
    const parts = path.split('/')
    const filename = parts.pop()!
    let directory = root
    for (const part of parts) {
      const existing = directory.get(part)
      const next = existing instanceof Directory ? existing : new Directory([])
      directory.set(part, next)
      directory = next.contents
    }
    directory.set(filename, new File(data, { readonly: true }))
  }
  // CPython uses this directory to locate its platform prefix, even with built-in WASI extensions.
  const lib = root.get('lib')
  if (lib instanceof Directory) {
    for (const entry of lib.contents.values()) {
      if (entry instanceof Directory && !entry.contents.has('lib-dynload')) {
        entry.contents.set('lib-dynload', new Directory([]))
      }
    }
  }

  const result = await execute(python as Uint8Array<ArrayBuffer>, ['python', '-B', '-S', '-u', '/main.py'], ready, root, ['PYTHONHOME=/', 'NO_COLOR=1'])
  return result.error ? { ...result, location: diagnosticLocation('python', result.lines.join('\n')) } : result
}

export async function runCpp(source: string, ready: () => void): Promise<RunResult> {
  const { createToolchain, compilerDiagnostics, CLANG_DRIVER_DEFAULT_ARGS } = await import('@live-codes/clang-wasm/toolchain')
  const toolchain = await createToolchain({ baseUrl: assetUrl('clang/') })
  try {
    const built = await toolchain.captureCompilerOutput(() => toolchain.runtime.compileArtifact(source, {
      language: 'CPP',
      fileName: 'main.cpp',
      compileArgs: [...CLANG_DRIVER_DEFAULT_ARGS, '-std=gnu++20'],
    }))
    const diagnostics = compilerDiagnostics(built.raw).join('\n').slice(0, OUTPUT_BYTES)
    if (!built.result) return { lines: [], error: diagnostics || built.error?.message || 'Compilation failed.', location: diagnosticLocation('cpp', diagnostics) }
    const result = await execute(built.result.bytes, ['main'], ready)
    return { ...result, lines: [...(diagnostics ? [diagnostics] : []), ...result.lines] }
  } finally {
    toolchain.dispose()
  }
}