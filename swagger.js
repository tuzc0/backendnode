'use strict'

require('dotenv').config()

const swaggerAutogen = require('swagger-autogen')()

const NODE_ENV = process.env.NODE_ENV || 'development'

const API_TITLE = process.env.API_TITLE || 'Backend Node.js API'
const API_DESCRIPTION = process.env.API_DESCRIPTION || 'API REST segura con autenticación JWT, autorización por roles y bitácora.'
const API_VERSION = process.env.API_VERSION || '1.0.0'

const API_HOST = process.env.API_HOST || 'localhost:3000'
const API_SCHEME = process.env.API_SCHEME || (NODE_ENV === 'production' ? 'https' : 'http')

const outputFile = './swagger-output.json'
const routes = ['./index.js']

const allowedSchemes = ['http', 'https']

if (!allowedSchemes.includes(API_SCHEME)) {
    throw new Error('API_SCHEME debe ser http o https.')
}

if (!API_HOST || API_HOST.trim().length === 0) {
    throw new Error('API_HOST no configurado correctamente.')
}

const doc = {
    info: {
        title: API_TITLE,
        description: API_DESCRIPTION,
        version: API_VERSION
    },
    host: API_HOST,
    basePath: '/',
    schemes: [API_SCHEME],
    consumes: ['application/json'],
    produces: ['application/json'],

    securityDefinitions: {
        Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Ingrese el token JWT con el formato: Bearer <token>'
        }
    },

    security: [
        {
            Bearer: []
        }
    ],

    tags: [
        {
            name: 'Auth',
            description: 'Autenticación, JWT y tiempo restante de sesión.'
        },
        {
            name: 'Usuarios',
            description: 'Gestión de usuarios.'
        },
        {
            name: 'Roles',
            description: 'Consulta de roles.'
        },
        {
            name: 'Categorias',
            description: 'Gestión de categorías.'
        },
        {
            name: 'Productos',
            description: 'Gestión de productos.'
        },
        {
            name: 'Archivos',
            description: 'Gestión de archivos multimedia.'
        },
        {
            name: 'Bitacora',
            description: 'Consulta de auditoría del sistema.'
        },
        {
            name: 'Pedidos',
            description: 'Gestión de pedidos y checkout.'
        }
    ],

    definitions: {
        LoginRequest: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
                email: {
                    type: 'string',
                    example: 'usuario@correo.com'
                },
                password: {
                    type: 'string',
                    minLength: 8,
                    maxLength: 128,
                    description: 'Contraseña del usuario. No colocar contraseñas reales en la documentación.'
                }
            }
        },
        LoginResponse: {
            type: 'object',
            properties: {
                email: {
                    type: 'string',
                    example: 'usuario@correo.com'
                },
                nombre: {
                    type: 'string',
                    example: 'Nombre del usuario'
                },
                rol: {
                    type: 'string',
                    example: 'Usuario'
                },
                jwt: {
                    type: 'string',
                    example: 'token.jwt.generado'
                }
            }
        },
        ErrorResponse: {
            type: 'object',
            properties: {
                mensaje: {
                    type: 'string',
                    example: 'Descripción genérica del error.'
                }
            }
        }
    }
}

swaggerAutogen(outputFile, routes, doc).then(() => {
    console.log(`Documentación Swagger generada correctamente en ${outputFile}`)
})