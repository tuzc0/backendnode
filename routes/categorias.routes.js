'use strict'

const router = require('express').Router()
const categorias = require('../controllers/categorias.controller')
const Authorize = require('../middlewares/auth.middleware')

const ROLES = Object.freeze({
    USUARIO: 'Usuario',
    ADMINISTRADOR: 'Administrador'
})

const asyncHandler = (handler) => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next)
    }
}

const methodNotAllowed = (req, res) => {
    return res.status(405).json({
        mensaje: 'Método no permitido.'
    })
}

// GET: api/categorias
router.get(
    '/',
    Authorize([ROLES.USUARIO, ROLES.ADMINISTRADOR]),
    categorias.paginationValidator,
    asyncHandler(categorias.getAll)
)

// GET: api/categorias/:id
router.get(
    '/:id',
    Authorize([ROLES.USUARIO, ROLES.ADMINISTRADOR]),
    categorias.idValidator,
    asyncHandler(categorias.get)
)

// POST: api/categorias
router.post(
    '/',
    Authorize([ROLES.ADMINISTRADOR]),
    categorias.categoriaValidator,
    asyncHandler(categorias.create)
)

// PUT: api/categorias/:id
router.put(
    '/:id',
    Authorize([ROLES.ADMINISTRADOR]),
    categorias.idValidator,
    categorias.categoriaValidator,
    asyncHandler(categorias.update)
)

// DELETE: api/categorias/:id
router.delete(
    '/:id',
    Authorize([ROLES.ADMINISTRADOR]),
    categorias.idValidator,
    asyncHandler(categorias.delete)
)

// Métodos no permitidos
router.all('/', methodNotAllowed)
router.all('/:id', methodNotAllowed)

module.exports = router