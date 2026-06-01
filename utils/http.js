'use strict';

function createHttpError(statusCode, message, code) {
    const error = new Error(message);
    error.statusCode = statusCode;

    if (code) {
        error.code = code;
    }

    return error;
}


function sendError(res, statusCode, message, code) {
    const response = { mensaje: message };

    if (code) {
        response.codigo = code;
    }

    return res.status(statusCode).json(response);
}


function setNoCacheHeaders(res) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}


async function safeBitacora(req, action, id) {
    if (!req || typeof req.bitacora !== 'function') return;

    try {
        await req.bitacora(action, id);
    } catch (_error) {
        // La bitácora no debe romper el flujo principal.
    }
}


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
