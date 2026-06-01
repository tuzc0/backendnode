'use strict'

const router = require('express').Router()
const auth = require('../controllers/auth.controller')
const Authorize = require('../middlewares/auth.middleware')
const { loginRateLimit, registroRateLimit } = require('../middlewares/rateLimit.middleware')

const ROLES = Object.freeze({
    USUARIO: 'Usuario',
    ADMINISTRADOR: 'Administrador'
})

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

// POST: api/auth/registro
router
    .route('/registro')
    .post(
        registroRateLimit,
        requireJsonContentType,
        auth.registroPublicoValidator,
        asyncHandler(auth.registro)
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