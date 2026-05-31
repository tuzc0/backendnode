'use strict';

const router = require('express').Router();
const archivos = require('../controllers/archivos.controller');
const Authorize = require('../middlewares/auth.middleware');
const upload = require('../middlewares/upload.middleware');

// GET: api/archivos
router.get(
    '/',
    Authorize('Administrador'),
    archivos.paginationValidator,
    archivos.getAll
);

// GET: api/archivos/5/detalle
router.get(
    '/:id/detalle',
    Authorize('Administrador'),
    archivos.idValidator,
    archivos.getDetalle
);

// GET: api/archivos/5
router.get(
    '/:id',
    Authorize('Administrador'),
    archivos.idValidator,
    archivos.get
);

// POST: api/archivos
router.post(
    '/',
    Authorize('Administrador'),
    upload.single('file'),
    upload.validateUploadedImage,
    archivos.create
);

// PUT: api/archivos/5
router.put(
    '/:id',
    Authorize('Administrador'),
    archivos.idValidator,
    upload.single('file'),
    upload.validateUploadedImage,
    archivos.update
);

// DELETE: api/archivos/5
router.delete(
    '/:id',
    Authorize('Administrador'),
    archivos.idValidator,
    archivos.delete
);

module.exports = router;