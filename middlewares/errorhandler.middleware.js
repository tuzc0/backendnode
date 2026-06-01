'use strict';

const fs = require('node:fs');
const path = require('node:path');
const requestIp = require('request-ip');
const ClaimTypes = require('../config/claimtypes');

const LOG_DIR = path.join(__dirname, '..', 'log');
const LOG_FILE = path.join(LOG_DIR, 'log.txt');
const MAX_LOG_LENGTH = 300;
const DEFAULT_ERROR_STATUS = 500;
const MIN_HTTP_ERROR = 400;
const MAX_HTTP_ERROR = 599;
const GENERIC_ERROR_MESSAGE = 'No se ha podido procesar la petición. Inténtelo nuevamente más tarde.';

function sanitizeLogValue(value) {
    if (value === undefined || value === null) return '';

    return String(value)
        .replace(/[\r\n\t]/g, ' ')
        .replace(/[<>]/g, '')
        .substring(0, MAX_LOG_LENGTH);
}

function getSafeStatusCode(statusCode) {
    const parsedCode = Number(statusCode);

    if (!Number.isInteger(parsedCode) || parsedCode < MIN_HTTP_ERROR || parsedCode > MAX_HTTP_ERROR) {
        return DEFAULT_ERROR_STATUS;
    }

    return parsedCode;
}

fs.promises.mkdir(LOG_DIR, { recursive: true }).catch((err) => {
    console.error('No se pudo crear el directorio de log:', err.message);
});

const errorHandler = (err, req, res, next) => {
    const statusCode = getSafeStatusCode(err.statusCode);
    const genericMessage = GENERIC_ERROR_MESSAGE;

    const ip = sanitizeLogValue(requestIp.getClientIp(req) || 'IP desconocida');

    let email = 'Anónimo';

    const tokenEmail = req?.decodedToken?.[ClaimTypes.Name];

    if (tokenEmail) {
        email = sanitizeLogValue(tokenEmail);
    }

    const errorMessage = sanitizeLogValue(err.message || genericMessage);
    const method = sanitizeLogValue(req.method);
    const url = sanitizeLogValue(req.originalUrl || req.url);

    const logLine = `${new Date().toISOString()} - ${statusCode} - ${ip} - ${email} - ${method} ${url} - ${errorMessage}\n`;

    fs.promises.appendFile(LOG_FILE, logLine).catch(() => {
        console.error('No se pudo escribir en el archivo de log.');
    });

    if (process.env.NODE_ENV === 'development') {
        return res.status(statusCode).json({
            status: statusCode,
            mensaje: err.message || genericMessage,
            stack: err.stack
        });
    }

    return res.status(statusCode).json({
        mensaje: genericMessage
    });
};

module.exports = errorHandler;
