'use strict';

jest.mock('../models', () => ({
    sequelize: { authenticate: jest.fn() }
}));

const request  = require('supertest');
const express  = require('express');
const { sequelize } = require('../models');

const app = express();
app.use('/health', require('../routes/health.routes'));

describe('routes/health.routes.js', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('GET /health', () => {
        it('responde 200 con status ok', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.service).toBe('backendnode');
        });

        it('incluye uptime y timestamp', async () => {
            const res = await request(app).get('/health');
            expect(res.body).toHaveProperty('uptime');
            expect(res.body).toHaveProperty('timestamp');
            expect(typeof res.body.uptime).toBe('number');
        });
    });

    describe('GET /health/db', () => {
        it('responde 200 cuando la BD conecta', async () => {
            sequelize.authenticate.mockResolvedValueOnce(undefined);
            const res = await request(app).get('/health/db');
            expect(res.status).toBe(200);
            expect(res.body.db).toBe('conectado');
            expect(res.body.status).toBe('ok');
        });

        it('responde 503 cuando la BD no conecta', async () => {
            sequelize.authenticate.mockRejectedValueOnce(new Error('Connection refused'));
            const res = await request(app).get('/health/db');
            expect(res.status).toBe(503);
            expect(res.body.db).toBe('no disponible');
            expect(res.body.status).toBe('error');
        });

        it('incluye timestamp en ambas respuestas', async () => {
            sequelize.authenticate.mockResolvedValueOnce(undefined);
            const res = await request(app).get('/health/db');
            expect(res.body).toHaveProperty('timestamp');
        });
    });
});
