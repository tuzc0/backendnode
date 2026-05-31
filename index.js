'use strict'

const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config()

const app = express()

const SERVER_PORT = Number(process.env.SERVER_PORT || 3000)
const NODE_ENV = process.env.NODE_ENV || 'development'

const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:8080',
    'http://localhost:8081'
]

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0)

const corsOrigins = allowedOrigins.length > 0
    ? allowedOrigins
    : DEFAULT_ALLOWED_ORIGINS

if (!Number.isInteger(SERVER_PORT) || SERVER_PORT < 1 || SERVER_PORT > 65535) {
    throw new Error('SERVER_PORT no configurado correctamente.')
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET no configurado o inseguro. Debe tener al menos 32 caracteres.')
}

app.disable('x-powered-by')
app.set('trust proxy', 1)

// Headers básicos de seguridad
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-XSS-Protection', '0')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')

    if (NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    next()
})

// CORS controlado
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true)
        }

        if (corsOrigins.includes(origin)) {
            return callback(null, true)
        }

        return callback(new Error('Origen no permitido por CORS.'))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Authorization'],
    credentials: false,
    optionsSuccessStatus: 204
}

app.use(cors(corsOptions))

// CORRECCIÓN PARA EXPRESS NUEVO
app.options(/.*/, cors(corsOptions))

app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: false, limit: '50kb' }))

// Swagger
if (NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerUi = require('swagger-ui-express')
    const swaggerFile = require('./swagger-output.json')

    app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerFile, {
        explorer: false,
        customSiteTitle: 'Backend API'
    }))
}

// Bitácora
app.use(require('./middlewares/bitacora.middleware'))

// Health check (público, sin autenticación)
app.use('/health', require('./routes/health.routes'))

// Rutas
app.use('/api/categorias', require('./routes/categorias.routes'))
app.use('/api/productos', require('./routes/productos.routes'))
app.use('/api/usuarios', require('./routes/usuarios.routes'))
app.use('/api/roles', require('./routes/roles.routes'))
app.use('/api/auth', require('./routes/auth.routes'))
app.use('/api/archivos', require('./routes/archivos.routes'))
app.use('/api/bitacora', require('./routes/bitacora.routes'))

app.get('/', (req, res) => {
    res.status(200).json({
        mensaje: 'API disponible'
    })
})

app.use((req, res) => {
    res.status(404).json({
        mensaje: 'Recurso no encontrado'
    })
})

const errorhandler = require('./middlewares/errorhandler.middleware')
app.use(errorhandler)

app.listen(SERVER_PORT, () => {
    console.log(`Aplicación escuchando en el puerto ${SERVER_PORT}`)
})