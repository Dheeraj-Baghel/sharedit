declare module '@live-codes/clang-wasm/toolchain' {
  type Artifact = { bytes: Uint8Array<ArrayBuffer> }
  export const CLANG_DRIVER_DEFAULT_ARGS: string[]
  export function compilerDiagnostics(output: string): string[]
  export function createToolchain(options: { baseUrl: string }): Promise<{
    runtime: { compileArtifact(source: string, options: { language: 'CPP'; fileName: string; compileArgs: string[] }): Promise<Artifact> }
    captureCompilerOutput(compile: () => Promise<Artifact>): Promise<{ result?: Artifact; raw: string; error?: Error }>
    dispose(): void
  }>
}