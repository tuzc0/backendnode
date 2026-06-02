'use strict';

const router = require('express').Router();
const pedidos = require('../controllers/pedidos.controller');
const Authorize = require('../middlewares/auth.middleware');

const ROLES = Object.freeze({
    USUARIO: 'Usuario',
    ADMINISTRADOR: 'Administrador'
});

const asyncHandler = (handler) => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};

const methodNotAllowed = (req, res) => {
    return res.status(405).json({ mensaje: 'Método no permitido.' });
};

// POST /api/pedidos — crear pedido (Usuario)
router.post(
    '/',
    Authorize([ROLES.USUARIO]),
    pedidos.crearPedidoValidator,
    asyncHandler(pedidos.crearPedido)
);

// GET /api/pedidos/mios — mis pedidos (Usuario)
// Debe registrarse ANTES de /:id para que 'mios' no sea capturado como parámetro
router.get(
    '/mios',
    Authorize([ROLES.USUARIO]),
    pedidos.paginationValidator,
    asyncHandler(pedidos.getMisPedidos)
);

// GET /api/pedidos — todos los pedidos (Administrador)
router.get(
    '/',
    Authorize([ROLES.ADMINISTRADOR]),
    pedidos.paginationValidator,
    pedidos.estadoQueryValidator,
    asyncHandler(pedidos.getAllPedidos)
);

// GET /api/pedidos/:id — detalle de pedido (Usuario o Administrador)
router.get(
    '/:id',
    Authorize([ROLES.USUARIO, ROLES.ADMINISTRADOR]),
    pedidos.idPedidoValidator,
    asyncHandler(pedidos.getPedido)
);

// PATCH /api/pedidos/:id/estado — cambiar estado (Administrador)
router.patch(
    '/:id/estado',
    Authorize([ROLES.ADMINISTRADOR]),
    pedidos.idPedidoValidator,
    pedidos.estadoValidator,
    asyncHandler(pedidos.cambiarEstado)
);

// Métodos no permitidos
router.all('/', methodNotAllowed);
router.all('/mios', methodNotAllowed);
router.all('/:id/estado', methodNotAllowed);
router.all('/:id', methodNotAllowed);

module.exports = router;
