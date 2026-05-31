'use strict';

const { rol } = require('../models');
const { query } = require('express-validator');
const { validateRequest, parsePositiveInteger } = require('../utils/validators');

let self = {};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

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