import type { editor } from 'monaco-editor'
import * as Y from 'yjs'
import type { SocketIOProvider } from 'y-socket.io'

const colors = ['#4338ca', '#047857', '#a21caf', '#b45309', '#0369a1', '#be123c']

export function attachCursors(editor: editor.IStandaloneCodeEditor, text: Y.Text, provider: SocketIOProvider) {
  const model = editor.getModel()!
  const { awareness, doc } = provider
  const widgets = new Map<number, { widget: editor.IContentWidget; node: HTMLElement; position: editor.IContentWidgetPosition | null }>()

  function draw() {
    const seen = new Set<number>()
    for (const [id, state] of awareness.getStates()) {
      if (id === doc.clientID || !state.shareditCursor || typeof state.shareditName !== 'string') continue
      let position
      try { position = Y.createAbsolutePositionFromRelativePosition(state.shareditCursor, doc) } catch { continue }
      if (position?.type !== text) continue
      seen.add(id)
      let entry = widgets.get(id)
      const anchor = { position: model.getPositionAt(position.index), preference: [0] }
      if (!entry) {
        const node = document.createElement('div')
        node.className = 'collaborator-cursor'
        node.style.setProperty('--cursor-color', colors[id % colors.length])
        const label = document.createElement('span')
        node.append(label)
        const cursor = { node, position: anchor, widget: { getId: () => `sharedit.cursor.${id}`, getDomNode: () => node, getPosition: (): editor.IContentWidgetPosition => cursor.position } }
        entry = cursor
        widgets.set(id, entry)
        editor.addContentWidget(entry.widget)
      }
      entry.node.firstElementChild!.textContent = state.shareditName.slice(0, 48)
      entry.position = anchor
      editor.layoutContentWidget(entry.widget)
    }
    for (const [id, entry] of widgets) if (!seen.has(id)) {
      editor.removeContentWidget(entry.widget)
      widgets.delete(id)
    }
  }

  function publish() {
    const position = editor.getPosition()
    if (position) awareness.setLocalStateField('shareditCursor', Y.createRelativePositionFromTypeIndex(text, model.getOffsetAt(position)))
  }
  const listener = editor.onDidChangeCursorPosition(publish)
  awareness.on('change', draw)
  text.observe(draw)
  publish()
  return () => {
    listener.dispose()
    awareness.off('change', draw)
    text.unobserve(draw)
    for (const { widget } of widgets.values()) editor.removeContentWidget(widget)
    widgets.clear()
  }
}
