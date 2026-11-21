import { useEffect, useRef, useState } from 'react'
import type { Language, RunMessage, RunRequest, RunResult } from './runner.worker'
import { LANGUAGE_NAMES } from './language'
import { matchesPrediction } from './run-details'
import type { SourceLocation } from './run-details'

const MAX_SOURCE_LENGTH = 64_000
export type RunSnapshot = { source: string; language: Language; result: RunResult }

export function CodeTerminal({ getCode, language, onRunningChange, onResult, onJump }: {
  getCode: () => string | undefined
  language: Language
  onRunningChange: (running: boolean) => void
  onResult: (snapshot: RunSnapshot | null) => void
  onJump: (snapshot: RunSnapshot, location: SourceLocation) => boolean
}) {
  const active = useRef<{ dispose: () => void; finish: (result: RunResult, stopped?: boolean) => void } | null>(null)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<RunResult | null>(null)
  const [summary, setSummary] = useState('')
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null)
  const [challenge, setChallenge] = useState(false)
  const [guess, setGuess] = useState('')
  const [feedback, setFeedback] = useState('')
  const [jumpNote, setJumpNote] = useState('')
  const hidden = challenge && !feedback && !!snapshot && !snapshot.result.error
  const running = Boolean(status)

  useEffect(() => () => active.current?.dispose(), [])
  useEffect(() => { onRunningChange(running) }, [running, onRunningChange])
  useEffect(() => {
    setResult(null); setSnapshot(null); setSummary(''); setGuess(''); setFeedback(''); setJumpNote(''); onResult(null)
  }, [language, onResult])

  function run() {
    if (active.current) return
    setSnapshot(null); setSummary(''); setGuess(''); setFeedback(''); setJumpNote(''); onResult(null)
    const code = getCode()
    if (!code?.trim()) {
      setResult({ lines: ['Write some code in the editor first.'] })
      return
    }
    if (code.length > MAX_SOURCE_LENGTH) {
      setResult({ lines: [], error: 'This runner supports scripts up to 64,000 characters.' })
      return
    }

    let worker: Worker
    try {
      worker = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      setResult({ lines: [], error: 'The browser could not start the code runner.' })
      return
    }

    const started = performance.now()
    function finish(next: RunResult, stopped = false) {
      active.current?.dispose()
      setStatus('')
      setResult(next)
      const current = { source: code!, language, result: next }
      setSummary(`${stopped ? 'Stopped' : next.error ? 'Error' : 'Finished'} · ${Math.round(performance.now() - started)} ms · ${next.lines.length} ${next.lines.length === 1 ? 'line' : 'lines'}`)
      if (!stopped) {
        setSnapshot(current)
        if (!challenge || next.error) onResult(current)
      }
    }

    const nativeWasm = language === 'cpp' || language === 'python'
    const onTimeout = () => finish({ lines: [], error: 'The runner timed out and was stopped.' })
    let timeout = window.setTimeout(onTimeout, nativeWasm ? 45_000 : 8000)
    active.current = {
      dispose() {
        window.clearTimeout(timeout)
        worker.terminate()
        active.current = null
      },
      finish,
    }
    worker.onmessage = ({ data }: MessageEvent<RunMessage>) => {
      if ('result' in data) {
        finish(data.result)
      } else {
        window.clearTimeout(timeout)
        timeout = window.setTimeout(onTimeout, 3000)
        setStatus(`Running ${LANGUAGE_NAMES[language]}…`)
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish({ lines: [], error: 'The code runner could not load or stopped unexpectedly.' })
    }
    setStatus(language === 'cpp' ? 'Loading the C++ compiler and building…' : `Starting ${LANGUAGE_NAMES[language]}…`)
    setResult(null)
    onResult(null)
    worker.postMessage({ source: code, language } satisfies RunRequest)
  }

  const runShortcut = useRef(run)
  runShortcut.current = run
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return
      if (!(event.target instanceof Element) || !event.target.closest('.editor-card, .terminal-card') || event.target.closest('.prediction-form')) return
      event.preventDefault()
      if (!event.repeat) runShortcut.current()
    }
    window.addEventListener('keydown', shortcut, true)
    return () => window.removeEventListener('keydown', shortcut, true)
  }, [])

  const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ ↵' : 'Ctrl ↵'
  const finishPrediction = (check: boolean) => {
    if (!snapshot) return
    setFeedback(check ? matchesPrediction(guess, snapshot.result.lines.join('\n')) ? 'Correct prediction!' : 'Not quite. Compare your guess with the actual output.' : 'Output revealed.')
    onResult(snapshot)
  }

  return (
    <section aria-labelledby="terminal-heading" className="terminal-card">
      <div className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-prompt" aria-hidden="true">›_</span>
          <h2 id="terminal-heading">Terminal</h2>
          <span className="terminal-local">{LANGUAGE_NAMES[language]} · Local output</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <label className="flex items-center gap-1 text-slate-300" title="Predict the output before seeing it"><input type="checkbox" checked={challenge} disabled={running || hidden} onChange={e => { setChallenge(e.target.checked); if (e.target.checked) setSnapshot(null) }} /> Predict<span className="sr-only"> the output</span></label>
          <button type="button" disabled={running || !result} onClick={() => { setResult(null); setSnapshot(null); setSummary(''); setFeedback(''); setJumpNote(''); onResult(null) }} className="rounded px-2 py-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50">Clear</button>
          {running ? (
            <button type="button" onClick={() => active.current?.finish({ lines: ['Run stopped.'] }, true)} className="rounded bg-slate-800 px-3 py-1.5 hover:bg-slate-700">Stop</button>
          ) : (
            <button type="button" onClick={run} aria-keyshortcuts="Meta+Enter Control+Enter" className="rounded bg-emerald-300 px-3 py-1.5 text-slate-950 hover:bg-emerald-200">Run code <kbd className="ml-1 opacity-70">{shortcutLabel}</kbd></button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto text-slate-300">
        {hidden ? <form className="prediction-form grid gap-2 px-4 py-3 text-xs" onSubmit={e => { e.preventDefault(); finishPrediction(true) }}>
          <label htmlFor="output-guess" className="font-semibold">What do you think this run printed?</label>
          <textarea id="output-guess" rows={2} maxLength={24000} value={guess} onChange={e => setGuess(e.target.value)} placeholder="Leave blank if you expect no output" className="rounded border border-slate-600 bg-slate-950 p-2 font-mono" />
          <div className="flex flex-wrap gap-2"><button className="rounded bg-emerald-300 px-2 py-1 text-slate-950">Check prediction</button><button type="button" className="rounded border border-slate-600 px-2 py-1" onClick={() => finishPrediction(false)}>Reveal output</button></div>
        </form> : <>
          {feedback && <p role="status" className="px-4 pt-2 text-xs text-emerald-200">{feedback}</p>}
          <pre role="log" aria-label="Code output" tabIndex={0} className="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
            {running ? status : result ? result.lines.join('\n') || (result.error ? '' : 'Finished with no output.') : 'Choose a language above the editor, then click Run code.'}
            {result?.error && <>{result.lines.length ? '\n' : ''}{result.location && snapshot
              ? <button type="button" className="text-left whitespace-pre-wrap text-rose-300 underline underline-offset-2" onClick={() => setJumpNote(onJump(snapshot, result.location!) ? '' : 'The code has changed. Run it again to locate the error.')}>{result.error} · Jump to line {result.location.line}</button>
              : <span className="text-rose-300">{result.error}</span>}</>}
          </pre>
          {jumpNote && <p role="status" className="px-4 pb-2 text-xs text-amber-200">{jumpNote}</p>}
        </>}
      </div>
      {!hidden && summary && <div role="status" className="shrink-0 border-t border-slate-700 px-4 py-1 text-[11px] text-slate-300">{summary}</div>}
    </section>
  )
}