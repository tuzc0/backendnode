'use strict';

const { validationResult } = require('express-validator');

/**
 * Mock de respuesta Express compatible con todos los test suites.
 * Incluye los métodos más comunes para poder hacer assertions sobre ellos.
 */
const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    res.send   = jest.fn().mockReturnValue(res);
    res.set    = jest.fn().mockReturnValue(res);
    res.get    = jest.fn().mockReturnValue(null);
    return res;
};

/**
 * Request genérico para tests de controllers con req.auth ya configurado.
 */
const makeReq = (body = {}, overrides = {}) => ({
    body,
    params:   {},
    query:    {},
    auth:     { email: 'user@test.com', rol: 'Usuario', nombre: 'Test User' },
    bitacora: jest.fn().mockResolvedValue(undefined),
    ...overrides
});

/**
 * Request para tests del controller de autenticación (login).
 * Incluye headers, ip y socket como espera auth.controller.
 */
const makeLoginReq = (body = {}, ip = '127.0.1.1') => ({
    body,
    headers:      {},
    ip,
    socket:       { remoteAddress: ip },
    bitacora:     jest.fn().mockResolvedValue(undefined),
    decodedToken: null
});

/**
 * Request para tests del middleware Authorize.
 * Solo necesita header() y los campos de IP.
 */
const makeAuthReq = (token) => ({
    header:   (name) => name === 'Authorization' && token ? `Bearer ${token}` : undefined,
    bitacora: jest.fn().mockResolvedValue(undefined),
    ip:       '127.0.0.1',
    socket:   { remoteAddress: '127.0.0.1' }
});

/**
 * Ejecuta cadenas de express-validator sobre un request sintético
 * y retorna el resultado de validationResult.
 *
 * Solo procesa elementos con método .run() (cadenas de express-validator).
 * Ignora middlewares regulares como validateRequest.
 */
async function runValidators(validators, body = {}) {
    const req = { body, params: {}, query: {} };

    for (const v of validators) {
        if (v && typeof v.run === 'function') {
            await v.run(req);
        }
    }

    return validationResult(req);
}

module.exports = { mockRes, makeReq, makeLoginReq, makeAuthReq, runValidators };
