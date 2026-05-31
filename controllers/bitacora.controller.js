'use strict';

const { bitacora } = require('../models');
const { Op } = require('sequelize');
const { query } = require('express-validator');
const { createHttpError } = require('../utils/http');
const { validateRequest, parsePositiveInteger, normalizeText } = require('../utils/validators');

let self = {};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const ALLOWED_SORT_DIRECTIONS = ['ASC', 'DESC'];

function parseDate(value, fieldName) {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw createHttpError(400, `El campo ${fieldName} debe ser una fecha válida.`);
    }

    return date;
}

function sanitizeBitacoraOutput(item) {
    return {
        id: item.id,
        accion: item.accion,
        elementoid: item.elementoid,
        ip: item.ip,
        usuario: item.usuario,
        fecha: item.fecha
    };
}

function buildWhere(req) {
    const where = {};

    const usuario = normalizeText(req.query.usuario || '');
    const accion = normalizeText(req.query.accion || '');
    const fechaInicio = parseDate(req.query.fechaInicio, 'fechaInicio');
    const fechaFin = parseDate(req.query.fechaFin, 'fechaFin');

    if (usuario) {
        where.usuario = {
            [Op.like]: `%${usuario}%`
        };
    }

    if (accion) {
        where.accion = {
            [Op.like]: `%${accion}%`
        };
    }

    if (fechaInicio || fechaFin) {
        where.fecha = {};

        if (fechaInicio) {
            where.fecha[Op.gte] = fechaInicio;
        }

        if (fechaFin) {
            where.fecha[Op.lte] = fechaFin;
        }
    }

    return where;
}

self.bitacoraQueryValidator = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('La página debe ser un número entero positivo.'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: MAX_LIMIT })
        .withMessage(`El límite debe estar entre 1 y ${MAX_LIMIT}.`),

    query('usuario')
        .optional()
        .isString()
        .withMessage('El usuario debe ser texto.')
        .bail()
        .trim()
        .isLength({ max: 150 })
        .withMessage('El usuario no debe superar 150 caracteres.')
        .bail()
        .custom((value) => !/[<>]/.test(value))
        .withMessage('El usuario contiene caracteres no permitidos.'),

    query('accion')
        .optional()
        .isString()
        .withMessage('La acción debe ser texto.')
        .bail()
        .trim()
        .isLength({ max: 100 })
        .withMessage('La acción no debe superar 100 caracteres.')
        .bail()
        .custom((value) => !/[<>]/.test(value))
        .withMessage('La acción contiene caracteres no permitidos.'),

    query('fechaInicio')
        .optional()
        .isISO8601()
        .withMessage('fechaInicio debe tener formato de fecha válido.'),

    query('fechaFin')
        .optional()
        .isISO8601()
        .withMessage('fechaFin debe tener formato de fecha válido.'),

    query('orden')
        .optional()
        .isIn(ALLOWED_SORT_DIRECTIONS)
        .withMessage('El orden solo puede ser ASC o DESC.')
];

// GET: api/bitacora
self.getAll = async function (req, res, next) {
    try {
        validateRequest(req);

        const page = req.query.page ? parsePositiveInteger(req.query.page, 'page') : 1;
        const limit = req.query.limit ? parsePositiveInteger(req.query.limit, 'limit') : DEFAULT_LIMIT;
        const safeLimit = Math.min(limit, MAX_LIMIT);
        const offset = (page - 1) * safeLimit;
        const orderDirection = req.query.orden || 'DESC';

        const where = buildWhere(req);

        const { count, rows } = await bitacora.findAndCountAll({
            attributes: ['id', 'accion', 'elementoid', 'ip', 'usuario', 'fecha'],
            where: where,
            order: [['id', orderDirection]],
            limit: safeLimit,
            offset: offset
        });

        res.status(200).json({
            total: count,
            page: page,
            limit: safeLimit,
            data: rows.map(sanitizeBitacoraOutput)
        });
    } catch (error) {
        next(error);
    }
};

module.exports = self;
