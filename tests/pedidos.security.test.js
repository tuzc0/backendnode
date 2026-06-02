'use strict';

jest.mock('../models', () => ({
    pedido:        { create: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn() },
    pedidodetalle: { bulkCreate: jest.fn() },
    producto:      { findAll: jest.fn() },
    usuario:       { findOne: jest.fn() },
    sequelize:     { transaction: jest.fn() },
    Sequelize:     {}
}));

const { pedido, pedidodetalle, producto, usuario, sequelize } = require('../models');
const pedidos = require('../controllers/pedidos.controller');
const { mockRes, makeReq } = require('./helpers/test-utils');

const MOCK_USER   = { id: 'user-uuid-123', email: 'user@test.com' };
const MOCK_PEDIDO = { id: 42, estado: 'PENDIENTE', total: '250.00', createdAt: new Date() };

beforeEach(() => {
    jest.clearAllMocks();
    sequelize.transaction.mockImplementation(async (cb) => cb({}));
});

// ── Seguridad de precios: total calculado en backend ─────────────────────────

describe('pedidos.controller.js — crearPedido calcula precios desde BD', () => {
    beforeEach(() => {
        usuario.findOne.mockResolvedValue(MOCK_USER);
        pedidodetalle.bulkCreate.mockResolvedValue([]);
        pedido.create.mockResolvedValue(MOCK_PEDIDO);
    });

    it('calcula total desde precios de BD, no acepta total del body', async () => {
        producto.findAll.mockResolvedValue([
            { id: 1, titulo: 'Producto A', precio: '100.00' },
            { id: 2, titulo: 'Producto B', precio: '50.00' }
        ]);

        await pedidos.crearPedido(
            makeReq({ items: [{ productoId: 1, cantidad: 2 }, { productoId: 2, cantidad: 1 }] }),
            mockRes(), jest.fn()
        );

        // 2×100 + 1×50 = 250
        expect(pedido.create).toHaveBeenCalledWith(
            expect.objectContaining({ total: 250, estado: 'PENDIENTE' }),
            expect.anything()
        );
    });

    it('el usuarioid proviene del JWT, no del body', async () => {
        producto.findAll.mockResolvedValue([{ id: 1, titulo: 'Prod', precio: '100.00' }]);

        await pedidos.crearPedido(
            makeReq({ items: [{ productoId: 1, cantidad: 1 }] }),
            mockRes(), jest.fn()
        );

        expect(pedido.create).toHaveBeenCalledWith(
            expect.objectContaining({ usuarioid: MOCK_USER.id }),
            expect.anything()
        );
        expect(usuario.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { email: 'user@test.com' } })
        );
    });

    it('el precio unitario en pedidodetalle viene de la BD, no del body', async () => {
        producto.findAll.mockResolvedValue([{ id: 1, titulo: 'Producto Real', precio: '999.99' }]);

        await pedidos.crearPedido(
            makeReq({ items: [{ productoId: 1, cantidad: 1 }] }),
            mockRes(), jest.fn()
        );

        expect(pedidodetalle.bulkCreate).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ preciounitario: 999.99, subtotal: 999.99, titulo: 'Producto Real' })
            ]),
            expect.anything()
        );
    });

    it('el estado inicial siempre es PENDIENTE', async () => {
        producto.findAll.mockResolvedValue([{ id: 1, titulo: 'P', precio: '10.00' }]);

        await pedidos.crearPedido(
            makeReq({ items: [{ productoId: 1, cantidad: 1 }] }),
            mockRes(), jest.fn()
        );

        expect(pedido.create).toHaveBeenCalledWith(
            expect.objectContaining({ estado: 'PENDIENTE' }),
            expect.anything()
        );
    });

    it('la respuesta de 201 no contiene usuarioid ni passwordhash', async () => {
        producto.findAll.mockResolvedValue([{ id: 1, titulo: 'P', precio: '10.00' }]);
        pedido.create.mockResolvedValue({ id: 1, estado: 'PENDIENTE', total: '10.00', createdAt: new Date() });

        const res = mockRes();
        await pedidos.crearPedido(makeReq({ items: [{ productoId: 1, cantidad: 1 }] }), res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body).not.toHaveProperty('usuarioid');
        expect(body).not.toHaveProperty('passwordhash');
    });

    it('responde 404 cuando algún producto no existe en BD', async () => {
        producto.findAll.mockResolvedValue([{ id: 1, titulo: 'Existe', precio: '100.00' }]);

        const res = mockRes();
        await pedidos.crearPedido(
            makeReq({ items: [{ productoId: 1, cantidad: 1 }, { productoId: 999, cantidad: 1 }] }),
            res, jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json.mock.calls[0][0].mensaje).toMatch(/999/);
    });

    it('responde 400 cuando hay productos duplicados en el carrito', async () => {
        const res = mockRes();
        await pedidos.crearPedido(
            makeReq({ items: [{ productoId: 1, cantidad: 2 }, { productoId: 1, cantidad: 3 }] }),
            res, jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(pedido.create).not.toHaveBeenCalled();
    });
});

// ── Seguridad de acceso: IDOR en getPedido ────────────────────────────────────

describe('pedidos.controller.js — getPedido previene IDOR', () => {
    it('devuelve 404 cuando un Usuario intenta ver un pedido ajeno (IDOR bloqueado)', async () => {
        pedido.findByPk.mockResolvedValue({
            id: 5, usuarioid: 'otro-usuario-uuid', estado: 'PENDIENTE',
            total: '100.00', detalles: [], createdAt: new Date(), updatedAt: new Date()
        });
        usuario.findOne.mockResolvedValue({ id: 'user-uuid-123', email: 'user@test.com' });

        const res = mockRes();
        await pedidos.getPedido(
            makeReq({}, { params: { id: '5' }, auth: { email: 'user@test.com', rol: 'Usuario' } }),
            res, jest.fn()
        );

        // 404 (no 403) para no revelar que el pedido existe
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('Admin puede ver cualquier pedido independientemente del propietario', async () => {
        pedido.findByPk.mockResolvedValue({
            id: 5, usuarioid: 'usuario-cualquiera-uuid', estado: 'PENDIENTE',
            total: '100.00', detalles: [], createdAt: new Date(), updatedAt: new Date()
        });

        const res = mockRes();
        await pedidos.getPedido(
            makeReq({}, { params: { id: '5' }, auth: { email: 'admin@test.com', rol: 'Administrador' } }),
            res, jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(usuario.findOne).not.toHaveBeenCalled();
    });

    it('Usuario puede ver su propio pedido', async () => {
        const OWNER_UUID = 'user-uuid-123';
        pedido.findByPk.mockResolvedValue({
            id: 5, usuarioid: OWNER_UUID, estado: 'PENDIENTE',
            total: '100.00', detalles: [], createdAt: new Date(), updatedAt: new Date()
        });
        usuario.findOne.mockResolvedValue({ id: OWNER_UUID, email: 'user@test.com' });

        const res = mockRes();
        await pedidos.getPedido(
            makeReq({}, { params: { id: '5' }, auth: { email: 'user@test.com', rol: 'Usuario' } }),
            res, jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devuelve 404 para pedido inexistente', async () => {
        pedido.findByPk.mockResolvedValue(null);

        const res = mockRes();
        await pedidos.getPedido(
            makeReq({}, { params: { id: '99999' }, auth: { email: 'user@test.com', rol: 'Usuario' } }),
            res, jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

// ── cambiarEstado: validación y actualización correcta ───────────────────────

describe('pedidos.controller.js — cambiarEstado valida estados', () => {
    it('actualiza el estado correctamente con un estado válido', async () => {
        const mockPedidoInst = {
            id: 1, estado: 'PENDIENTE', total: '100.00',
            createdAt: new Date(), updatedAt: new Date(),
            update: jest.fn().mockImplementation(async function (values) { Object.assign(this, values); })
        };
        pedido.findByPk.mockResolvedValue(mockPedidoInst);

        const res = mockRes();
        await pedidos.cambiarEstado(
            makeReq({ estado: 'EN_PROCESO' }, { params: { id: '1' }, auth: { email: 'admin@test.com', rol: 'Administrador' } }),
            res, jest.fn()
        );

        expect(mockPedidoInst.update).toHaveBeenCalledWith({ estado: 'EN_PROCESO' });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devuelve 404 para pedido inexistente al cambiar estado', async () => {
        pedido.findByPk.mockResolvedValue(null);

        const res = mockRes();
        await pedidos.cambiarEstado(
            makeReq({ estado: 'ENVIADO' }, { params: { id: '99999' }, auth: { email: 'admin@test.com', rol: 'Administrador' } }),
            res, jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
