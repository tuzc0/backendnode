'use strict'

const bcrypt = require('bcrypt')
const crypto = require('node:crypto')
const { body } = require('express-validator')
const { usuario, rol, Sequelize, sequelize } = require('../models')
const { GeneraToken, TiempoRestanteToken } = require('../services/jwttoken.service')
const { setNoCacheHeaders, createHttpError, safeBitacora } = require('../utils/http')
const { isNonEmptyString, validateRequest, normalizeText } = require('../utils/validators')

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

const USUARIO_ROLE_NAME = 'Usuario'

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

self.registroPublicoValidator = [
    body('email')
        .exists({ checkFalsy: true })
        .withMessage('El email es obligatorio.')
        .bail()
        .isEmail()
        .withMessage('El email no tiene un formato válido.')
        .bail()
        .isLength({ max: 150 })
        .withMessage('El email no debe superar 150 caracteres.'),

    body('password')
        .exists({ checkFalsy: true })
        .withMessage('La contraseña es obligatoria.')
        .bail()
        .isString()
        .withMessage('La contraseña debe ser texto.')
        .bail()
        .isLength({ min: 8, max: 72 })
        .withMessage('La contraseña debe tener entre 8 y 72 caracteres.')
        .bail()
        .matches(/[a-z]/)
        .withMessage('La contraseña debe tener al menos una minúscula.')
        .bail()
        .matches(/[A-Z]/)
        .withMessage('La contraseña debe tener al menos una mayúscula.')
        .bail()
        .matches(/\d/)
        .withMessage('La contraseña debe tener al menos un número.'),

    body('nombre')
        .exists({ checkFalsy: true })
        .withMessage('El nombre es obligatorio.')
        .bail()
        .isString()
        .withMessage('El nombre debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 2, max: 120 })
        .withMessage('El nombre debe tener entre 2 y 120 caracteres.')
        .bail()
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s.'-]+$/)
        .withMessage('El nombre contiene caracteres no permitidos.'),

    body('rol').not().exists().withMessage('No está permitido enviar el campo rol.'),
    body('id').not().exists().withMessage('No está permitido enviar id.'),
    body('passwordhash').not().exists().withMessage('No está permitido enviar passwordhash.'),
    body('rolid').not().exists().withMessage('No está permitido enviar rolid.'),
    body('protegido').not().exists().withMessage('No está permitido enviar protegido.')
]

// POST: api/auth/registro
self.registro = async function (req, res, next) {
    try {
        validateRequest(req)

        const email = normalizeEmail(req.body.email)
        const nombre = normalizeText(req.body.nombre)
        const password = req.body.password

        const roleData = await rol.findOne({
            where: { nombre: USUARIO_ROLE_NAME },
            attributes: ['id', 'nombre']
        })

        if (!roleData) {
            return next(createHttpError(500, 'Error interno al procesar la solicitud.'))
        }

        const exists = await usuario.findOne({
            where: { email: email },
            attributes: ['id']
        })

        if (exists) {
            await safeBitacora(req, 'usuario.registro.duplicado', email)
            return res.status(409).json({
                mensaje: 'Ya existe una cuenta con ese correo.'
            })
        }

        const passwordhash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)

        const newUser = await sequelize.transaction(async (transaction) => {
            return await usuario.create(
                {
                    id: crypto.randomUUID(),
                    email: email,
                    passwordhash: passwordhash,
                    nombre: nombre,
                    rolid: roleData.id,
                    protegido: false
                },
                { transaction }
            )
        })

        await safeBitacora(req, 'usuario.registro.exitoso', newUser.email)

        return res.status(201).json({
            id: newUser.id,
            email: newUser.email,
            nombre: newUser.nombre,
            rol: roleData.nombre
        })
    } catch (error) {
        return next(error)
    }
}

module.exports = self