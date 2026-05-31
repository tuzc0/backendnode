'use strict'

const jwt = require('jsonwebtoken')
const ClaimTypes = require('../config/claimtypes')
const { GeneraToken } = require('../services/jwttoken.service')

const jwtSecret = process.env.JWT_SECRET
const JWT_ISSUER = process.env.JWT_ISSUER || 'ServidorFeiJWT'
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ClientesFeiJWT'
const JWT_ALGORITHM = 'HS256'

const MIN_SECRET_LENGTH = 32
const MAX_AUTH_HEADER_LENGTH = 8192
const MAX_TOKEN_LENGTH = 4096
const REFRESH_WINDOW_SECONDS = 5 * 60
const CLOCK_TOLERANCE_SECONDS = 5

const UNAUTHORIZED_MESSAGE = 'Acceso no autorizado'
const FORBIDDEN_MESSAGE = 'Acceso denegado'

if (!jwtSecret || jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET no configurado o inseguro. Debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`)
}

const isNonEmptyString = (value) => {
    return typeof value === 'string' && value.trim().length > 0
}

const setNoCacheHeaders = (res) => {
    res.set('Cache-Control', 'no-store')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
}

const sendUnauthorized = (res) => {
    setNoCacheHeaders(res)
    return res.status(401).json({ mensaje: UNAUTHORIZED_MESSAGE })
}

const sendForbidden = (res) => {
    setNoCacheHeaders(res)
    return res.status(403).json({ mensaje: FORBIDDEN_MESSAGE })
}

const getBearerToken = (req) => {
    if (!req || typeof req.header !== 'function') {
        return null
    }

    const authHeader = req.header('Authorization')

    if (!isNonEmptyString(authHeader)) {
        return null
    }

    if (authHeader.length > MAX_AUTH_HEADER_LENGTH) {
        return null
    }

    const parts = authHeader.trim().split(/\s+/)

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null
    }

    const token = parts[1]

    if (!isNonEmptyString(token) || token.length > MAX_TOKEN_LENGTH) {
        return null
    }

    const jwtFormat = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

    if (!jwtFormat.test(token)) {
        return null
    }

    return token
}

const verifyToken = (token) => {
    return jwt.verify(token, jwtSecret, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        clockTolerance: CLOCK_TOLERANCE_SECONDS
    })
}

const parseAllowedRoles = (roles) => {
    if (Array.isArray(roles)) {
        return new Set(
            roles
                .filter(isNonEmptyString)
                .map(role => role.trim())
        )
    }

    if (isNonEmptyString(roles)) {
        return new Set(
            roles
                .split(',')
                .map(role => role.trim())
                .filter(role => role.length > 0)
        )
    }

    return new Set()
}

const getClaimValue = (decodedToken, claimType) => {
    const value = decodedToken ? decodedToken[claimType] : null

    if (!isNonEmptyString(value)) {
        return null
    }

    return value.trim()
}

const getUserContext = (decodedToken) => {
    const email = getClaimValue(decodedToken, ClaimTypes.Name)
    const nombre = getClaimValue(decodedToken, ClaimTypes.GivenName)
    const rol = getClaimValue(decodedToken, ClaimTypes.Role)

    if (!email || !nombre || !rol) {
        return null
    }

    return {
        email,
        nombre,
        rol,
        exp: decodedToken.exp,
        iat: decodedToken.iat,
        jti: decodedToken.jti || null
    }
}

const isRoleAllowed = (userRole, allowedRoles) => {
    if (!allowedRoles || allowedRoles.size === 0) {
        return true
    }

    if (!isNonEmptyString(userRole)) {
        return false
    }

    return allowedRoles.has(userRole.trim())
}

const shouldRefreshToken = (decodedToken) => {
    if (!decodedToken || typeof decodedToken.exp !== 'number') {
        return false
    }

    const nowInSeconds = Math.floor(Date.now() / 1000)
    const remainingSeconds = decodedToken.exp - nowInSeconds

    return remainingSeconds > 0 && remainingSeconds <= REFRESH_WINDOW_SECONDS
}

const exposeRefreshHeader = (res) => {
    const currentExposeHeader = res.get('Access-Control-Expose-Headers')

    if (!currentExposeHeader) {
        res.set('Access-Control-Expose-Headers', 'Set-Authorization')
        return
    }

    if (!currentExposeHeader.includes('Set-Authorization')) {
        res.set('Access-Control-Expose-Headers', `${currentExposeHeader}, Set-Authorization`)
    }
}

const refreshTokenIfNeeded = (res, decodedToken, userContext) => {
    if (!shouldRefreshToken(decodedToken)) {
        return
    }

    const newToken = GeneraToken(userContext.email, userContext.nombre, userContext.rol)

    if (isNonEmptyString(newToken)) {
        res.set('Set-Authorization', newToken)
        exposeRefreshHeader(res)
    }
}

const isJwtError = (error) => {
    return (
        error instanceof jwt.JsonWebTokenError ||
        error instanceof jwt.TokenExpiredError ||
        error instanceof jwt.NotBeforeError
    )
}

const registerAudit = (req, action, elementId) => {
    try {
        if (req && typeof req.bitacora === 'function') {
            Promise.resolve(req.bitacora(action, elementId)).catch(() => {})
        }
    } catch (error) {
        // La bitácora no debe romper la autorización.
    }
}

const Authorize = (roles) => {
    const allowedRoles = parseAllowedRoles(roles)

    return async (req, res, next) => {
        try {
            setNoCacheHeaders(res)

            const token = getBearerToken(req)

            if (!token) {
                return sendUnauthorized(res)
            }

            const decodedToken = verifyToken(token)
            const userContext = getUserContext(decodedToken)

            if (!userContext) {
                return sendUnauthorized(res)
            }

            req.decodedToken = decodedToken
            req.auth = Object.freeze({
                email: userContext.email,
                nombre: userContext.nombre,
                rol: userContext.rol,
                exp: userContext.exp,
                iat: userContext.iat,
                jti: userContext.jti
            })

            if (!isRoleAllowed(userContext.rol, allowedRoles)) {
                registerAudit(req, 'auth.rol.denegado', userContext.email)
                return sendForbidden(res)
            }

            refreshTokenIfNeeded(res, decodedToken, userContext)

            return next()
        } catch (error) {
            if (isJwtError(error)) {
                return sendUnauthorized(res)
            }

            return next(error)
        }
    }
}

module.exports = Authorize