const { createServer } = require('node:http')
const path = require('node:path')
const express = require('express')
const { Server } = require('socket.io')
const { YSocketIO } = require('y-socket.io/dist/server')
const { createAiRouter } = require('./ai')

// Local development secret file; deployment environment variables take precedence.
const envFile = path.join(__dirname, '..', '.env')
if (require('node:fs').existsSync(envFile)) process.loadEnvFile(envFile)

const app = express()
const server = createServer(app)
const io = new Server(server, {
  allowRequest(req, done) {
    const { origin, host } = req.headers
    done(null, !origin || origin === `http://${host}` || origin === `https://${host}` || origin === process.env.SHAREDIT_PUBLIC_ORIGIN)
  },
})

// y-socket.io uses Yjs to merge and relay document updates within each room.
new YSocketIO(io).initialize()

require('./presence').installPresence(io.of('/presence'))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/ai', createAiRouter())
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')))

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'
server.listen(port, host, () => {
  console.log(`Sharedit: http://localhost:${server.address().port}/`)
})