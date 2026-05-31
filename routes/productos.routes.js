'use strict';

const router = require('express').Router();
const productos = require('../controllers/productos.controller');
const Authorize = require('../middlewares/auth.middleware');

// GET: api/productos
router.get(
    '/',
    Authorize('Usuario,Administrador'),
    productos.searchValidator,
    productos.getAll
);

// GET: api/productos/5
router.get(
    '/:id',
    Authorize('Usuario,Administrador'),
    productos.idValidator,
    productos.get
);

// POST: api/productos
router.post(
    '/',
    Authorize('Administrador'),
    productos.productoValidator,
    productos.create
);

// PUT: api/productos/5
router.put(
    '/:id',
    Authorize('Administrador'),
    productos.idValidator,
    productos.productoValidator,
    productos.update
);

// DELETE: api/productos/5
router.delete(
    '/:id',
    Authorize('Administrador'),
    productos.idValidator,
    productos.delete
);

// POST: api/productos/5/categoria
router.post(
    '/:id/categoria',
    Authorize('Administrador'),
    productos.idValidator,
    productos.asignaCategoriaValidator,
    productos.asignaCategoria
);

// DELETE: api/productos/5/categoria/1
router.delete(
    '/:id/categoria/:categoriaid',
    Authorize('Administrador'),
    productos.idValidator,
    productos.categoriaParamValidator,
    productos.eliminaCategoria
);

module.exports = router;