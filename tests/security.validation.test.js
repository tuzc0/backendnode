'use strict';

// Mocks cargados antes de require de módulos que usan BD y bcrypt
jest.mock('../models', () => ({
    pedido: {},
    pedidodetalle: {},
    producto: {},
    usuario: {},
    rol: {},
    sequelize: {},
    Sequelize: {}
}));

jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn().mockResolvedValue('$2b$04$fakehash'),
    hashSync: jest.fn().mockReturnValue('$2b$04$fakehash_static')
}));

const { validationResult } = require('express-validator');
const { normalizeText } = require('../utils/validators');

// Ejecuta las cadenas de express-validator sobre un request sintético
async function runValidators(validators, body = {}) {
    const req = { body, params: {}, query: {} };

    for (const v of validators) {
        if (v && typeof v.run === 'function') {
            await v.run(req);
        }
    }

    return validationResult(req);
}

// ── Validadores de registro público ──────────────────────────────────────────

describe('auth.registroPublicoValidator — prevención de overposting', () => {
    const { registroPublicoValidator } = require('../controllers/auth.controller');

    const BASE_VALID = {
        email: 'test@example.com',
        password: 'Secure1pass',
        nombre: 'Usuario Test'
    };

    it('acepta body válido sin campos extra', async () => {
        const result = await runValidators(registroPublicoValidator, BASE_VALID);
        expect(result.isEmpty()).toBe(true);
    });

    it('rechaza campo rol="Administrador" — previene escalada de privilegios', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            rol: 'Administrador'
        });
        expect(result.isEmpty()).toBe(false);
        const err = result.array().find(e => e.path === 'rol');
        expect(err).toBeDefined();
        expect(err.msg).toMatch(/no está permitido/i);
    });

    it('rechaza campo id — previene IDOR por id inventado', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            id: 'uuid-inventado'
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'id')).toBeDefined();
    });

    it('rechaza campo passwordhash — previene bypass de hashing', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            passwordhash: '$2b$12$hash_malicioso'
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'passwordhash')).toBeDefined();
    });

    it('rechaza campo rolid — previene asignación directa de UUID de rol', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            rolid: 'uuid-admin-rol'
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'rolid')).toBeDefined();
    });

    it('rechaza campo protegido — previene marcar cuenta como protegida', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            protegido: true
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'protegido')).toBeDefined();
    });

    it('rechaza contraseña sin mayúscula', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            password: 'sinmayuscula1'
        });
        expect(result.isEmpty()).toBe(false);
    });

    it('rechaza contraseña sin número', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            password: 'SinNumeroEnPass'
        });
        expect(result.isEmpty()).toBe(false);
    });

    it('rechaza contraseña menor a 8 caracteres', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            password: 'Ab1'
        });
        expect(result.isEmpty()).toBe(false);
    });

    it('rechaza email con formato inválido', async () => {
        const result = await runValidators(registroPublicoValidator, {
            ...BASE_VALID,
            email: 'no-es-un-email'
        });
        expect(result.isEmpty()).toBe(false);
    });
});

// ── Validadores de pedidos — manipulación de precios ─────────────────────────

describe('pedidos.crearPedidoValidator — prevención de manipulación de precios', () => {
    const { crearPedidoValidator } = require('../controllers/pedidos.controller');

    const ITEMS_VALIDOS = [
        { productoId: 1, cantidad: 2 },
        { productoId: 2, cantidad: 1 }
    ];

    it('acepta items válidos sin campos de precio', async () => {
        const result = await runValidators(crearPedidoValidator, { items: ITEMS_VALIDOS });
        expect(result.isEmpty()).toBe(true);
    });

    it('rechaza campo total en body — el backend lo calcula', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: ITEMS_VALIDOS,
            total: 0.01
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'total')).toBeDefined();
    });

    it('rechaza campo precio en body', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: ITEMS_VALIDOS,
            precio: 0.01
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'precio')).toBeDefined();
    });

    it('rechaza campo subtotal en body', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: ITEMS_VALIDOS,
            subtotal: 999
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'subtotal')).toBeDefined();
    });

    it('rechaza campo usuarioid en body — sale del JWT', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: ITEMS_VALIDOS,
            usuarioid: 'uuid-de-otro-usuario'
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'usuarioid')).toBeDefined();
    });

    it('rechaza campo estado en body al crear', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: ITEMS_VALIDOS,
            estado: 'ENTREGADO'
        });
        expect(result.isEmpty()).toBe(false);
        expect(result.array().find(e => e.path === 'estado')).toBeDefined();
    });

    it('rechaza carrito vacío (items: [])', async () => {
        const result = await runValidators(crearPedidoValidator, { items: [] });
        expect(result.isEmpty()).toBe(false);
    });

    it('rechaza items ausente', async () => {
        const result = await runValidators(crearPedidoValidator, {});
        expect(result.isEmpty()).toBe(false);
    });

    it('rechaza cantidad = 0 (mínimo permitido es 1)', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: [{ productoId: 1, cantidad: 0 }]
        });
        expect(result.isEmpty()).toBe(false);
    });

    it('rechaza cantidad = 100 (máximo permitido es 99)', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: [{ productoId: 1, cantidad: 100 }]
        });
        expect(result.isEmpty()).toBe(false);
    });

    it('acepta cantidad = 99 (límite superior válido)', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: [{ productoId: 1, cantidad: 99 }]
        });
        expect(result.isEmpty()).toBe(true);
    });

    it('acepta cantidad = 1 (límite inferior válido)', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: [{ productoId: 1, cantidad: 1 }]
        });
        expect(result.isEmpty()).toBe(true);
    });

    it('rechaza productoId = 0', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: [{ productoId: 0, cantidad: 1 }]
        });
        expect(result.isEmpty()).toBe(false);
    });

    it('rechaza productoId negativo', async () => {
        const result = await runValidators(crearPedidoValidator, {
            items: [{ productoId: -5, cantidad: 1 }]
        });
        expect(result.isEmpty()).toBe(false);
    });
});

// ── normalizeText — sanitización de entradas ──────────────────────────────────

describe('utils/validators.js — normalizeText sanitiza caracteres de control', () => {
    it('elimina caracteres de control ASCII (previene log injection)', () => {
        const input = 'nombre\r\ncon\tcontrol';
        const result = normalizeText(input);
        expect(result).not.toMatch(/[\r\n\t]/);
    });

    it('colapsa espacios múltiples internos', () => {
        expect(normalizeText('hola    mundo')).toBe('hola mundo');
    });

    it('recorta espacios extremos', () => {
        expect(normalizeText('  texto  ')).toBe('texto');
    });

    it('retorna string vacío para tipos no string', () => {
        expect(normalizeText(null)).toBe('');
        expect(normalizeText(undefined)).toBe('');
        expect(normalizeText(42)).toBe('');
    });

    it('retorna string vacío para arrays (previene mass assignment)', () => {
        expect(normalizeText([])).toBe('');
    });
});
