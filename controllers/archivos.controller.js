'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { archivo, sequelize } = require('../models');
const { param, query } = require('express-validator');
const { createHttpError, safeBitacora } = require('../utils/http');
const { validateRequest, parsePositiveInteger } = require('../utils/validators');

let self = {};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const FILES_IN_DB = String(process.env.FILES_IN_DB).toLowerCase() === 'true';

function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw createHttpError(400, 'Nombre de archivo inválido.');
    }

    const baseName = path.basename(filename);

    if (baseName !== filename || baseName.includes('..')) {
        throw createHttpError(400, 'Nombre de archivo inseguro.');
    }

    return baseName;
}

function getSafeUploadPath(filename) {
    const safeName = sanitizeFilename(filename);
    const filePath = path.join(UPLOAD_DIR, safeName);
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);

    if (!resolvedPath.startsWith(resolvedUploadDir + path.sep)) {
        throw createHttpError(400, 'Ruta de archivo inválida.');
    }

    return resolvedPath;
}

function sanitizeArchivoOutput(item) {
    return {
        id: item.id,
        mime: item.mime,
        nombre: item.nombre,
        size: item.size,
        indb: item.indb
    };
}

function validateUploadedFile(req) {
    if (!req.file) {
        throw createHttpError(400, 'El archivo es obligatorio.');
    }

    if (req.file.mimetype !== 'image/jpeg') {
        throw createHttpError(400, 'Solo se permiten imágenes JPG.');
    }

    if (!req.file.filename) {
        throw createHttpError(400, 'El archivo no fue procesado correctamente.');
    }

    sanitizeFilename(req.file.filename);
}

async function deleteFileIfExists(filename) {
    if (!filename) return;

    try {
        const filePath = getSafeUploadPath(filename);

        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('No se pudo eliminar el archivo físico.');
        }
    }
}

async function readUploadedFile(filePath) {
    if (!filePath) {
        throw createHttpError(400, 'No se pudo leer el archivo subido.');
    }

    return await fs.promises.readFile(filePath);
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

// GET: api/archivos
self.getAll = async function (req, res, next) {
    try {
        validateRequest(req);

        const page = req.query.page ? parsePositiveInteger(req.query.page, 'page') : 1;
        const limit = req.query.limit ? parsePositiveInteger(req.query.limit, 'limit') : DEFAULT_LIMIT;
        const safeLimit = Math.min(limit, MAX_LIMIT);
        const offset = (page - 1) * safeLimit;

        const { count, rows } = await archivo.findAndCountAll({
            attributes: ['id', 'mime', 'nombre', 'size', 'indb'],
            order: [['id', 'ASC']],
            limit: safeLimit,
            offset
        });

        res.status(200).json({
            total: count,
            page,
            limit: safeLimit,
            data: rows.map(sanitizeArchivoOutput)
        });
    } catch (error) {
        next(error);
    }
};

// GET: api/archivos/5/detalle
self.getDetalle = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await archivo.findByPk(id, {
            attributes: ['id', 'mime', 'nombre', 'size', 'indb']
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado.'
            });
        }

        res.status(200).json(sanitizeArchivoOutput(data));
    } catch (error) {
        next(error);
    }
};

// GET: api/archivos/5
self.get = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await archivo.findByPk(id, {
            attributes: ['id', 'mime', 'nombre', 'size', 'indb', 'datos']
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado.'
            });
        }

        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', data.mime || 'image/jpeg');

        if (data.indb && data.datos) {
            return res.status(200).send(data.datos);
        }

        const filePath = getSafeUploadPath(data.nombre);

        try {
            const image = await fs.promises.readFile(filePath);
            return res.status(200).send(image);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({
                    mensaje: 'El archivo físico no existe.'
                });
            }

            throw error;
        }
    } catch (error) {
        next(error);
    }
};

// POST: api/archivos
self.create = async function (req, res, next) {
    let uploadedFilename = null;

    try {
        validateUploadedFile(req);

        uploadedFilename = req.file.filename;

        let binaryData = null;
        let storedInDb = false;

        if (FILES_IN_DB) {
            binaryData = await readUploadedFile(req.file.path);
            storedInDb = true;
        }

        const data = await sequelize.transaction(async (transaction) => {
            return await archivo.create(
                {
                    mime: req.file.mimetype,
                    nombre: req.file.filename,
                    size: req.file.size,
                    indb: storedInDb,
                    datos: binaryData
                },
                { transaction }
            );
        });

        if (FILES_IN_DB) {
            await deleteFileIfExists(uploadedFilename);
        }

        await safeBitacora(req, 'archivos.crear', data.id);

        res.status(201).json(sanitizeArchivoOutput(data));
    } catch (error) {
        if (uploadedFilename) {
            await deleteFileIfExists(uploadedFilename);
        }

        next(error);
    }
};

// PUT: api/archivos/5
self.update = async function (req, res, next) {
    let uploadedFilename = null;

    try {
        validateRequest(req);
        validateUploadedFile(req);

        const id = parsePositiveInteger(req.params.id);
        uploadedFilename = req.file.filename;

        const currentFile = await archivo.findByPk(id, {
            attributes: ['id', 'nombre', 'indb']
        });

        if (!currentFile) {
            await deleteFileIfExists(uploadedFilename);

            return res.status(404).json({
                mensaje: 'Archivo no encontrado.'
            });
        }

        const previousFilename = currentFile.nombre;

        let binaryData = null;
        let storedInDb = false;

        if (FILES_IN_DB) {
            binaryData = await readUploadedFile(req.file.path);
            storedInDb = true;
        }

        await sequelize.transaction(async (transaction) => {
            await currentFile.update(
                {
                    mime: req.file.mimetype,
                    nombre: req.file.filename,
                    size: req.file.size,
                    indb: storedInDb,
                    datos: binaryData
                },
                { transaction }
            );
        });

        if (!currentFile.indb && previousFilename) {
            await deleteFileIfExists(previousFilename);
        }

        if (FILES_IN_DB) {
            await deleteFileIfExists(uploadedFilename);
        }

        await safeBitacora(req, 'archivos.editar', id);

        res.status(204).send();
    } catch (error) {
        if (uploadedFilename) {
            await deleteFileIfExists(uploadedFilename);
        }

        next(error);
    }
};

// DELETE: api/archivos/5
self.delete = async function (req, res, next) {
    try {
        validateRequest(req);

        const id = parsePositiveInteger(req.params.id);

        const data = await archivo.findByPk(id, {
            attributes: ['id', 'nombre', 'indb']
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado.'
            });
        }

        const filename = data.nombre;
        const storedInDb = data.indb;

        await sequelize.transaction(async (transaction) => {
            await archivo.destroy({
                where: { id },
                transaction
            });
        });

        if (!storedInDb && filename) {
            await deleteFileIfExists(filename);
        }

        await safeBitacora(req, 'archivos.eliminar', id);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

module.exports = self;