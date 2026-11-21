import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { MonacoBinding } from 'y-monaco'
import { SocketIOProvider } from 'y-socket.io'
import { Doc } from 'yjs'
import { socketOrigin } from './socket-origin'
import { CodeTerminal } from './CodeTerminal'
import type { RunSnapshot } from './CodeTerminal'
import { AiTutor } from './AiTutor'
import { LanguagePicker } from './LanguagePicker'
import { attachCursors } from './collaborator-cursors'
import { PanelResize, usePanelSize } from './PanelResize'
import { SuggestionReview } from './SuggestionReview'
import type { Suggestion } from './SuggestionReview'
import type { SourceLocation } from './run-details'
import './monaco'
import { getSavedName, JoinScreen, saveName, UsersPanel } from './presence'
import type { Language } from './runner.worker'
import { LANGUAGE_NAMES, readLanguage, saveLanguage } from './language'
import { DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE, normalizeFontSize, readFontSize, saveFontSize } from './editor-font'
import './style.css'

const appRoot = document.getElementById('app')
if (!appRoot) throw new Error('Sharedit mount point is missing')
const EXTENSIONS: Record<Language, string> = { python: 'py', javascript: 'js', typescript: 'ts', cpp: 'cpp' }

function SharedEditor({ name }: { name: string }) {
  const [codeEditor, setCodeEditor] = useState<editor.IStandaloneCodeEditor>()
  const [language, setLanguage] = useState<Language>(readLanguage)
  const [fontSize, setFontSize] = useState(readFontSize)
  const [running, setRunning] = useState(false)
  const [tutorOpen, setTutorOpen] = useState(true)
  const [run, setRun] = useState<RunSnapshot | null>(null)
  const [review, setReview] = useState<Suggestion | null>(null)
  const [terminalHeight, setTerminalHeight] = usePanelSize('terminal')
  const [tutorWidth, setTutorWidth] = usePanelSize('tutor')
  const providerRef = useRef<SocketIOProvider | null>(null)
  const highlight = useRef<{ dispose: () => void } | null>(null)
  useEffect(() => () => highlight.current?.dispose(), [])

  function resizeText(value: number) {
    const size = normalizeFontSize(value)
    setFontSize(size)
    saveFontSize(size)
  }

  useEffect(() => {
    const model = codeEditor?.getModel()
    if (!codeEditor || !model) return
    const doc = new Doc()
    const provider = new SocketIOProvider(socketOrigin, 'sharedit', doc, {
      autoConnect: false, disableBc: true,
    })
    const text = doc.getText('code')
    const binding = new MonacoBinding(text, model, new Set([codeEditor]))
    const detachCursors = attachCursors(codeEditor, text, provider)
    providerRef.current = provider
    provider.connect()
    return () => {
      providerRef.current = null
      detachCursors()
      if (!model.isDisposed()) binding.destroy()
      provider.destroy()
      provider.socket.disconnect()
      doc.destroy()
    }
  }, [codeEditor])
  useEffect(() => { providerRef.current?.awareness.setLocalStateField('shareditName', name) }, [codeEditor, name])

  function jumpToError(snapshot: RunSnapshot, location: SourceLocation) {
    const model = codeEditor?.getModel()
    if (!codeEditor || !model || snapshot.language !== language || model.getValue() !== snapshot.source || location.line > model.getLineCount()) return false
    const position = model.validatePosition({ lineNumber: location.line, column: location.column })
    codeEditor.setPosition(position)
    codeEditor.revealPositionInCenter(position)
    codeEditor.focus()
    highlight.current?.dispose()
    const decoration = codeEditor.createDecorationsCollection([{ range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: 1, endColumn: 1 }, options: { isWholeLine: true, className: 'terminal-error-line' } }])
    const timer = window.setTimeout(() => decoration.clear(), 1800)
    highlight.current = { dispose() { window.clearTimeout(timer); decoration.clear() } }
    return true
  }

  function downloadCode() {
    if (!codeEditor) return
    const url = URL.createObjectURL(new Blob([codeEditor.getValue()], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `scratch.${EXTENSIONS[language]}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function applySuggestion(change: Suggestion) {
    const model = codeEditor?.getModel()
    if (!codeEditor || !model || language !== change.language || model.getValue() !== change.source) return false
    codeEditor.pushUndoStop()
    const applied = codeEditor.executeEdits('sharedit.ai-review', [{ range: model.getFullModelRange(), text: change.replacement }])
    codeEditor.pushUndoStop()
    return applied
  }

  return (
    <div className={`studio-grid ${tutorOpen ? 'with-tutor' : ''}`} style={{ '--terminal-height': `${terminalHeight}px`, '--tutor-width': `${tutorWidth}px` } as CSSProperties}>
      <section className="editor-card surface-card" aria-label="Shared editor">
        <header className="pane-heading">
          <div className="pane-title"><span className="pane-icon code-icon" aria-hidden="true">{'</>'}</span><div><h1>Code editor</h1><p>A shared space to think in code</p></div></div>
          <div className="editor-actions">
            <div className="text-sizer" role="group" aria-label="Editor text size">
              <button type="button" onClick={() => resizeText(fontSize - 1)} disabled={fontSize <= MIN_FONT_SIZE} aria-label="Decrease editor text size" title="Smaller text">A−</button>
              <button type="button" className="text-size-value" onClick={() => resizeText(DEFAULT_FONT_SIZE)} aria-label={`Editor text size ${fontSize} pixels. Reset to ${DEFAULT_FONT_SIZE}.`} title={`Reset text size to ${DEFAULT_FONT_SIZE}px`}><span aria-live="polite">{fontSize}px</span></button>
              <button type="button" onClick={() => resizeText(fontSize + 1)} disabled={fontSize >= MAX_FONT_SIZE} aria-label="Increase editor text size" title="Larger text">A+</button>
            </div>
            <LanguagePicker value={language} disabled={running} onChange={next => {
              setLanguage(next)
              saveLanguage(next)
            }} />
            <button type="button" aria-expanded={tutorOpen} aria-controls="tutor-panel" onClick={() => setTutorOpen(!tutorOpen)} className={`tutor-toggle ${tutorOpen ? 'active' : ''}`}><span aria-hidden="true">✧</span>{tutorOpen ? 'Hide tutor' : 'AI tutor'}</button>
          </div>
        </header>
        <div className="file-strip"><span className="file-tab"><span className="file-dot" aria-hidden="true" />scratch.{EXTENSIONS[language]}</span><button type="button" onClick={downloadCode} disabled={!codeEditor} className="download-code" title="Download the current code">↓ Download</button></div>
        <div className="editor-canvas">
          <Editor language={language} onMount={setCodeEditor} options={{
            ariaLabel: 'Shared code editor', automaticLayout: true,
            minimap: { enabled: false }, padding: { top: 20, bottom: 20 },
            fontSize, lineHeight: Math.round(fontSize * 1.7), fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
            scrollBeyondLastLine: false, smoothScrolling: true,
            overviewRulerLanes: 0, hideCursorInOverviewRuler: true,
            renderLineHighlight: 'gutter', lineNumbersMinChars: 3,
          }} />
        </div>
        <footer className="editor-status"><span>{LANGUAGE_NAMES[language]}</span><span>UTF-8 <span className="status-separator">/</span> Shared document</span></footer>
      </section>
      <CodeTerminal getCode={() => codeEditor?.getValue()} language={language} onRunningChange={setRunning} onResult={setRun} onJump={jumpToError} />
      <PanelResize panel="terminal" value={terminalHeight} onChange={setTerminalHeight} />
      {tutorOpen && <section id="tutor-panel" className="tutor-card surface-card" aria-label="AI tutor panel">
        <AiTutor getCode={() => codeEditor?.getValue()} language={language} run={run} onClose={() => setTutorOpen(false)} onReview={setReview} />
      </section>}
      {tutorOpen && <PanelResize panel="tutor" value={tutorWidth} onChange={setTutorWidth} />}
      {review && <SuggestionReview change={review} onClose={() => setReview(null)} onApply={() => applySuggestion(review)} />}
    </div>
  )
}

function App() {
  const [name, setName] = useState(getSavedName)
  const [expanded, setExpanded] = useState(false)
  function updateName(nextName: string) { saveName(nextName); setName(nextName) }
  if (!name) return <JoinScreen onJoin={updateName} />
  return (
    <main className={`workbench-shell ${expanded ? 'people-expanded' : ''}`} aria-label="Sharedit workspace">
      <UsersPanel name={name} onNameChange={updateName} expanded={expanded} onToggle={() => setExpanded(value => !value)} />
      <div className="workspace-stage"><SharedEditor name={name} /></div>
    </main>
  )
}

createRoot(appRoot).render(<App />)
