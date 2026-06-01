'use strict';

const { producto, categoria, archivo, sequelize } = require('../models');
const { Op } = require('sequelize');
const { body, param, query } = require('express-validator');
const { createHttpError, safeBitacora } = require('../utils/http');
const { validateRequest, parsePositiveInteger, normalizeText, getPagination } = require('../utils/validators');

let self = {};

const MAX_LIMIT = 50;
const MAX_PRICE = 999999.99;

function normalizeOptionalInteger(value, fieldName) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    return parsePositiveInteger(value, fieldName);
}

function normalizePrice(value) {
    const price = Number(value);

    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
        throw createHttpError(400, 'El precio debe ser un número válido mayor a 0.');
    }

    return Number(price.toFixed(2));
}

function sanitizeProductoOutput(item) {
    return {
        id: item.id,
        titulo: item.titulo,
        descripcion: item.descripcion,
        precio: Number(item.precio),
        archivoid: item.archivoid || null,
        categorias: item.categorias
            ? item.categorias.map((cat) => ({
                id: cat.id,
                nombre: cat.nombre
            }))
            : []
    };
}

async function validateArchivoExists(archivoid) {
    if (!archivoid) {
        return;
    }

    const exists = await archivo.findByPk(archivoid, {
        attributes: ['id']
    });

    if (!exists) {
        throw createHttpError(400, 'El archivo indicado no existe.');
    }
}

self.idValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('El id debe ser un número entero positivo.')
];

self.categoriaParamValidator = [
    param('categoriaid')
        .isInt({ min: 1 })
        .withMessage('El id de categoría debe ser un número entero positivo.')
];

self.searchValidator = [
    query('s')
        .optional()
        .isString()
        .withMessage('El parámetro de búsqueda debe ser texto.')
        .bail()
        .trim()
        .isLength({ max: 80 })
        .withMessage('El parámetro de búsqueda no debe superar 80 caracteres.')
        .bail()
        .custom((value) => !/[<>]/.test(value))
        .withMessage('El parámetro de búsqueda contiene caracteres no permitidos.'),

    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('La página debe ser un número entero positivo.'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: MAX_LIMIT })
        .withMessage(`El límite debe estar entre 1 y ${MAX_LIMIT}.`)
];

self.productoValidator = [
    body('titulo')
        .exists({ checkFalsy: true })
        .withMessage('El título es obligatorio.')
        .bail()
        .isString()
        .withMessage('El título debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 2, max: 150 })
        .withMessage('El título debe tener entre 2 y 150 caracteres.')
        .bail()
        .custom((value) => !/[<>]/.test(value))
        .withMessage('El título contiene caracteres no permitidos.'),

    body('descripcion')
        .exists({ checkFalsy: true })
        .withMessage('La descripción es obligatoria.')
        .bail()
        .isString()
        .withMessage('La descripción debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 5, max: 1000 })
        .withMessage('La descripción debe tener entre 5 y 1000 caracteres.')
        .bail()
        .custom((value) => !/[<>]/.test(value))
        .withMessage('La descripción contiene caracteres no permitidos.'),

    body('precio')
        .exists({ checkFalsy: true })
        .withMessage('El precio es obligatorio.')
        .bail()
        .isFloat({ gt: 0, max: MAX_PRICE })
        .withMessage(`El precio debe ser mayor a 0 y menor o igual a ${MAX_PRICE}.`),

    body('archivoid')
        .optional({ nullable: true })
        .isInt({ min: 1 })
        .withMessage('El archivoid debe ser un número entero positivo.'),

    body('id').not().exists().withMessage('No está permitido modificar el id.'),
    body('createdAt').not().exists().withMessage('No está permitido modificar createdAt.'),
    body('updatedAt').not().exists().withMessage('No está permitido modificar updatedAt.'),
    body('categorias').not().exists().withMessage('No está permitido modificar categorías desde este endpoint.'),
    body('categoriaid').not().exists().withMessage('Use el endpoint de asignación de categoría.')
];

self.asignaCategoriaValidator = [
    body('categoriaid')
        .exists({ checkFalsy: true })
        .withMessage('El categoriaid es obligatorio.')
        .bail()
        .isInt({ min: 1 })
        .withMessage('El categoriaid debe ser un número entero positivo.')
];

// GET: api/productos
self.getAll = async function (req, res, next) {
    try {
        validateRequest(req);

        const { page, limit, offset } = getPagination(req);
        const search = normalizeText(req.query.s || '');

        const where = {};

        if (search) {
            where.titulo = {
                [Op.like]: `%${search}%`
            };
        }

        const { count, rows } = await producto.findAndCountAll({
            attributes: ['id', 'titulo', 'descripcion', 'precio', 'archivoid'],
            where,
            include: [
                {
                    model: categoria,
                    as: 'categorias',
                    attributes: ['id', 'nombre'],
                    through: {
                        attributes: []
                    }
                }
            ],
            order: [['id', 'ASC']],
            distinct: true,
            limit,
            offset
        });

        res.status(200).json({
            total: count,
            page,
            limit,
            data: rows.map(sanitizeProductoOutput)
        });
    } catch (error) {
        next(error);
    }
};

// GET: api/productos/5
self.get = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await producto.findByPk(id, {
            attributes: ['id', 'titulo', 'descripcion', 'precio', 'archivoid'],
            include: [
                {
                    model: categoria,
                    as: 'categorias',
                    attributes: ['id', 'nombre'],
                    through: {
                        attributes: []
                    }
                }
            ]
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Producto no encontrado.'
            });
        }

        res.status(200).json(sanitizeProductoOutput(data));
    } catch (error) {
        next(error);
    }
};

// POST: api/productos
self.create = async function (req, res, next) {
    try {
        validateRequest(req);

        const titulo = normalizeText(req.body.titulo);
        const descripcion = normalizeText(req.body.descripcion);
        const precio = normalizePrice(req.body.precio);
        const archivoid = normalizeOptionalInteger(req.body.archivoid, 'archivoid');

        await validateArchivoExists(archivoid);

        const exists = await producto.findOne({
            where: {
                titulo
            },
            attributes: ['id']
        });

        if (exists) {
            return res.status(409).json({
                mensaje: 'Ya existe un producto con ese título.'
            });
        }

        const data = await sequelize.transaction(async (transaction) => {
            return await producto.create(
                {
                    titulo,
                    descripcion,
                    precio,
                    archivoid
                },
                { transaction }
            );
        });

        await safeBitacora(req, 'producto.crear', data.id);

        res.status(201).json(sanitizeProductoOutput(data));
    } catch (error) {
        next(error);
    }
};

// PUT: api/productos/5
self.update = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);
        const titulo = normalizeText(req.body.titulo);
        const descripcion = normalizeText(req.body.descripcion);
        const precio = normalizePrice(req.body.precio);

        const data = await producto.findByPk(id);

        if (!data) {
            return res.status(404).json({
                mensaje: 'Producto no encontrado.'
            });
        }

        const duplicated = await producto.findOne({
            where: {
                titulo,
                id: {
                    [Op.ne]: id
                }
            },
            attributes: ['id']
        });

        if (duplicated) {
            return res.status(409).json({
                mensaje: 'Ya existe otro producto con ese título.'
            });
        }

        const updateData = {
            titulo,
            descripcion,
            precio
        };

        if (Object.hasOwn(req.body, 'archivoid')) {
            const archivoid = normalizeOptionalInteger(req.body.archivoid, 'archivoid');
            await validateArchivoExists(archivoid);
            updateData.archivoid = archivoid;
        }

        await sequelize.transaction(async (transaction) => {
            await data.update(updateData, { transaction });
        });

        await safeBitacora(req, 'producto.editar', id);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// DELETE: api/productos/5
self.delete = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await producto.findByPk(id, {
            attributes: ['id']
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Producto no encontrado.'
            });
        }

        await sequelize.transaction(async (transaction) => {
            await producto.destroy({
                where: { id },
                transaction
            });
        });

        await safeBitacora(req, 'producto.eliminar', id);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// POST: api/productos/5/categoria
self.asignaCategoria = async function (req, res, next) {
    try {
        validateRequest(req);

        const productoid = parsePositiveInteger(req.params.id, 'id');
        const categoriaid = parsePositiveInteger(req.body.categoriaid, 'categoriaid');

        const itemProducto = await producto.findByPk(productoid);
        if (!itemProducto) {
            return res.status(404).json({
                mensaje: 'Producto no encontrado.'
            });
        }

        const itemCategoria = await categoria.findByPk(categoriaid);
        if (!itemCategoria) {
            return res.status(404).json({
                mensaje: 'Categoría no encontrada.'
            });
        }

        const categoriasAsignadas = await itemProducto.getCategorias({
            where: { id: categoriaid },
            attributes: ['id'],
            joinTableAttributes: []
        });

        if (categoriasAsignadas.length > 0) {
            return res.status(409).json({
                mensaje: 'La categoría ya está asignada a este producto.'
            });
        }

        await sequelize.transaction(async (transaction) => {
            await itemProducto.addCategoria(itemCategoria, { transaction });
        });

        await safeBitacora(req, 'productocategoria.agregar', `${productoid}:${categoriaid}`);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// DELETE: api/productos/5/categoria/1
self.eliminaCategoria = async function (req, res, next) {
    try {
        validateRequest(req);

        const productoid = parsePositiveInteger(req.params.id, 'id');
        const categoriaid = parsePositiveInteger(req.params.categoriaid, 'categoriaid');

        const itemProducto = await producto.findByPk(productoid);
        if (!itemProducto) {
            return res.status(404).json({
                mensaje: 'Producto no encontrado.'
            });
        }

        const itemCategoria = await categoria.findByPk(categoriaid);
        if (!itemCategoria) {
            return res.status(404).json({
                mensaje: 'Categoría no encontrada.'
            });
        }

        const categoriasAsignadas = await itemProducto.getCategorias({
            where: { id: categoriaid },
            attributes: ['id'],
            joinTableAttributes: []
        });

        if (categoriasAsignadas.length === 0) {
            return res.status(404).json({
                mensaje: 'La categoría no está asignada a este producto.'
            });
        }

        await sequelize.transaction(async (transaction) => {
            await itemProducto.removeCategoria(itemCategoria, { transaction });
        });

        await safeBitacora(req, 'productocategoria.remover', `${productoid}:${categoriaid}`);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

module.exports = self;
