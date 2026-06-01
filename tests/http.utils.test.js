'use strict';

const { createHttpError, sendError, setNoCacheHeaders, safeBitacora, asyncHandler } = require('../utils/http');

describe('utils/http.js', () => {
    describe('createHttpError', () => {
        it('crea un Error con statusCode', () => {
            const err = createHttpError(404, 'No encontrado');
            expect(err).toBeInstanceOf(Error);
            expect(err.statusCode).toBe(404);
            expect(err.message).toBe('No encontrado');
        });

        it('agrega código opcional si se proporciona', () => {
            const err = createHttpError(400, 'Error', 'VALIDATION_ERROR');
            expect(err.code).toBe('VALIDATION_ERROR');
        });

        it('no agrega código si no se proporciona', () => {
            const err = createHttpError(500, 'Error interno');
            expect(err.code).toBeUndefined();
        });
    });

    describe('sendError', () => {
        const mockRes = () => {
            const res = {};
            res.status = jest.fn().mockReturnValue(res);
            res.json = jest.fn().mockReturnValue(res);
            return res;
        };

        it('responde con statusCode y mensaje', () => {
            const res = mockRes();
            sendError(res, 400, 'Datos inválidos');
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ mensaje: 'Datos inválidos' });
        });

        it('incluye codigo si se proporciona', () => {
            const res = mockRes();
            sendError(res, 400, 'Error', 'CODE_X');
            expect(res.json).toHaveBeenCalledWith({ mensaje: 'Error', codigo: 'CODE_X' });
        });
    });

    describe('setNoCacheHeaders', () => {
        it('aplica los tres headers de no-cache', () => {
            const res = { set: jest.fn() };
            setNoCacheHeaders(res);
            expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
            expect(res.set).toHaveBeenCalledWith('Pragma', 'no-cache');
            expect(res.set).toHaveBeenCalledWith('Expires', '0');
        });
    });

    describe('safeBitacora', () => {
        it('llama a req.bitacora si existe', async () => {
            const bitacora = jest.fn().mockResolvedValue(undefined);
            await safeBitacora({ bitacora }, 'accion', '1');
            expect(bitacora).toHaveBeenCalledWith('accion', '1');
        });

        it('no lanza si req.bitacora no es función', async () => {
            await expect(safeBitacora({}, 'accion', '1')).resolves.toBeUndefined();
        });

        it('no lanza si bitacora rechaza la promesa', async () => {
            const req = { bitacora: jest.fn().mockRejectedValue(new Error('DB error')) };
            await expect(safeBitacora(req, 'accion', '1')).resolves.toBeUndefined();
        });

        it('no lanza si req es null', async () => {
            await expect(safeBitacora(null, 'accion', '1')).resolves.toBeUndefined();
        });
    });

    describe('asyncHandler', () => {
        it('pasa el error a next cuando el handler rechaza', async () => {
            const err = new Error('fallo async');
            const handler = jest.fn().mockRejectedValue(err);
            const next = jest.fn();
            await asyncHandler(handler)({}, {}, next);
            expect(next).toHaveBeenCalledWith(err);
        });

        it('no llama next cuando el handler resuelve', async () => {
            const handler = jest.fn().mockResolvedValue(undefined);
            const next = jest.fn();
            await asyncHandler(handler)({}, {}, next);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
