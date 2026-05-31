'use strict';

const { validationResult } = require('express-validator');
const { createHttpError } = require('./http');

/**
 * Lanza un 400 si express-validator encontró errores en la request.
 */
function validateRequest(req) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = createHttpError(400, 'Datos de entrada inválidos.');
        error.details = errors.array();
        throw error;
    }
}

/**
 * Verifica que un valor sea un string no vacío (sin espacios).
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Elimina caracteres de control ASCII, recorta espacios extremos
 * y colapsa espacios múltiples internos.
 */
function normalizeText(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Parsea un valor a entero positivo o lanza 400 si no es válido.
 */
function parsePositiveInteger(value, fieldName = 'id') {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
        throw createHttpError(400, `El campo ${fieldName} debe ser un entero positivo.`);
    }
    return number;
}

/**
 * Extrae page, limit y offset desde query params.
 * maxLimit y defaultLimit son configurables por módulo
 * (por ejemplo bitácora usa 100 / 25).
 */
function getPagination(req, maxLimit = 50, defaultLimit = 20) {
    const page = req.query.page ? parsePositiveInteger(req.query.page, 'page') : 1;
    const limit = req.query.limit
        ? parsePositiveInteger(req.query.limit, 'limit')
        : defaultLimit;
    const safeLimit = Math.min(limit, maxLimit);
    const offset = (page - 1) * safeLimit;
    return { page, limit: safeLimit, offset };
}

module.exports = {
    validateRequest,
    isNonEmptyString,
    normalizeText,
    parsePositiveInteger,
    getPagination
};
