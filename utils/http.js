'use strict';

/**
 * Crea un Error con statusCode adjunto para el error handler centralizado.
 */
function createHttpError(statusCode, message, code) {
    const error = new Error(message);
    error.statusCode = statusCode;

    if (code) {
        error.code = code;
    }

    return error;
}

/**
 * Envía una respuesta de error JSON con la clave `mensaje` estandarizada.
 */
function sendError(res, statusCode, message, code) {
    const response = { mensaje: message };

    if (code) {
        response.codigo = code;
    }

    return res.status(statusCode).json(response);
}

/**
 * Aplica headers HTTP que deshabilitan caché en la respuesta.
 */
function setNoCacheHeaders(res) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

/**
 * Registra una acción en bitácora sin propagar errores al flujo principal.
 */
async function safeBitacora(req, action, id) {
    if (!req || typeof req.bitacora !== 'function') return;

    try {
        await req.bitacora(action, id);
    } catch (_error) {
        // La bitácora no debe romper el flujo principal.
    }
}

/**
 * Envuelve un handler async para capturar errores y pasarlos a next().
 * Útil en rutas que no usan Express 5 automáticamente o para claridad explícita.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    createHttpError,
    sendError,
    setNoCacheHeaders,
    safeBitacora,
    asyncHandler
};
