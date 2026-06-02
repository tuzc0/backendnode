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

const bcrypt   = require('bcrypt');
const { usuario, rol, sequelize } = require('../models');
const auth     = require('../controllers/auth.controller');
const { GeneraToken } = require('../services/jwttoken.service');
const Authorize = require('../middlewares/auth.middleware');
const crypto   = require('node:crypto');
const { mockRes, makeLoginReq, makeAuthReq } = require('./helpers/test-utils');

// IP único por test para evitar interferencia del brute-force por IP
let ipCounter = 200;
const makeTestIp = () => `10.1.0.${ipCounter++}`;

const VALID_USER = {
    id: 'uuid-1',
    email: 'admin@example.com',
    nombre: 'Admin Test',
    passwordhash: '$2b$04$realhash',
    rol: 'Administrador'
};

beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (cb) => cb({}));
});

// ── Login: datos sensibles nunca expuestos ────────────────────────────────────

describe('auth.controller.js — login no expone datos sensibles', () => {
    let res;
    let loginBody;

    beforeEach(async () => {
        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(true);
        res = mockRes();
        await auth.login(makeLoginReq({ email: 'admin@example.com', password: 'Pass1' }), res, jest.fn());
        loginBody = res.json.mock.calls[0][0];
    });

    it('la respuesta no contiene passwordhash', () => {
        expect(loginBody).not.toHaveProperty('passwordhash');
    });

    it('la respuesta no contiene password en texto claro', () => {
        expect(loginBody).not.toHaveProperty('password');
    });

    it('la respuesta solo contiene email, nombre, rol y jwt', () => {
        const keys = Object.keys(loginBody).toSorted((a, b) => a.localeCompare(b));
        expect(keys).toEqual(['email', 'jwt', 'nombre', 'rol'].toSorted((a, b) => a.localeCompare(b)));
    });

    it('el JWT no contiene passwordhash en su payload', () => {
        const [, payloadB64] = loginBody.jwt.split('.');
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        expect(JSON.stringify(payload)).not.toContain('passwordhash');
        expect(JSON.stringify(payload)).not.toContain('$2b$');
    });
});

describe('auth.controller.js — login fallido no revela existencia del usuario', () => {
    it('mensaje de error es idéntico para usuario inexistente y contraseña incorrecta', async () => {
        const ip = makeTestIp();

        usuario.findOne.mockResolvedValue(null);
        bcrypt.compare.mockResolvedValue(false);
        const res1 = mockRes();
        await auth.login(makeLoginReq({ email: 'inexistente@example.com', password: 'Pass1' }, ip), res1, jest.fn());

        usuario.findOne.mockResolvedValue(VALID_USER);
        bcrypt.compare.mockResolvedValue(false);
        const res2 = mockRes();
        await auth.login(makeLoginReq({ email: 'admin@example.com', password: 'WrongPass' }, ip), res2, jest.fn());

        expect(res1.json.mock.calls[0][0].mensaje).toBe(res2.json.mock.calls[0][0].mensaje);
    });
});

// ── Registro público: rol siempre es Usuario ─────────────────────────────────

describe('auth.controller.js — registro siempre asigna rol Usuario', () => {
    const ROL_USUARIO = { id: 'rol-usuario-uuid', nombre: 'Usuario' };
    const NEW_USER    = { id: crypto.randomUUID(), email: 'nuevo@example.com', nombre: 'Nuevo Usuario' };

    const REGISTRO_REQ = {
        body:     { email: 'nuevo@example.com', password: 'Secure1pass', nombre: 'Nuevo' },
        bitacora: jest.fn()
    };

    beforeEach(() => {
        rol.findOne.mockResolvedValue(ROL_USUARIO);
        usuario.findOne.mockResolvedValue(null);
        usuario.create.mockResolvedValue({ ...NEW_USER, rolid: ROL_USUARIO.id });
    });

    it('busca exclusivamente el rol "Usuario" sin importar lo que venga en el body', async () => {
        await auth.registro(REGISTRO_REQ, mockRes(), jest.fn());
        expect(rol.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { nombre: 'Usuario' } })
        );
    });

    it('responde 201 con rol "Usuario" en la respuesta', async () => {
        const res = mockRes();
        await auth.registro(REGISTRO_REQ, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0].rol).toBe('Usuario');
    });

    it('la respuesta no contiene passwordhash ni password', async () => {
        const res = mockRes();
        await auth.registro(REGISTRO_REQ, res, jest.fn());
        const body = res.json.mock.calls[0][0];
        expect(body).not.toHaveProperty('passwordhash');
        expect(body).not.toHaveProperty('password');
    });

    it('responde 409 si el email ya existe sin revelar detalles internos', async () => {
        usuario.findOne.mockResolvedValue({ id: 'existing-uuid' });
        const res = mockRes();
        await auth.registro(
            { body: { email: 'existente@example.com', password: 'Secure1pass', nombre: 'Ya Existe' }, bitacora: jest.fn() },
            res, jest.fn()
        );
        expect(res.status).toHaveBeenCalledWith(409);
        const body = res.json.mock.calls[0][0];
        expect(body).toHaveProperty('mensaje');
        expect(body).not.toHaveProperty('passwordhash');
        expect(body).not.toHaveProperty('id');
    });

    it('pasa el error a next si el rol Usuario no existe en BD', async () => {
        rol.findOne.mockResolvedValue(null);
        const next = jest.fn();
        await auth.registro(REGISTRO_REQ, mockRes(), next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});

// ── Authorize: req.auth es inmutable ─────────────────────────────────────────

describe('auth.middleware.js — req.auth es inmutable (Object.freeze)', () => {
    it('req.auth no puede ser modificado por código posterior', async () => {
        const token = GeneraToken('user@test.com', 'Test User', 'Usuario');
        const req = makeAuthReq(token);
        await Authorize(['Usuario'])(req, mockRes(), jest.fn());

        expect(() => { req.auth.rol = 'Administrador'; }).toThrow();
        expect(req.auth.rol).toBe('Usuario');
    });

    it('req.auth contiene email, nombre, rol, exp e iat', async () => {
        const token = GeneraToken('user@test.com', 'Test User', 'Usuario');
        const req = makeAuthReq(token);
        await Authorize(['Usuario'])(req, mockRes(), jest.fn());

        expect(req.auth).toMatchObject({ email: 'user@test.com', nombre: 'Test User', rol: 'Usuario' });
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
