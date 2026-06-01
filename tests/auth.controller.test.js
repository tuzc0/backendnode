'use strict';

jest.mock('../models', () => ({
    usuario: { findOne: jest.fn() },
    rol: {},
    Sequelize: { col: jest.fn((name) => name) }
}));

jest.mock('bcrypt', () => ({
    compare:  jest.fn(),
    hashSync: jest.fn().mockReturnValue('$2b$04$fakehash_for_timing_protection')
}));

const bcrypt   = require('bcrypt');
const { usuario } = require('../models');
const auth     = require('../controllers/auth.controller');

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    res.send   = jest.fn().mockReturnValue(res);
    res.set    = jest.fn().mockReturnValue(res);
    return res;
};

const makeReq = (body = {}, ip = '10.0.0.1') => ({
    body,
    headers: {},
    ip,
    socket: { remoteAddress: ip },
    bitacora: jest.fn().mockResolvedValue(undefined),
    decodedToken: null
});

const VALID_USER = {
    id: 'uuid-1',
    email: 'admin@example.com',
    nombre: 'Admin Test',
    passwordhash: '$2b$04$realhash',
    rol: 'Administrador'
};

describe('controllers/auth.controller.js — self.login', () => {
    beforeEach(() => jest.clearAllMocks());

    it('responde 401 con body vacío', async () => {
        const res = mockRes();
        await auth.login(makeReq({}), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 401 con email inválido', async () => {
        const res = mockRes();
        await auth.login(makeReq({ email: 'no-es-email', password: 'Pass1234' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 401 con contraseña demasiado larga', async () => {
        const res = mockRes();
        await auth.login(makeReq({ email: 'a@b.com', password: 'x'.repeat(200) }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 401 cuando el usuario no existe (timing attack mitigation activo)', async () => {
        usuario.findOne.mockResolvedValue(null);
        bcrypt.compare.mockResolvedValue(false);
        const res = mockRes();
        await auth.login(makeReq({ email: 'noexiste@example.com', password: 'Pass1234' }, '10.0.0.2'), res, jest.fn());
        expect(bcrypt.compare).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 401 con contraseña incorrecta', async () => {
        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(false);
        const res = mockRes();
        await auth.login(makeReq({ email: 'admin@example.com', password: 'WrongPass' }, '10.0.0.3'), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 200 con JWT en login correcto', async () => {
        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(true);
        const res = mockRes();
        await auth.login(makeReq({ email: 'admin@example.com', password: 'CorrectPass' }, '10.0.0.4'), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body).toHaveProperty('jwt');
        expect(body.email).toBe('admin@example.com');
        expect(body.rol).toBe('Administrador');
    });

    it('la respuesta de login fallido es genérica (no revela existencia del usuario)', async () => {
        usuario.findOne.mockResolvedValue(null);
        bcrypt.compare.mockResolvedValue(false);
        const res1 = mockRes();
        await auth.login(makeReq({ email: 'noexiste@example.com', password: 'Pass' }, '10.0.0.5'), res1, jest.fn());

        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(false);
        const res2 = mockRes();
        await auth.login(makeReq({ email: 'admin@example.com', password: 'WrongPass' }, '10.0.0.5'), res2, jest.fn());

        const msg1 = res1.json.mock.calls[0][0].mensaje;
        const msg2 = res2.json.mock.calls[0][0].mensaje;
        expect(msg1).toBe(msg2);
    });

    it('pasa el error a next en caso de excepción inesperada', async () => {
        usuario.findOne.mockRejectedValue(new Error('DB down'));
        const next = jest.fn();
        await auth.login(makeReq({ email: 'admin@example.com', password: 'Pass' }, '10.0.0.6'), mockRes(), next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('responde 401 si el usuario tiene activo=false', async () => {
        usuario.findOne.mockResolvedValue({ ...VALID_USER, activo: false });
        bcrypt.compare.mockResolvedValue(true);
        const res = mockRes();
        await auth.login(makeReq({ email: 'admin@example.com', password: 'Pass' }, '10.1.0.1'), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 401 si el usuario tiene deletedAt no nulo', async () => {
        usuario.findOne.mockResolvedValue({ ...VALID_USER, deletedAt: new Date() });
        bcrypt.compare.mockResolvedValue(true);
        const res = mockRes();
        await auth.login(makeReq({ email: 'admin@example.com', password: 'Pass' }, '10.1.0.2'), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 401 si el usuario retorna sin rol', async () => {
        usuario.findOne.mockResolvedValue({ ...VALID_USER, rol: null });
        bcrypt.compare.mockResolvedValue(true);
        const res = mockRes();
        await auth.login(makeReq({ email: 'admin@example.com', password: 'Pass' }, '10.1.0.3'), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('responde 429 tras 5 intentos fallidos con la misma IP+email', async () => {
        usuario.findOne.mockResolvedValue(null);
        bcrypt.compare.mockResolvedValue(false);
        const ip = '10.2.0.1';
        const email = 'lockout@test.example.com';
        for (let i = 0; i < 5; i++) {
            await auth.login(makeReq({ email, password: 'Bad' }, ip), mockRes(), jest.fn());
        }
        const res = mockRes();
        await auth.login(makeReq({ email, password: 'Bad' }, ip), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(429);
    });
});

describe('controllers/auth.controller.js — self.tiempo', () => {
    const { GeneraToken } = require('../services/jwttoken.service');

    const makeTimReq = (token) => ({
        header: (name) => name === 'Authorization' && token ? `Bearer ${token}` : null,
        headers: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' },
        bitacora: jest.fn()
    });

    it('retorna 200 con tiempo MM:SS para token válido', async () => {
        const token = GeneraToken('timer@example.com', 'Timer', 'Usuario');
        const res = mockRes();
        await auth.tiempo(makeTimReq(token), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith(expect.stringMatching(/^\d{2}:\d{2}$/));
    });

    it('retorna 401 sin token', async () => {
        const res = mockRes();
        await auth.tiempo(makeTimReq(null), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
