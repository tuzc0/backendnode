'use strict';

const requestIp = require('request-ip');
const ClaimTypes = require('../config/claimtypes');
const { bitacora } = require('../models');

const MAX_LENGTH_DEFAULT = 255;
const MAX_LENGTH_IP = 45; 
const MAX_LENGTH_EMAIL = 150;
const MAX_LENGTH_ACTION = 100;
const MAX_LENGTH_ID = 100;

const DEFAULT_IP = 'IP desconocida';
const DEFAULT_USER = 'invitado';

const ERROR_LOG_MESSAGE = 'No se pudo registrar la acción en bitácora:';

function sanitizeValue(value, maxLength = MAX_LENGTH_DEFAULT) {
    if (value === undefined || value === null) return null;

    return String(value)
        .replace(/[\r\n\t<>]/g, ' ')
        .trim()
        .substring(0, maxLength);
}

const bitacoraLogger = (req, res, next) => {
    req.bitacora = async (action, id) => {
        try {
            const rawIp = requestIp.getClientIp(req) || DEFAULT_IP;
            const ip = sanitizeValue(rawIp, MAX_LENGTH_IP);

            let email = DEFAULT_USER;
            if (req.decodedToken && req.decodedToken[ClaimTypes.Name]) {
                email = sanitizeValue(req.decodedToken[ClaimTypes.Name], MAX_LENGTH_EMAIL);
            }

            const safeAction = sanitizeValue(action, MAX_LENGTH_ACTION);
            const safeElementId = sanitizeValue(id, MAX_LENGTH_ID);

            if (!safeAction) {
                return;
            }

            await bitacora.create({
                accion: safeAction,
                elementoid: safeElementId,
                ip, 
                usuario: email,
                fecha: new Date()
            });
        } catch (error) {
            console.error(ERROR_LOG_MESSAGE, error);
        }
    };

    next();
};

module.exports = bitacoraLogger;