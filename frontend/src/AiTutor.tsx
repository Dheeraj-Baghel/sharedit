import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Language } from './runner.worker'
import type { RunSnapshot } from './CodeTerminal'
import type { Suggestion } from './SuggestionReview'

type Usage = { limit: number; used: number; remaining: number; available: number; resetAt: string; appExhausted: boolean }
type Status = Partial<Usage> & { enabled: boolean; message?: string; model?: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; suggestion?: Suggestion }

function Reply({ text }: { text: string }) {
  // React escapes every string. Fenced code is presentation only, never HTML or executable.
  const parts = text.split(/(```[\s\S]*?```)/g)
  return <>{parts.map((part, index) => part.startsWith('```')
    ? <pre key={index} className="my-2 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 whitespace-pre text-slate-100"><code>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trimEnd()}</code></pre>
    : <span key={index} className="whitespace-pre-wrap wrap-anywhere">{part}</span>)}</>
}

export function AiTutor({ getCode, language, run, onClose, onReview }: {
  getCode: () => string | undefined
  language: Language
  run: RunSnapshot | null
  onClose: () => void
  onReview: (suggestion: Suggestion) => void
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [question, setQuestion] = useState('')
  const [includeCode, setIncludeCode] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [trimmed, setTrimmed] = useState(false)
  const active = useRef(false)
  const alive = useRef(false)
  const history = useRef<ChatMessage[]>([])
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    alive.current = true
    const abort = new AbortController()
    async function refresh() {
      if (active.current) return
      const current = generation.current
      try {
        const response = await fetch('/api/ai/status', { signal: abort.signal, credentials: 'same-origin' })
        const data = await response.json()
        if (!response.ok) throw new Error('Could not load the tutor.')
        if (alive.current && current === generation.current) setStatus(data)
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError' && alive.current) {
          setError('Could not check the AI allowance. The next refresh will retry.')
        }
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => {
      alive.current = false
      abort.abort()
      controller.current?.abort()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [messages, pending, error])

  async function send(event: FormEvent) {
    event.preventDefault()
    if (active.current || !question.trim()) return
    const asked = question.trim()
    const code = includeCode ? getCode() || '' : ''
    setError('')
    if (code.length > 6000) { setError('The editor code is too long. Uncheck “Include editor code” or shorten it to 6,000 characters.'); return }
    const matchingRun = includeCode && run?.source === code && run.language === language ? run : null
    const output = matchingRun
      ? [...matchingRun.result.lines, ...(matchingRun.result.error ? [matchingRun.result.error] : [])].join('\n') : ''
    if (output.length > 2000) { setError('The run output is too long. Uncheck “Include editor code” and paste just the relevant error in your question.'); return }
    active.current = true
    generation.current++
    setPending(true)
    setQuestion('')
    setMessages(previous => [...previous, { role: 'user', content: asked }])
    controller.current = new AbortController()
    try {
      const response = await fetch('/api/ai/tutor', {
        method: 'POST', credentials: 'same-origin', signal: controller.current.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'chat', language, code, question: asked, output, history: history.current }),
      })
      const data = await response.json()
      if (!alive.current) return
      if (data.usage) setStatus(previous => ({ ...previous, enabled: true, ...data.usage }))
      else if (typeof data.limit === 'number') setStatus(previous => ({ ...previous, enabled: true, ...data }))
      if (!response.ok) throw new Error(data.error || 'The tutor could not answer.')
      const reply: ChatMessage = { role: 'assistant', content: data.answer.reply }
      const replacement = data.answer.replacement
      const suggestion = code.trim() && typeof replacement === 'string' && replacement.trim() && replacement !== code
        ? { source: code, replacement, language } : undefined
      setMessages(previous => [...previous, { ...reply, suggestion }])
      setTrimmed(data.historyIncluded < history.current.length)
      const next = [...history.current, { role: 'user' as const, content: asked }, reply].slice(-12)
      // Keep requests below the backend body limit, dropping only complete old turns.
      while (next.length && new TextEncoder().encode(JSON.stringify(next)).length > 10_000) next.splice(0, 2)
      history.current = next
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError' && alive.current) {
        setError(e.message)
        setQuestion(asked)
      }
    } finally {
      active.current = false
      if (alive.current) setPending(false)
    }
  }

  const exhausted = status?.appExhausted || status?.available === 0
  const disabled = pending || !status?.enabled || exhausted
  return (
    <aside className="ai-tutor flex min-h-0 flex-col bg-white" aria-labelledby="ai-heading">
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <div>
          <h2 id="ai-heading" className="font-semibold text-slate-950">AI tutor <span className="ml-1 text-xs font-normal text-indigo-600">by Groq</span></h2>
          <p className="text-xs text-slate-500">Private chat · clears when closed</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" aria-label="Close AI tutor">Close</button>
      </header>
      <section className="shrink-0 border-y border-indigo-100 bg-indigo-50 px-4 py-3 text-indigo-950" aria-label="Daily AI allowance">
        {status?.enabled && typeof status.remaining === 'number' ? <>
          <div className="flex justify-between gap-2 text-xs font-semibold"><span>Today’s tokens</span><span>{status.remaining.toLocaleString()} / {status.limit?.toLocaleString()} left</span></div>
          <progress className="mt-1.5 block h-1.5 w-full accent-indigo-600" value={status.remaining} max={status.limit} aria-label="Tokens remaining" />
          <p className="mt-1.5 text-[11px] leading-4">Resets {new Date(status.resetAt!).toLocaleString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}. Closing chat does not reset usage.</p>
        </> : <p className="text-xs leading-5">{status?.message || 'Checking today’s token allowance…'}</p>}
        {exhausted && <p className="mt-2 text-xs font-semibold">AI allowance exhausted. You can still run your code.</p>}
      </section>
      <div ref={log} role="log" aria-label="Tutor conversation" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 text-sm">
        {!messages.length && <div className="py-5 text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-2xl bg-indigo-50 font-semibold text-indigo-600" aria-hidden="true">?</div>
          <h3 className="font-semibold text-slate-800">What are you working on?</h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">Ask a coding question, paste an exercise, or ask me to explain your error.</p>
        </div>}
        {messages.map((message, index) => <article key={index} className={message.role === 'user' ? 'ml-5 rounded-2xl rounded-tr-sm bg-indigo-700 p-3 text-white' : 'mr-2 min-w-0 rounded-2xl rounded-tl-sm bg-slate-100 p-3 text-slate-800'}>
          <p className={`mb-1.5 text-[11px] font-semibold ${message.role === 'user' ? 'text-indigo-200' : 'text-slate-500'}`}>{message.role === 'user' ? 'You' : 'AI tutor'}</p>
          <div className="text-sm leading-6"><Reply text={message.content} /></div>
          {message.suggestion && <button type="button" className="mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700" onClick={() => onReview(message.suggestion!)}>Review code changes</button>}
        </article>)}
        {pending && <p role="status" className="text-xs text-indigo-700">AI tutor is thinking…</p>}
        {trimmed && <p className="text-[11px] leading-4 text-slate-500">Only recent turns that fit the token budget were included. Restate older details if needed.</p>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-800">{error}</p>}
      </div>
      <form onSubmit={send} className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeCode} disabled={pending} onChange={e => setIncludeCode(e.target.checked)} className="accent-indigo-600" />Include editor code & matching run output</label>
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-slate-50 p-2 focus-within:border-indigo-500">
          <textarea aria-label="Message AI tutor" value={question} onChange={e => setQuestion(e.target.value)} disabled={pending} maxLength={1200} rows={2} placeholder="Ask a question…" onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }} className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60" />
          <button type="submit" disabled={disabled || !question.trim()} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">Send</button>
        </div>
        <p className="text-[10px] leading-4 text-slate-500">Sent to Groq only on Send. Don’t share secrets. AI can be wrong. Enter to send · Shift+Enter for a new line.</p>
      </form>
    </aside>
  )
}
