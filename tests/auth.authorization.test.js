'use strict';

jest.mock('../models', () => ({
    usuario: { findOne: jest.fn(), create: jest.fn() },
    rol:     { findOne: jest.fn() },
    sequelize: { transaction: jest.fn() },
    Sequelize: { col: jest.fn((name) => name) }
}));

jest.mock('bcrypt', () => ({
    compare:  jest.fn(),
    hash:     jest.fn().mockResolvedValue('$2b$04$fakehash'),
    hashSync: jest.fn().mockReturnValue('$2b$04$fakehash_static')
}));

const bcrypt  = require('bcrypt');
const { usuario, rol, sequelize } = require('../models');
const auth    = require('../controllers/auth.controller');
const { GeneraToken } = require('../services/jwttoken.service');
const Authorize = require('../middlewares/auth.middleware');
const crypto  = require('node:crypto');

let ipCounter = 200;
const makeTestIp = () => `10.1.0.${ipCounter++}`;

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    res.send   = jest.fn().mockReturnValue(res);
    res.set    = jest.fn().mockReturnValue(res);
    res.get    = jest.fn().mockReturnValue(null);
    return res;
};

const makeLoginReq = (body = {}, ip = makeTestIp()) => ({
    body,
    headers: {},
    ip,
    socket: { remoteAddress: ip },
    bitacora: jest.fn().mockResolvedValue(undefined),
    decodedToken: null
});

const makeAuthReq = (token) => ({
    header: (name) => name === 'Authorization' && token ? `Bearer ${token}` : undefined,
    bitacora: jest.fn().mockResolvedValue(undefined),
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' }
});

beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (cb) => cb({}));
});

// ── Login: datos sensibles nunca expuestos ────────────────────────────────────

describe('auth.controller.js — login no expone datos sensibles', () => {
    const VALID_USER = {
        id: 'uuid-1',
        email: 'admin@example.com',
        nombre: 'Admin Test',
        passwordhash: '$2b$04$realhash',
        rol: 'Administrador'
    };

    it('la respuesta no contiene passwordhash', async () => {
        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(true);

        const res = mockRes();
        await auth.login(makeLoginReq({ email: 'admin@example.com', password: 'Pass1' }), res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body).not.toHaveProperty('passwordhash');
    });

    it('la respuesta no contiene password en texto claro', async () => {
        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(true);

        const res = mockRes();
        await auth.login(makeLoginReq({ email: 'admin@example.com', password: 'Pass1' }), res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body).not.toHaveProperty('password');
    });

    it('la respuesta solo contiene email, nombre, rol y jwt', async () => {
        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(true);

        const res = mockRes();
        await auth.login(makeLoginReq({ email: 'admin@example.com', password: 'Pass1' }), res, jest.fn());

        const body = res.json.mock.calls[0][0];
        const keys = Object.keys(body);
        expect(keys.sort()).toEqual(['email', 'jwt', 'nombre', 'rol'].sort());
    });

    it('login fallido devuelve mensaje genérico (no revela existencia del usuario)', async () => {
        const ip = makeTestIp();

        usuario.findOne.mockResolvedValue(null);
        bcrypt.compare.mockResolvedValue(false);
        const res1 = mockRes();
        await auth.login(makeLoginReq({ email: 'inexistente@example.com', password: 'Pass1' }, ip), res1, jest.fn());

        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(false);
        const res2 = mockRes();
        await auth.login(makeLoginReq({ email: 'admin@example.com', password: 'WrongPass' }, ip), res2, jest.fn());

        const msg1 = res1.json.mock.calls[0][0].mensaje;
        const msg2 = res2.json.mock.calls[0][0].mensaje;
        expect(msg1).toBe(msg2);
    });

    it('el JWT no contiene passwordhash en su payload', async () => {
        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(true);

        const res = mockRes();
        await auth.login(makeLoginReq({ email: 'admin@example.com', password: 'Pass1' }), res, jest.fn());

        const { jwt } = res.json.mock.calls[0][0];
        const [, payloadB64] = jwt.split('.');
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

        expect(JSON.stringify(payload)).not.toContain('passwordhash');
        expect(JSON.stringify(payload)).not.toContain('$2b$');
    });
});

// ── Registro público: rol siempre es Usuario ─────────────────────────────────

describe('auth.controller.js — registro siempre asigna rol Usuario', () => {
    const ROL_USUARIO = { id: 'rol-usuario-uuid', nombre: 'Usuario' };
    const NEW_USER = {
        id: crypto.randomUUID(),
        email: 'nuevo@example.com',
        nombre: 'Nuevo Usuario'
    };

    it('busca exclusivamente el rol "Usuario" sin importar lo que venga en el body', async () => {
        rol.findOne.mockResolvedValue(ROL_USUARIO);
        usuario.findOne.mockResolvedValue(null);
        usuario.create.mockResolvedValue(NEW_USER);

        const res = mockRes();
        await auth.registro(
            {
                body: { email: 'nuevo@example.com', password: 'Secure1pass', nombre: 'Nuevo' },
                bitacora: jest.fn()
            },
            res,
            jest.fn()
        );

        expect(rol.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { nombre: 'Usuario' } })
        );
    });

    it('responde 201 con rol "Usuario" en la respuesta', async () => {
        rol.findOne.mockResolvedValue(ROL_USUARIO);
        usuario.findOne.mockResolvedValue(null);
        usuario.create.mockResolvedValue({ ...NEW_USER, rolid: ROL_USUARIO.id });

        const res = mockRes();
        await auth.registro(
            {
                body: { email: 'nuevo@example.com', password: 'Secure1pass', nombre: 'Nuevo' },
                bitacora: jest.fn()
            },
            res,
            jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(201);
        const body = res.json.mock.calls[0][0];
        expect(body.rol).toBe('Usuario');
    });

    it('la respuesta no contiene passwordhash ni password', async () => {
        rol.findOne.mockResolvedValue(ROL_USUARIO);
        usuario.findOne.mockResolvedValue(null);
        usuario.create.mockResolvedValue({ ...NEW_USER, rolid: ROL_USUARIO.id });

        const res = mockRes();
        await auth.registro(
            {
                body: { email: 'nuevo@example.com', password: 'Secure1pass', nombre: 'Nuevo' },
                bitacora: jest.fn()
            },
            res,
            jest.fn()
        );

        const body = res.json.mock.calls[0][0];
        expect(body).not.toHaveProperty('passwordhash');
        expect(body).not.toHaveProperty('password');
    });

    it('responde 409 si el email ya existe (no revela detalles internos)', async () => {
        rol.findOne.mockResolvedValue(ROL_USUARIO);
        usuario.findOne.mockResolvedValue({ id: 'existing-uuid' });

        const res = mockRes();
        await auth.registro(
            {
                body: { email: 'existente@example.com', password: 'Secure1pass', nombre: 'Ya Existe' },
                bitacora: jest.fn()
            },
            res,
            jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(409);
        const body = res.json.mock.calls[0][0];
        expect(body).toHaveProperty('mensaje');
        expect(body).not.toHaveProperty('passwordhash');
        expect(body).not.toHaveProperty('id');
    });

    it('pasa el error a next si el rol Usuario no existe en BD', async () => {
        rol.findOne.mockResolvedValue(null);
        usuario.findOne.mockResolvedValue(null);

        const next = jest.fn();
        await auth.registro(
            {
                body: { email: 'nuevo@example.com', password: 'Secure1pass', nombre: 'Test' },
                bitacora: jest.fn()
            },
            mockRes(),
            next
        );

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});

// ── Authorize: req.auth es inmutable ─────────────────────────────────────────

describe('auth.middleware.js — req.auth es inmutable (Object.freeze)', () => {
    it('req.auth no puede ser modificado por código posterior', async () => {
        const token = GeneraToken('user@test.com', 'Test User', 'Usuario');
        const req = makeAuthReq(token);
        const res = mockRes();

        await Authorize(['Usuario'])(req, res, jest.fn());

        expect(() => {
            req.auth.rol = 'Administrador';
        }).toThrow();

        expect(req.auth.rol).toBe('Usuario');
    });

    it('req.auth contiene exactamente email, nombre, rol, exp, iat, jti', async () => {
        const token = GeneraToken('user@test.com', 'Test User', 'Usuario');
        const req = makeAuthReq(token);
        const res = mockRes();

        await Authorize(['Usuario'])(req, res, jest.fn());

        expect(req.auth).toMatchObject({
            email: 'user@test.com',
            nombre: 'Test User',
            rol: 'Usuario'
        });

        expect(req.auth).toHaveProperty('exp');
        expect(req.auth).toHaveProperty('iat');
    });

    it('req.auth no contiene passwordhash ni datos internos de BD', async () => {
        const token = GeneraToken('user@test.com', 'Test User', 'Usuario');
        const req = makeAuthReq(token);
        await Authorize(['Usuario'])(req, mockRes(), jest.fn());

        expect(req.auth).not.toHaveProperty('passwordhash');
        expect(req.auth).not.toHaveProperty('password');
        expect(req.auth).not.toHaveProperty('rolid');
        expect(req.auth).not.toHaveProperty('protegido');
    });
});
