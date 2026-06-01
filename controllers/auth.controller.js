'use strict'

const bcrypt = require('bcrypt')
const crypto = require('node:crypto')
const { usuario, rol, Sequelize } = require('../models')
const { GeneraToken, TiempoRestanteToken } = require('../services/jwttoken.service')
const { setNoCacheHeaders } = require('../utils/http')
const { isNonEmptyString } = require('../utils/validators')

let self = {}

const AUTH_ERROR_MESSAGE = 'Usuario o contraseña incorrectos.'
const TOO_MANY_ATTEMPTS_MESSAGE = 'Demasiados intentos fallidos. Intente nuevamente más tarde.'

const MAX_EMAIL_LENGTH = 254
const MAX_PASSWORD_LENGTH = 128
const MAX_FAILED_ATTEMPTS = 5
const LOCK_TIME_MS = 15 * 60 * 1000
const MAX_ATTEMPT_RECORDS = 1000

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12)
const FAKE_PASSWORD_HASH = bcrypt.hashSync(crypto.randomUUID(), BCRYPT_SALT_ROUNDS)

const loginAttempts = new Map()

const normalizeEmail = (email) => {
    if (!isNonEmptyString(email)) return null
    return email.trim().toLowerCase()
}

const isValidEmail = (email) => {
    if (!isNonEmptyString(email)) return false

    const normalizedEmail = normalizeEmail(email)

    return (
        normalizedEmail.length <= MAX_EMAIL_LENGTH &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    )
}

const isValidPasswordInput = (password) => {
    return (
        typeof password === 'string' &&
        password.length > 0 &&
        password.length <= MAX_PASSWORD_LENGTH
    )
}

const sanitizeForLog = (value) => {
    if (!isNonEmptyString(value)) return 'sin-dato'

    return value
        .trim()
        .replace(/[\r\n\t]/g, '')
        .slice(0, 150)
}

const getClientIp = (req) => {
    const forwardedFor = req.headers['x-forwarded-for']

    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
        return forwardedFor.split(',')[0].trim()
    }

    return req.ip || req.socket?.remoteAddress || 'unknown'
}

const getAttemptKey = (req, email) => {
    return `${getClientIp(req)}:${email || 'sin-email'}`
}

const cleanupAttemptRecords = () => {
    if (loginAttempts.size <= MAX_ATTEMPT_RECORDS) return

    const now = Date.now()

    for (const [key, record] of loginAttempts.entries()) {
        if (!record.lockedUntil || record.lockedUntil <= now) {
            loginAttempts.delete(key)
        }

        if (loginAttempts.size <= MAX_ATTEMPT_RECORDS) break
    }
}

const isLoginBlocked = (key) => {
    const record = loginAttempts.get(key)

    if (!record) return false

    if (record.lockedUntil && record.lockedUntil > Date.now()) {
        return true
    }

    if (record.lockedUntil && record.lockedUntil <= Date.now()) {
        loginAttempts.delete(key)
    }

    return false
}

const registerFailedAttempt = (key) => {
    cleanupAttemptRecords()

    const now = Date.now()
    const record = loginAttempts.get(key) || {
        count: 0,
        firstAttemptAt: now,
        lockedUntil: null
    }

    record.count += 1

    if (record.count >= MAX_FAILED_ATTEMPTS) {
        record.lockedUntil = now + LOCK_TIME_MS
    }

    loginAttempts.set(key, record)
}

const clearFailedAttempts = (key) => {
    loginAttempts.delete(key)
}

const registerAudit = (req, action, elementId) => {
    try {
        if (req && typeof req.bitacora === 'function') {
            Promise.resolve(req.bitacora(action, sanitizeForLog(elementId))).catch(() => {})
        }
    } catch (error) {
        // No hacer nada, solo evitar que falle el proceso de login por un error en auditoría.
    }
}

const unauthorizedResponse = (res) => {
    setNoCacheHeaders(res)
    return res.status(401).json({ mensaje: AUTH_ERROR_MESSAGE })
}

const tooManyAttemptsResponse = (res) => {
    setNoCacheHeaders(res)
    return res.status(429).json({ mensaje: TOO_MANY_ATTEMPTS_MESSAGE })
}

const getOptionalUserAttributes = () => {
    const attributes = []

    if (usuario.rawAttributes?.activo) {
        attributes.push('activo')
    }

    if (usuario.rawAttributes?.bloqueado) {
        attributes.push('bloqueado')
    }

    if (usuario.rawAttributes?.deletedAt) {
        attributes.push('deletedAt')
    }

    return attributes
}

const isUserAllowedToLogin = (userData) => {
    if (!userData) return false;

    if (Object.hasOwn(userData, 'activo') && userData.activo === false) {
        return false;
    }

    if (Object.hasOwn(userData, 'bloqueado') && userData.bloqueado === true) {
        return false;
    }

    if (Object.hasOwn(userData, 'deletedAt') && userData.deletedAt !== null) {
        return false;
    }

    return true;
};

// POST: api/auth
self.login = async function (req, res, next) {
    const { email, password } = req.body || {}
    const normalizedEmail = normalizeEmail(email)
    const attemptKey = getAttemptKey(req, normalizedEmail)

    try {
        setNoCacheHeaders(res)

        if (isLoginBlocked(attemptKey)) {
            registerAudit(req, 'usuario.login.bloqueado', normalizedEmail)
            return tooManyAttemptsResponse(res)
        }

        if (!isValidEmail(email) || !isValidPasswordInput(password)) {
            registerFailedAttempt(attemptKey)
            registerAudit(req, 'usuario.login.fallido', normalizedEmail)
            return unauthorizedResponse(res)
        }

        const optionalUserAttributes = getOptionalUserAttributes()

        const data = await usuario.findOne({
            where: { email: normalizedEmail },
            raw: true,
            attributes: [
                'id',
                'email',
                'nombre',
                'passwordhash',
                [Sequelize.col('rol.nombre'), 'rol'],
                ...optionalUserAttributes
            ],
            include: [
                {
                    model: rol,
                    attributes: []
                }
            ]
        })

        const passwordHash = data && typeof data.passwordhash === 'string'
            ? data.passwordhash
            : FAKE_PASSWORD_HASH

        const passwordMatch = await bcrypt.compare(password, passwordHash)

        if (!data || !passwordMatch || !isUserAllowedToLogin(data)) {
            registerFailedAttempt(attemptKey)
            registerAudit(req, 'usuario.login.fallido', normalizedEmail)
            return unauthorizedResponse(res)
        }

        if (!isNonEmptyString(data.email) || !isNonEmptyString(data.nombre) || !isNonEmptyString(data.rol)) {
            registerFailedAttempt(attemptKey)
            registerAudit(req, 'usuario.login.fallido', normalizedEmail)
            return unauthorizedResponse(res)
        }

        const token = GeneraToken(data.email, data.nombre, data.rol)

        clearFailedAttempts(attemptKey)
        registerAudit(req, 'usuario.login.exitoso', data.email)

        return res.status(200).json({
            email: data.email,
            nombre: data.nombre,
            rol: data.rol,
            jwt: token
        })
    } catch (error) {
        registerAudit(req, 'usuario.login.error', normalizedEmail)
        return next(error)
    }
}

// GET: api/auth/tiempo
self.tiempo = async function (req, res, next) {
    try {
        setNoCacheHeaders(res)

        const tiempo = TiempoRestanteToken(req)

        if (tiempo === null) {
            return res.status(401).send()
        }

        return res.status(200).send(tiempo)
    } catch (error) {
        return next(error)
    }
}

module.exports = self