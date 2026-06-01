'use strict'

// NOTA TÉCNICA: Este middleware usa memoria del proceso como almacenamiento.
// Para producción con Docker, PM2 cluster o múltiples réplicas, el estado de rate
// limiting NO se comparte entre procesos. En esos escenarios se recomienda usar
// Redis u otro almacenamiento compartido (por ejemplo: ioredis + rate-limit-redis).

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_RATE_LIMIT_MAX_REQUESTS = 30
const MAX_ATTEMPT_RECORDS = 1000

const loginAttemptsByIp = new Map()

const getClientIp = (req) => {
    const forwardedFor = req.headers['x-forwarded-for']

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
        return forwardedFor.split(',')[0].trim()
    }

    return req.ip || req.socket?.remoteAddress || 'unknown'
}

const cleanupLoginAttempts = () => {
    if (loginAttemptsByIp.size <= MAX_ATTEMPT_RECORDS) return

    const now = Date.now()

    for (const [ip, record] of loginAttemptsByIp.entries()) {
        if (record.resetAt <= now) {
            loginAttemptsByIp.delete(ip)
        }

        if (loginAttemptsByIp.size <= MAX_ATTEMPT_RECORDS) break
    }
}

const loginRateLimit = (req, res, next) => {
    cleanupLoginAttempts()

    const ip = getClientIp(req)
    const now = Date.now()

    const record = loginAttemptsByIp.get(ip) || {
        count: 0,
        resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS
    }

    if (record.resetAt <= now) {
        record.count = 0
        record.resetAt = now + LOGIN_RATE_LIMIT_WINDOW_MS
    }

    record.count += 1
    loginAttemptsByIp.set(ip, record)

    if (record.count > LOGIN_RATE_LIMIT_MAX_REQUESTS) {
        res.set('Retry-After', Math.ceil((record.resetAt - now) / 1000))
        return res.status(429).json({
            mensaje: 'Demasiadas solicitudes. Intente nuevamente más tarde.'
        })
    }

    return next()
}

// apiRateLimit está preparado pero NO aplicado globalmente.
// Para habilitarlo en producción, importar en index.js y usar:
//   app.use('/api', apiRateLimit)
// Se recomienda Redis como backend antes de habilitar esto en producción.
const API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const API_RATE_LIMIT_MAX_REQUESTS = 300
const apiAttemptsByIp = new Map()

const cleanupApiAttempts = () => {
    if (apiAttemptsByIp.size <= MAX_ATTEMPT_RECORDS) return

    const now = Date.now()

    for (const [ip, record] of apiAttemptsByIp.entries()) {
        if (record.resetAt <= now) {
            apiAttemptsByIp.delete(ip)
        }

        if (apiAttemptsByIp.size <= MAX_ATTEMPT_RECORDS) break
    }
}

const apiRateLimit = (req, res, next) => {
    cleanupApiAttempts()

    const ip = getClientIp(req)
    const now = Date.now()

    const record = apiAttemptsByIp.get(ip) || {
        count: 0,
        resetAt: now + API_RATE_LIMIT_WINDOW_MS
    }

    if (record.resetAt <= now) {
        record.count = 0
        record.resetAt = now + API_RATE_LIMIT_WINDOW_MS
    }

    record.count += 1
    apiAttemptsByIp.set(ip, record)

    if (record.count > API_RATE_LIMIT_MAX_REQUESTS) {
        res.set('Retry-After', Math.ceil((record.resetAt - now) / 1000))
        return res.status(429).json({
            mensaje: 'Demasiadas solicitudes. Intente nuevamente más tarde.'
        })
    }

    return next()
}

const REGISTRO_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const REGISTRO_RATE_LIMIT_MAX_REQUESTS = 10
const registroAttemptsByIp = new Map()

const cleanupRegistroAttempts = () => {
    if (registroAttemptsByIp.size <= MAX_ATTEMPT_RECORDS) return

    const now = Date.now()

    for (const [ip, record] of registroAttemptsByIp.entries()) {
        if (record.resetAt <= now) {
            registroAttemptsByIp.delete(ip)
        }

        if (registroAttemptsByIp.size <= MAX_ATTEMPT_RECORDS) break
    }
}

const registroRateLimit = (req, res, next) => {
    cleanupRegistroAttempts()

    const ip = getClientIp(req)
    const now = Date.now()

    const record = registroAttemptsByIp.get(ip) || {
        count: 0,
        resetAt: now + REGISTRO_RATE_LIMIT_WINDOW_MS
    }

    if (record.resetAt <= now) {
        record.count = 0
        record.resetAt = now + REGISTRO_RATE_LIMIT_WINDOW_MS
    }

    record.count += 1
    registroAttemptsByIp.set(ip, record)

    if (record.count > REGISTRO_RATE_LIMIT_MAX_REQUESTS) {
        res.set('Retry-After', Math.ceil((record.resetAt - now) / 1000))
        return res.status(429).json({
            mensaje: 'Demasiadas solicitudes. Intente nuevamente más tarde.'
        })
    }

    return next()
}

module.exports = {
    loginRateLimit,
    apiRateLimit,
    registroRateLimit
}
