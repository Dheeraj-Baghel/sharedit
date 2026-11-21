const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

class QuotaError extends Error {
  constructor(message, retryAfter = 60) {
    super(message)
    this.retryAfter = retryAfter
  }
}

// Single-process ledger. Reservations are persisted BEFORE a provider call. A crash or
// an ambiguous provider failure retains that charge rather than silently refilling quota.
class QuotaLedger {
  constructor(file, { userLimit = 100_000, globalLimit = 180_000, requestLimit = 900, now = Date.now } = {}) {
    this.file = file
    this.userLimit = userLimit
    this.globalLimit = globalLimit
    this.requestLimit = requestLimit
    this.now = now
    this.busy = false
    if (fs.existsSync(file)) {
      this.state = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!/^[a-f0-9]{64}$/.test(this.state.secret) || !this.state.days || this.state.version !== 1) {
        throw new Error('Invalid AI quota ledger; refusing to reset usage.')
      }
    } else {
      this.state = { version: 1, secret: crypto.randomBytes(32).toString('hex'), days: {}, recent: [] }
      this.save()
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
  }

  hash(value) {
    return crypto.createHmac('sha256', this.state.secret).update(value).digest('hex')
  }

  identity(cookie = '') {
    const value = cookie.split(';').map(v => v.trim()).find(v => v.startsWith('sharedit_ai='))?.slice(12)
    const [id = '', signature = ''] = (value || '').split('.')
    const expected = this.hash(`visitor:${id}`)
    if (/^[a-f0-9]{32}$/.test(id) && /^[a-f0-9]{64}$/.test(signature)
      && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return { id, cookie: null }
    }
    const fresh = crypto.randomBytes(16).toString('hex')
    return { id: fresh, cookie: `sharedit_ai=${fresh}.${this.hash(`visitor:${fresh}`)}` }
  }

  day() {
    return new Date(this.now()).toISOString().slice(0, 10)
  }

  record(day) {
    return this.state.days[day] ||= { tokens: 0, requests: 0, users: {}, ips: {} }
  }

  status(id, ip) {
    const day = this.day()
    const r = this.state.days[day] || { tokens: 0, requests: 0, users: {}, ips: {} }
    const used = r.users[id] || 0
    return {
      limit: this.userLimit, used, remaining: Math.max(0, this.userLimit - used),
      available: Math.max(0, Math.min(this.userLimit - used, this.globalLimit - r.tokens,
        this.userLimit - (r.ips[ip] || 0))),
      resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400_000).toISOString(),
      appExhausted: r.tokens >= this.globalLimit || r.requests >= this.requestLimit,
    }
  }

  reserve(id, ip, tokens) {
    const now = this.now()
    const day = this.day()
    const r = this.record(day)
    const untilReset = Math.ceil((Date.parse(this.status(id, ip).resetAt) - now) / 1000)
    if (this.busy) throw new QuotaError('The tutor is answering another question. Try again shortly.', 5)
    if ((r.users[id] || 0) + tokens > this.userLimit) {
      throw new QuotaError('Not enough tokens left in your daily allowance for this request.', untilReset)
    }
    if ((r.ips[ip] || 0) + tokens > this.userLimit) {
      throw new QuotaError('This network has reached its daily AI allowance.', untilReset)
    }
    if (r.tokens + tokens > this.globalLimit || r.requests >= this.requestLimit) {
      throw new QuotaError('The shared app AI allowance is used up for today.', untilReset)
    }
    const recent = (this.state.recent || []).filter(e => e.at > now - 60_000)
    if (recent.length >= 20 || recent.reduce((sum, e) => sum + e.tokens, 0) + tokens > 7500) {
      throw new QuotaError('The tutor is cooling down to stay within Groq’s minute limit.', 60)
    }
    // Retain yesterday for any request spanning midnight; older records have expired.
    const yesterday = new Date(now - 86400_000).toISOString().slice(0, 10)
    for (const key of Object.keys(this.state.days)) {
      if (key < yesterday) delete this.state.days[key]
    }
    r.users[id] = (r.users[id] || 0) + tokens
    r.ips[ip] = (r.ips[ip] || 0) + tokens
    r.tokens += tokens
    r.requests++
    const entry = { at: now, tokens }
    this.state.recent = [...recent, entry]
    this.save() // If this fails, DO NOT send the provider request.
    this.busy = true
    let settled = false
    return {
      settle: (actual) => {
        if (settled) return
        settled = true
        // Missing/invalid usage leaves the conservative reservation charged.
        if (Number.isSafeInteger(actual) && actual >= 0) {
          const difference = actual - tokens
          r.users[id] += difference
          r.ips[ip] += difference
          r.tokens += difference
          entry.tokens = actual
        }
        try { this.save() } finally { this.busy = false }
      },
    }
  }
}

module.exports = { QuotaLedger, QuotaError }
