import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { io } from 'socket.io-client'
import { socketOrigin } from './socket-origin'

const NAME_KEY = 'sharedit.displayName'
const MAX_NAME_LENGTH = 48

type OnlineUser = { id: string; name: string; online: boolean }

function presenceId() {
  try {
    let id = sessionStorage.getItem('sharedit.presenceId')
    if (!id || !/^[a-zA-Z0-9-]{16,64}$/.test(id)) {
      id = crypto.randomUUID()
      sessionStorage.setItem('sharedit.presenceId', id)
    }
    return id
  } catch { return crypto.randomUUID() }
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase()
}

export function getSavedName() {
  try {
    const name = sessionStorage.getItem(NAME_KEY)?.trim() ?? ''
    return name.length <= MAX_NAME_LENGTH ? name : ''
  } catch {
    return ''
  }
}

export function saveName(name: string) {
  try {
    sessionStorage.setItem(NAME_KEY, name)
  } catch {
    // Joining still works when browser storage is disabled.
  }
}

function NameForm({ initialName = '', submitLabel, onSubmit, onCancel }: {
  initialName?: string
  submitLabel: string
  onSubmit: (name: string) => void
  onCancel?: () => void
}) {
  const inputId = useId()
  const [value, setValue] = useState(initialName)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = value.trim()
    if (name && name.length <= MAX_NAME_LENGTH) onSubmit(name)
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <label htmlFor={inputId} className="text-sm font-semibold text-slate-800">Display name</label>
      <input
        id={inputId}
        name="displayName"
        type="text"
        autoComplete="nickname"
        placeholder="Your name"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        maxLength={MAX_NAME_LENGTH}
        required
        autoFocus
        className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 outline-offset-2 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-indigo-600"
      />
      <button type="submit" disabled={!value.trim()} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50">
        {submitLabel}
      </button>
      {onCancel && <button type="button" className="text-sm font-medium text-slate-600 hover:text-slate-900" onClick={onCancel}>Cancel</button>}
    </form>
  )
}

export function JoinScreen({ onJoin }: { onJoin: (name: string) => void }) {
  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <section className="workspace-panel w-full max-w-md p-6 sm:p-8" aria-labelledby="join-heading">
        <p className="mb-4 text-xs font-bold tracking-widest text-indigo-700 uppercase">Sharedit</p>
        <h1 id="join-heading" className="text-3xl font-semibold tracking-tight text-slate-950">Enter your name</h1>
        <p className="mt-2 mb-6 text-sm leading-6 text-slate-600">This is how others will see you in the shared editor.</p>
        <NameForm submitLabel="Join editor" onSubmit={onJoin} />
      </section>
    </main>
  )
}

export function UsersPanel({ name, onNameChange, expanded, onToggle }: {
  name: string; onNameChange: (name: string) => void; expanded: boolean; onToggle: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [clientId] = useState(presenceId)
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io(`${socketOrigin}/presence`, { auth: { name, clientId }, transports: ['websocket'] })
    const clear = () => setConnected(false)
    socket.on('presence:users', (people: OnlineUser[]) => {
      setUsers(people.map(person => ({ ...person, online: person.online ?? true })))
      setConnected(true)
    })
    socket.on('disconnect', clear)
    socket.on('connect_error', clear)
    return () => { socket.removeAllListeners(); socket.disconnect() }
  }, [name, clientId])

  const people = users.length ? users : [{ id: clientId, name, online: false }]
  const onlineCount = users.filter(user => user.online).length
  return (
    <aside className="people-rail surface-card" aria-labelledby="users-heading">
      <div className="rail-brand"><span className="brand-mark" aria-hidden="true">S<span>.</span></span>{expanded && <span className="brand-name">Sharedit<span>Build together.</span></span>}</div>
      <button type="button" className="rail-toggle" aria-expanded={expanded} aria-controls="people-list" onClick={onToggle} title={expanded ? 'Collapse people' : 'Expand people'}>
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="3" /><path d="M8 3v14" /><path d={expanded ? 'm13 7-3 3 3 3' : 'm11 7 3 3-3 3'} /></svg>
        {expanded && <span>Collapse sidebar</span>}
      </button>
      <div className="rail-label"><h2 id="users-heading">{expanded ? 'People' : <><span className="sr-only">People</span><span aria-hidden="true">•••</span></>}</h2><span role="status" className="online-count" title={connected ? `${onlineCount} online` : 'Reconnecting'}>{connected ? onlineCount : '–'}{expanded && ' online'}</span></div>
      <ul id="people-list" className="people-list" aria-label="People and connection status">
        {[...people].sort((a, b) => Number(b.id === clientId) - Number(a.id === clientId) || Number(b.online) - Number(a.online)).map(user => {
          const self = user.id === clientId
          const state = connected ? (user.online ? 'online' : 'offline') : self ? 'offline' : 'unknown'
          const label = state === 'unknown' ? 'Status unavailable' : state === 'online' ? 'Online' : 'Offline'
          return <li key={user.id}>
            <button type="button" className={`person-row ${self ? 'is-self' : ''}`} onClick={() => { if (!expanded) onToggle() }} title={`${user.name}${self ? ' (you)' : ''} · ${label}`} aria-label={`${user.name}${self ? ', you' : ''}, ${label}`}>
              <span className={`person-avatar ${state}`} aria-hidden="true">{initials(user.name)}<i /></span>
              {expanded && <span className="person-info"><span className="person-name">{self ? name : user.name}{self && <small>you</small>}</span><span className={`person-status ${state}`}>{label}</span></span>}
            </button>
          </li>
        })}
      </ul>
      {expanded && <div className="rail-legend"><span><i className="legend-dot online" />Online</span><span><i className="legend-dot offline" />Offline</span></div>}
      <div className="rail-footer">
        {editing && expanded ? <NameForm initialName={name} submitLabel="Save name" onCancel={() => setEditing(false)} onSubmit={nextName => { onNameChange(nextName); setEditing(false) }} /> :
          <button type="button" className="profile-edit" onClick={() => { if (!expanded) onToggle(); setEditing(true) }} title="Change your name" aria-label="Change your name">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12.5 3.5 4 4M3 17l4.5-1 10-10a1.4 1.4 0 0 0 0-2l-1.5-1.5a1.4 1.4 0 0 0-2 0L4 12.5 3 17Z" /></svg>{expanded && 'Edit your name'}
          </button>}
        {expanded && <p className="rail-footnote">Session presence, not accounts.</p>}
      </div>
    </aside>
  )
}