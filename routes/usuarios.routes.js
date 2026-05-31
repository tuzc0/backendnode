'use strict';

const router = require('express').Router();
const usuarios = require('../controllers/usuarios.controller');
const Authorize = require('../middlewares/auth.middleware');

// GET: api/usuarios
router.get(
    '/',
    Authorize('Administrador'),
    usuarios.paginationValidator,
    usuarios.getAll
);

// GET: api/usuarios/email
router.get(
    '/:email',
    Authorize('Administrador'),
    usuarios.emailParamValidator,
    usuarios.get
);

// POST: api/usuarios
router.post(
    '/',
    Authorize('Administrador'),
    usuarios.usuarioCreateValidator,
    usuarios.create
);

// PUT: api/usuarios/email
router.put(
    '/:email',
    Authorize('Administrador'),
    usuarios.emailParamValidator,
    usuarios.usuarioUpdateValidator,
    usuarios.update
);

// DELETE: api/usuarios/email
router.delete(
    '/:email',
    Authorize('Administrador'),
    usuarios.emailParamValidator,
    usuarios.delete
);

module.exports = router;