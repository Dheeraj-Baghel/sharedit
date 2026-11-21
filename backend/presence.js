// Presence is session-local, not an account system. Stable client ids prevent a
// refresh/name change creating a new offline avatar on every reconnect.
class PresenceRoster {
  constructor({ now = Date.now, maxOffline = 100, offlineTtl = 86400_000 } = {}) {
    this.now = now
    this.maxOffline = maxOffline
    this.offlineTtl = offlineTtl
    this.people = new Map()
    this.connections = new Map()
  }

  connect(id, name, socketId) {
    const person = this.people.get(id) || { id, name, sockets: new Set(), lastSeen: this.now() }
    person.name = name
    person.sockets.add(socketId)
    person.lastSeen = this.now()
    this.people.set(id, person)
    this.connections.set(socketId, id)
    this.trim()
  }

  disconnect(socketId) {
    const id = this.connections.get(socketId)
    this.connections.delete(socketId)
    const person = this.people.get(id)
    if (person) {
      person.sockets.delete(socketId)
      person.lastSeen = this.now()
    }
    this.trim()
  }

  trim() {
    const offline = [...this.people.values()].filter(p => !p.sockets.size).sort((a, b) => b.lastSeen - a.lastSeen)
    for (const [i, p] of offline.entries()) {
      if (i >= this.maxOffline || this.now() - p.lastSeen >= this.offlineTtl) this.people.delete(p.id)
    }
  }

  snapshot() {
    this.trim()
    return [...this.people.values()].map(p => ({ id: p.id, name: p.name, online: Boolean(p.sockets.size) }))
  }
}

function installPresence(namespace) {
  const roster = new PresenceRoster()
  namespace.use((socket, next) => {
    const { name, clientId } = socket.handshake.auth
    const displayName = typeof name === 'string' ? name.trim() : ''
    if (!displayName || displayName.length > 48) return next(new Error('Invalid display name'))
    if (clientId !== undefined && (typeof clientId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(clientId))) {
      return next(new Error('Invalid presence id'))
    }
    socket.data.name = displayName
    socket.data.clientId = clientId || socket.id
    next()
  })
  namespace.on('connection', socket => {
    roster.connect(socket.data.clientId, socket.data.name, socket.id)
    namespace.emit('presence:users', roster.snapshot())
    socket.on('disconnect', () => {
      roster.disconnect(socket.id)
      namespace.emit('presence:users', roster.snapshot())
    })
  })
  return roster
}

module.exports = { PresenceRoster, installPresence }
