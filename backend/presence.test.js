const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PresenceRoster, installPresence } = require('./presence')
const { createServer } = require('node:http')
const { Server } = require('socket.io')
const { io } = require('../frontend/node_modules/socket.io-client')

test('disconnected users remain visible as offline and reconnect under the same id', () => {
  const roster = new PresenceRoster()
  roster.connect('alice', 'Alice Green', 's1')
  roster.connect('bob', 'Bob Brown', 's2')
  roster.disconnect('s1')
  assert.deepEqual(roster.snapshot(), [
    { id: 'alice', name: 'Alice Green', online: false }, { id: 'bob', name: 'Bob Brown', online: true },
  ])
  roster.connect('alice', 'Alice Smith', 's3')
  assert.equal(roster.snapshot().length, 2)
  assert.deepEqual(roster.snapshot()[0], { id: 'alice', name: 'Alice Smith', online: true })
})
test('one visitor is online until all their connections close', () => {
  const roster = new PresenceRoster()
  roster.connect('a', 'Alice', 's1')
  roster.connect('a', 'Alice', 's2')
  roster.disconnect('s1')
  assert.equal(roster.snapshot()[0].online, true)
  roster.disconnect('s2')
  assert.equal(roster.snapshot()[0].online, false)
})
test('offline history is bounded and expires without removing connected visitors', () => {
  let time = 0
  const roster = new PresenceRoster({ now: () => time, maxOffline: 2, offlineTtl: 100 })
  roster.connect('live', 'Still here', 'live')
  for (let i = 0; i < 4; i++) {
    time++
    roster.connect(`u${i}`, `User ${i}`, `s${i}`)
    roster.disconnect(`s${i}`)
  }
  assert.deepEqual(roster.snapshot().map(p => p.id), ['live', 'u2', 'u3'])
  time = 200
  assert.deepEqual(roster.snapshot(), [{ id: 'live', name: 'Still here', online: true }])
})
test('real sockets broadcast online/offline states and reject invalid identity input', async t => {
  const http = createServer()
  const server = new Server(http)
  installPresence(server.of('/presence'))
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${http.address().port}/presence`
  const clients = []
  t.after(() => clients.forEach(client => client.disconnect()))
  function client(auth) {
    const result = io(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true })
    clients.push(result)
    return result
  }
  function state(socket, predicate) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('presence:users', onState); reject(Error('Timed out waiting for roster')) }, 3000)
      function onState(users) {
        if (!predicate(users)) return
        clearTimeout(timer)
        socket.off('presence:users', onState)
        resolve(users)
      }
      socket.on('presence:users', onState)
    })
  }
  const first = client({ name: 'Alice', clientId: 'aaaaaaaa-aaaa-aaaa' })
  await state(first, users => users.length === 1)
  const second = client({ name: 'Bob', clientId: 'bbbbbbbb-bbbb-bbbb' })
  await state(first, users => users.length === 2 && users.every(u => u.online))
  const offline = state(first, users => users.find(u => u.name === 'Bob')?.online === false)
  second.disconnect()
  await offline
  const invalid = client({ name: 'Bad', clientId: 'x' })
  await new Promise(resolve => invalid.once('connect_error', resolve))
  const reconnect = state(first, users => users.length === 2 && users.every(u => u.online))
  client({ name: 'Bob Renamed', clientId: 'bbbbbbbb-bbbb-bbbb' })
  const users = await reconnect
  assert.equal(users.find(u => u.id === 'bbbbbbbb-bbbb-bbbb').name, 'Bob Renamed')
})
