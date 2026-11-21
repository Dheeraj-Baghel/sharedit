import { DiffEditor } from '@monaco-editor/react'
import { useEffect, useRef, useState } from 'react'
import type { Language } from './runner.worker'

export type Suggestion = { source: string; replacement: string; language: Language }

export function SuggestionReview({ change, onClose, onApply }: { change: Suggestion; onClose: () => void; onApply: () => boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [stale, setStale] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="suggestion-dialog" aria-labelledby="review-title" onClose={onClose}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
      <div><h2 id="review-title" className="font-semibold">Review AI changes</h2><p className="text-xs text-slate-600">Original on the left, proposed replacement on the right.</p></div>
      <button type="button" autoFocus className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => dialog.current?.close()}>Close</button>
    </header>
    <div className="min-h-0 flex-1"><DiffEditor original={change.source} modified={change.replacement} language={change.language}
      options={{ readOnly: true, originalEditable: false, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false, automaticLayout: true, minimap: { enabled: false } }} /></div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3">
      {stale ? <p role="alert" className="text-sm text-rose-700">The editor changed. Request a new suggestion before applying.</p> : <p className="text-xs text-slate-600">Applying updates the shared editor. It does not run the code.</p>}
      <button type="button" disabled={stale} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => onApply() ? dialog.current?.close() : setStale(true)}>Apply to shared editor</button>
    </footer>
  </dialog>
}
