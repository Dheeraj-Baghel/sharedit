import type { Language } from './runner.worker'

export type SourceLocation = { line: number; column: number }

export function diagnosticLocation(language: Language, text: string): SourceLocation | undefined {
  const pattern = language === 'python' ? /File "\/?main\.py", line (\d+)/g
    : language === 'cpp' ? /(?:^|[\s/])main\.cpp:(\d+):(\d+):\s*(?:fatal )?error:/gm
    : /\beditor\.(?:js|ts):(\d+)(?::(\d+))?/g
  const matches = [...text.matchAll(pattern)]
  const match = language === 'python' ? matches.at(-1) : matches[0]
  if (!match) return
  const line = Number(match[1]), column = Number(match[2] ?? 1)
  if (Number.isSafeInteger(line) && line > 0 && Number.isSafeInteger(column) && column > 0) return { line, column }
}

export function matchesPrediction(guess: string, output: string) {
  const normalize = (text: string) => text.replace(/\r\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').replace(/\n+$/, '')
  return normalize(guess) === normalize(output)
}
