'use strict';

const crypto = require('node:crypto');
const Authorize = require('../middlewares/auth.middleware');
const { GeneraToken } = require('../services/jwttoken.service');
const jwt = require('jsonwebtoken');

const WRONG_JWT_SECRET = crypto.randomBytes(32).toString('hex');

const EMAIL  = 'admin@example.com';
const NOMBRE = 'Admin Prueba';

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    res.set    = jest.fn().mockReturnValue(res);
    res.get    = jest.fn().mockReturnValue(null);
    return res;
};

const makeReq = (token) => ({
    header: (name) => name === 'Authorization' && token ? `Bearer ${token}` : undefined,
    bitacora: jest.fn().mockResolvedValue(undefined),
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' }
});

describe('middlewares/auth.middleware.js (Authorize)', () => {
    describe('sin token', () => {
        it('responde 401 si no hay Authorization header', async () => {
            const res = mockRes();
            await Authorize(['Usuario'])(makeReq(null), res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('responde 401 con Bearer vacío', async () => {
            const req = { header: () => 'Bearer ', bitacora: jest.fn(), ip: '127.0.0.1' };
            const res = mockRes();
            await Authorize(['Usuario'])(req, res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('token inválido', () => {
        it('responde 401 con token mal formado', async () => {
            const res = mockRes();
            await Authorize(['Usuario'])(makeReq('abc.def.ghi'), res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('responde 401 con firma incorrecta', async () => {
            const badToken = jwt.sign({ sub: 'test' }, WRONG_JWT_SECRET, { expiresIn: '1h' });
            const res = mockRes();
            await Authorize(['Usuario'])(makeReq(badToken), res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('token válido', () => {
        it('llama next() con rol correcto', async () => {
            const token = GeneraToken(EMAIL, NOMBRE, 'Administrador');
            const res = mockRes();
            const next = jest.fn();
            await Authorize(['Administrador'])(makeReq(token), res, next);
            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('responde 403 con rol insuficiente', async () => {
            const token = GeneraToken(EMAIL, NOMBRE, 'Usuario');
            const res = mockRes();
            const next = jest.fn();
            await Authorize(['Administrador'])(makeReq(token), res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('agrega req.auth con email, nombre y rol', async () => {
            const token = GeneraToken(EMAIL, NOMBRE, 'Usuario');
            const req = makeReq(token);
            const res = mockRes();
            await Authorize(['Usuario'])(req, res, jest.fn());
            expect(req.auth).toMatchObject({ email: EMAIL, nombre: NOMBRE, rol: 'Usuario' });
        });

        it('acepta lista de roles permitidos', async () => {
            const token = GeneraToken(EMAIL, NOMBRE, 'Usuario');
            const res = mockRes();
            const next = jest.fn();
            await Authorize(['Usuario', 'Administrador'])(makeReq(token), res, next);
            expect(next).toHaveBeenCalledWith();
        });

        it('acepta roles como string separado por comas', async () => {
            const token = GeneraToken(EMAIL, NOMBRE, 'Administrador');
            const res = mockRes();
            const next = jest.fn();
            await Authorize('Usuario,Administrador')(makeReq(token), res, next);
            expect(next).toHaveBeenCalledWith();
        });

        it('permite acceso cuando no se requiere ningún rol (Authorize vacío)', async () => {
            const token = GeneraToken(EMAIL, NOMBRE, 'Usuario');
            const res = mockRes();
            const next = jest.fn();
            await Authorize([])(makeReq(token), res, next);
            expect(next).toHaveBeenCalledWith();
        });

        it('responde 401 con token válido pero sin claims requeridos', async () => {
            const tokenNoClaims = jwt.sign(
                { sub: 'just-subject' },
                process.env.JWT_SECRET,
                { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, expiresIn: '1h', algorithm: 'HS256' }
            );
            const res = mockRes();
            await Authorize(['Usuario'])(makeReq(tokenNoClaims), res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('agrega Set-Authorization cuando el token está cerca de expirar', async () => {
            const ClaimTypes = require('../config/claimtypes');
            const nearToken = jwt.sign(
                { [ClaimTypes.Name]: EMAIL, [ClaimTypes.GivenName]: NOMBRE, [ClaimTypes.Role]: 'Usuario' },
                process.env.JWT_SECRET,
                { expiresIn: '2m', algorithm: 'HS256', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, jwtid: 'near-exp' }
            );
            const req = makeReq(nearToken);
            const res = mockRes();
            await Authorize(['Usuario'])(req, res, jest.fn());
            expect(res.set).toHaveBeenCalledWith('Set-Authorization', expect.any(String));
        });
    });

    describe('formato de header inválido', () => {
        it('responde 401 si Authorization no usa Bearer', async () => {
            const req = { header: (n) => n === 'Authorization' ? 'Basic dXNlcjpwYXNz' : undefined, bitacora: jest.fn(), ip: '127.0.0.1' };
            const res = mockRes();
            await Authorize(['Usuario'])(req, res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it('responde 401 si el token contiene caracteres inválidos (falla regex)', async () => {
            const req = { header: (n) => n === 'Authorization' ? 'Bearer abc.def.gh!!' : undefined, bitacora: jest.fn(), ip: '127.0.0.1' };
            const res = mockRes();
            await Authorize(['Usuario'])(req, res, jest.fn());
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });
});
