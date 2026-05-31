'use strict'

const router = require('express').Router()
const auth = require('../controllers/auth.controller')
const Authorize = require('../middlewares/auth.middleware')

const ROLES = Object.freeze({
    USUARIO: 'Usuario',
    ADMINISTRADOR: 'Administrador'
})

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_RATE_LIMIT_MAX_REQUESTS = 30
const MAX_ATTEMPT_RECORDS = 1000

const loginAttemptsByIp = new Map()

const asyncHandler = (handler) => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next)
    }
}

const setNoCacheHeaders = (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.set('X-Content-Type-Options', 'nosniff')
    next()
}

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

const requireJsonContentType = (req, res, next) => {
    if (!req.is('application/json')) {
        return res.status(415).json({
            mensaje: 'El contenido debe enviarse en formato JSON.'
        })
    }

    return next()
}

const isPlainObject = (value) => {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    )
}

const isNonEmptyString = (value) => {
    return typeof value === 'string' && value.trim().length > 0
}

const validateLoginBody = (req, res, next) => {
    if (!isPlainObject(req.body)) {
        return res.status(400).json({
            mensaje: 'Solicitud inválida.'
        })
    }

    const { email, password } = req.body

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
        return res.status(400).json({
            mensaje: 'Solicitud inválida.'
        })
    }

    if (email.length > 254 || password.length > 128) {
        return res.status(400).json({
            mensaje: 'Solicitud inválida.'
        })
    }

    return next()
}

const methodNotAllowed = (req, res) => {
    return res.status(405).json({
        mensaje: 'Método no permitido.'
    })
}

router.use(setNoCacheHeaders)

// POST: api/auth
router
    .route('/')
    .post(
        loginRateLimit,
        requireJsonContentType,
        validateLoginBody,
        asyncHandler(auth.login)
    )
    .all(methodNotAllowed)

// GET: api/auth/tiempo
router
    .route('/tiempo')
    .get(
        Authorize([ROLES.USUARIO, ROLES.ADMINISTRADOR]),
        asyncHandler(auth.tiempo)
    )
    .all(methodNotAllowed)

module.exports = router