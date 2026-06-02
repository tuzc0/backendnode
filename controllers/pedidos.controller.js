'use strict';

const { pedido, pedidodetalle, producto, usuario, sequelize } = require('../models');
const { body, param, query } = require('express-validator');
const { createHttpError, safeBitacora } = require('../utils/http');
const { validateRequest, parsePositiveInteger, getPagination } = require('../utils/validators');

let self = {};

const MAX_LIMIT = 50;
const MAX_CANTIDAD = 99;

const ESTADOS_PEDIDO = Object.freeze({
    PENDIENTE: 'PENDIENTE',
    EN_PROCESO: 'EN_PROCESO',
    ENVIADO: 'ENVIADO',
    ENTREGADO: 'ENTREGADO',
    CANCELADO: 'CANCELADO'
});

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_PEDIDO));

// --- Helpers privados ---

async function findUsuarioByEmail(email) {
    const u = await usuario.findOne({
        where: { email },
        attributes: ['id', 'email']
    });
    if (!u) throw createHttpError(401, 'Sesión no válida.');
    return u;
}

function sanitizePedidoResumen(p) {
    return {
        id: p.id,
        estado: p.estado,
        total: Number(p.total),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
    };
}

function sanitizeDetalle(d) {
    return {
        id: d.id,
        productoid: d.productoid,
        titulo: d.titulo,
        preciounitario: Number(d.preciounitario),
        cantidad: d.cantidad,
        subtotal: Number(d.subtotal)
    };
}

function sanitizePedidoCompleto(p) {
    return {
        id: p.id,
        estado: p.estado,
        total: Number(p.total),
        detalles: (p.detalles || []).map(sanitizeDetalle),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
    };
}

// --- Validators ---

self.idPedidoValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('El id debe ser un número entero positivo.')
];

self.crearPedidoValidator = [
    body('items')
        .isArray({ min: 1 })
        .withMessage('El carrito no puede estar vacío.'),

    body('items.*.productoId')
        .isInt({ min: 1 })
        .withMessage('Cada productoId debe ser un entero positivo.'),

    body('items.*.cantidad')
        .isInt({ min: 1, max: MAX_CANTIDAD })
        .withMessage(`La cantidad de cada producto debe estar entre 1 y ${MAX_CANTIDAD}.`),

    body('total').not().exists().withMessage('No está permitido enviar el total.'),
    body('precio').not().exists().withMessage('No está permitido enviar el precio.'),
    body('subtotal').not().exists().withMessage('No está permitido enviar el subtotal.'),
    body('usuarioid').not().exists().withMessage('No está permitido enviar el usuarioid.'),
    body('estado').not().exists().withMessage('No está permitido enviar el estado.')
];

self.estadoValidator = [
    body('estado')
        .exists({ checkFalsy: true })
        .withMessage('El estado es obligatorio.')
        .bail()
        .isString()
        .withMessage('El estado debe ser texto.')
        .bail()
        .custom(value => ESTADOS_VALIDOS.has(value))
        .withMessage(`El estado debe ser uno de: ${[...ESTADOS_VALIDOS].join(', ')}.`)
];

self.estadoQueryValidator = [
    query('estado')
        .optional()
        .isIn([...ESTADOS_VALIDOS])
        .withMessage(`El estado debe ser uno de: ${[...ESTADOS_VALIDOS].join(', ')}.`)
];

self.paginationValidator = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('La página debe ser un número entero positivo.'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: MAX_LIMIT })
        .withMessage(`El límite debe estar entre 1 y ${MAX_LIMIT}.`)
];

// --- Controladores ---

// POST /api/pedidos
self.crearPedido = async function (req, res, next) {
    try {
        validateRequest(req);

        const u = await findUsuarioByEmail(req.auth.email);
        const items = req.body.items;

        const productoIds = items.map(i => i.productoId);
        const uniqueIds = new Set(productoIds);
        if (uniqueIds.size !== productoIds.length) {
            return res.status(400).json({ mensaje: 'No se permiten productos duplicados en el carrito.' });
        }

        const productos = await producto.findAll({
            where: { id: productoIds },
            attributes: ['id', 'titulo', 'precio']
        });

        if (productos.length !== productoIds.length) {
            const foundIds = new Set(productos.map(p => p.id));
            const missingId = productoIds.find(id => !foundIds.has(id));
            return res.status(404).json({ mensaje: `Producto con id ${missingId} no encontrado.` });
        }

        const productMap = new Map(productos.map(p => [p.id, p]));

        const detalles = items.map(item => {
            const prod = productMap.get(item.productoId);
            const preciounitario = Number(prod.precio);
            const subtotal = Number((preciounitario * item.cantidad).toFixed(2));
            return {
                productoid: prod.id,
                titulo: prod.titulo,
                preciounitario,
                cantidad: item.cantidad,
                subtotal
            };
        });

        const total = Number(
            detalles.reduce((sum, d) => sum + d.subtotal, 0).toFixed(2)
        );

        const nuevoPedido = await sequelize.transaction(async (transaction) => {
            const pedidoCreado = await pedido.create(
                { usuarioid: u.id, total, estado: ESTADOS_PEDIDO.PENDIENTE },
                { transaction }
            );

            await pedidodetalle.bulkCreate(
                detalles.map(d => ({ ...d, pedidoid: pedidoCreado.id })),
                { transaction }
            );

            return pedidoCreado;
        });

        await safeBitacora(req, 'pedido.crear', nuevoPedido.id);

        res.status(201).json({
            id: nuevoPedido.id,
            estado: nuevoPedido.estado,
            total: Number(nuevoPedido.total),
            items: detalles.map(d => ({
                productoid: d.productoid,
                titulo: d.titulo,
                preciounitario: d.preciounitario,
                cantidad: d.cantidad,
                subtotal: d.subtotal
            })),
            createdAt: nuevoPedido.createdAt
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/pedidos/mios
self.getMisPedidos = async function (req, res, next) {
    try {
        validateRequest(req);

        const u = await findUsuarioByEmail(req.auth.email);
        const { page, limit, offset } = getPagination(req);

        const { count, rows } = await pedido.findAndCountAll({
            where: { usuarioid: u.id },
            attributes: ['id', 'estado', 'total', 'createdAt', 'updatedAt'],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        res.status(200).json({
            total: count,
            page,
            limit,
            data: rows.map(sanitizePedidoResumen)
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/pedidos/:id
self.getPedido = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await pedido.findByPk(id, {
            attributes: ['id', 'usuarioid', 'estado', 'total', 'createdAt', 'updatedAt'],
            include: [
                {
                    model: pedidodetalle,
                    as: 'detalles',
                    attributes: ['id', 'productoid', 'titulo', 'preciounitario', 'cantidad', 'subtotal']
                }
            ]
        });

        if (!data) {
            return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
        }

        if (req.auth.rol === 'Usuario') {
            const u = await findUsuarioByEmail(req.auth.email);
            if (data.usuarioid !== u.id) {
                await safeBitacora(req, 'pedido.acceso.denegado', String(id));
                return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
            }
        }

        res.status(200).json(sanitizePedidoCompleto(data));
    } catch (error) {
        next(error);
    }
};

// GET /api/pedidos — solo Administrador
self.getAllPedidos = async function (req, res, next) {
    try {
        validateRequest(req);

        const { page, limit, offset } = getPagination(req);

        const where = {};
        if (req.query.estado && ESTADOS_VALIDOS.has(req.query.estado)) {
            where.estado = req.query.estado;
        }

        const { count, rows } = await pedido.findAndCountAll({
            where,
            attributes: ['id', 'usuarioid', 'estado', 'total', 'createdAt', 'updatedAt'],
            include: [
                {
                    model: usuario,
                    as: 'usuario',
                    attributes: ['email', 'nombre']
                }
            ],
            order: [['createdAt', 'DESC']],
            distinct: true,
            limit,
            offset
        });

        res.status(200).json({
            total: count,
            page,
            limit,
            data: rows.map(p => ({
                id: p.id,
                estado: p.estado,
                total: Number(p.total),
                usuario: p.usuario ? { email: p.usuario.email, nombre: p.usuario.nombre } : null,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            }))
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/pedidos/:id/estado — solo Administrador
self.cambiarEstado = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);
        const nuevoEstado = req.body.estado;

        const data = await pedido.findByPk(id, {
            attributes: ['id', 'estado', 'total', 'createdAt', 'updatedAt']
        });

        if (!data) {
            return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
        }

        await data.update({ estado: nuevoEstado });

        await safeBitacora(req, 'pedido.estado.cambiar', `${id}:${nuevoEstado}`);

        res.status(200).json({
            id: data.id,
            estado: data.estado,
            total: Number(data.total),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        });
    } catch (error) {
        next(error);
    }
};

module.exports = self;
