'use strict';

const { rol } = require('../models');
const { query, validationResult } = require('express-validator');

let self = {};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function validateRequest(req) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const error = createHttpError(400, 'Datos de entrada inválidos.');
        error.details = errors.array();
        throw error;
    }
}

function parsePositiveInteger(value, fieldName) {
    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0) {
        throw createHttpError(400, `El campo ${fieldName} debe ser un entero positivo.`);
    }

    return number;
}

function sanitizeRoleOutput(item) {
    return {
        id: item.id,
        nombre: item.nombre
    };
}

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

// GET: api/roles
self.getAll = async function (req, res, next) {
    try {
        validateRequest(req);

        const page = req.query.page ? parsePositiveInteger(req.query.page, 'page') : 1;
        const limit = req.query.limit ? parsePositiveInteger(req.query.limit, 'limit') : DEFAULT_LIMIT;
        const safeLimit = Math.min(limit, MAX_LIMIT);
        const offset = (page - 1) * safeLimit;

        const { count, rows } = await rol.findAndCountAll({
            attributes: ['id', 'nombre'],
            order: [['nombre', 'ASC']],
            limit: safeLimit,
            offset: offset
        });

        res.status(200).json({
            total: count,
            page: page,
            limit: safeLimit,
            data: rows.map(sanitizeRoleOutput)
        });
    } catch (error) {
        next(error);
    }
};

module.exports = self;