import { createHash } from 'node:crypto'
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const output = fileURLToPath(new URL('../public/runtimes/', import.meta.url))
const clangAssets = resolve(dirname(require.resolve('@live-codes/clang-wasm')), '../assets')
await mkdir(resolve(output, 'clang'), { recursive: true })
await cp(resolve(clangAssets, 'bin'), resolve(output, 'clang/bin'), { recursive: true })
await copyFile(resolve(clangAssets, 'runtime-manifest.v1.json'), resolve(output, 'clang/runtime-manifest.v1.json'))
for (const notice of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) {
  await copyFile(resolve(clangAssets, '..', notice), resolve(output, 'clang', notice))
}

const pythonUrl = 'https://github.com/brettcannon/cpython-wasi-build/releases/download/v3.15.2/python-3.15.2-wasi_sdk-33.zip'
const pythonHash = 'b8a63559c56760bbdc310dedb74fd69d10bcbafae26b705bea0ad353ad256888'
const pythonPath = resolve(output, 'python.zip')
const matches = (bytes) => createHash('sha256').update(bytes).digest('hex') === pythonHash
const existing = await readFile(pythonPath).catch((error) => {
  if (error.code !== 'ENOENT') throw error
  return null
})

if (!existing || !matches(existing)) {
  console.log('Downloading pinned CPython WASI runtime…')
  const response = await fetch(pythonUrl, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Could not download the CPython runtime: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!matches(bytes)) throw new Error('CPython runtime checksum mismatch')
  await writeFile(pythonPath, bytes)
}