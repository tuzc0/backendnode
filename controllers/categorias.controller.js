'use strict';

const { categoria } = require('../models');
const { Op } = require('sequelize');
const { body, param, query, validationResult } = require('express-validator');

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

function parsePositiveInteger(value, fieldName = 'id') {
    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0) {
        throw createHttpError(400, `El campo ${fieldName} debe ser un entero positivo.`);
    }

    return number;
}

function normalizeText(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().replace(/\s+/g, ' ');
}

function sanitizeCategoriaOutput(item) {
    return {
        id: item.id,
        nombre: item.nombre
    };
}

async function safeBitacora(req, action, id) {
    if (typeof req.bitacora !== 'function') {
        return;
    }

    try {
        await req.bitacora(action, id);
    } catch (error) {
        console.error('No se pudo registrar la acción en bitácora.');
    }
}

self.idValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('El id debe ser un número entero positivo.')
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

self.categoriaValidator = [
    body('nombre')
        .exists({ checkFalsy: true })
        .withMessage('El nombre es obligatorio.')
        .bail()
        .isString()
        .withMessage('El nombre debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 2, max: 80 })
        .withMessage('El nombre debe tener entre 2 y 80 caracteres.')
        .bail()
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s.,-]+$/)
        .withMessage('El nombre contiene caracteres no permitidos.'),

    body('id').not().exists().withMessage('No está permitido modificar el id.'),
    body('protegida').not().exists().withMessage('No está permitido modificar el campo protegida.'),
    body('createdAt').not().exists().withMessage('No está permitido modificar createdAt.'),
    body('updatedAt').not().exists().withMessage('No está permitido modificar updatedAt.')
];

// GET: api/categorias
self.getAll = async function (req, res, next) {
    try {
        validateRequest(req);

        const page = req.query.page ? parsePositiveInteger(req.query.page, 'page') : 1;
        const limit = req.query.limit ? parsePositiveInteger(req.query.limit, 'limit') : DEFAULT_LIMIT;

        const safeLimit = Math.min(limit, MAX_LIMIT);
        const offset = (page - 1) * safeLimit;

        const { count, rows } = await categoria.findAndCountAll({
            attributes: ['id', 'nombre'],
            order: [['id', 'ASC']],
            limit: safeLimit,
            offset: offset
        });

        res.status(200).json({
            total: count,
            page: page,
            limit: safeLimit,
            data: rows.map(sanitizeCategoriaOutput)
        });
    } catch (error) {
        next(error);
    }
};

// GET: api/categorias/5
self.get = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await categoria.findByPk(id, {
            attributes: ['id', 'nombre']
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Categoría no encontrada.'
            });
        }

        res.status(200).json(sanitizeCategoriaOutput(data));
    } catch (error) {
        next(error);
    }
};

// POST: api/categorias
self.create = async function (req, res, next) {
    try {
        validateRequest(req);

        const nombre = normalizeText(req.body.nombre);

        const exists = await categoria.findOne({
            where: {
                nombre: nombre
            },
            attributes: ['id']
        });

        if (exists) {
            return res.status(409).json({
                mensaje: 'Ya existe una categoría con ese nombre.'
            });
        }

        const data = await categoria.create({
            nombre: nombre,
            protegida: false
        });

        await safeBitacora(req, 'categoria.crear', data.id);

        res.status(201).json(sanitizeCategoriaOutput(data));
    } catch (error) {
        next(error);
    }
};

// PUT: api/categorias/5
self.update = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);
        const nombre = normalizeText(req.body.nombre);

        const data = await categoria.findByPk(id);

        if (!data) {
            return res.status(404).json({
                mensaje: 'Categoría no encontrada.'
            });
        }

        const duplicated = await categoria.findOne({
            where: {
                nombre: nombre,
                id: {
                    [Op.ne]: id
                }
            },
            attributes: ['id']
        });

        if (duplicated) {
            return res.status(409).json({
                mensaje: 'Ya existe otra categoría con ese nombre.'
            });
        }

        await data.update({
            nombre: nombre
        });

        await safeBitacora(req, 'categoria.editar', id);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// DELETE: api/categorias/5
self.delete = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await categoria.findByPk(id, {
            attributes: ['id', 'protegida']
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Categoría no encontrada.'
            });
        }

        if (data.protegida === true) {
            return res.status(403).json({
                mensaje: 'No se puede eliminar una categoría protegida.'
            });
        }

        const deletedRows = await categoria.destroy({
            where: {
                id: id,
                protegida: false
            }
        });

        if (deletedRows === 0) {
            return res.status(409).json({
                mensaje: 'No se pudo eliminar la categoría.'
            });
        }

        await safeBitacora(req, 'categoria.eliminar', id);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

module.exports = self;