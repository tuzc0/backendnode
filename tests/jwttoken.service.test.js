'use strict';

const jwt = require('jsonwebtoken');
const { GeneraToken, TiempoRestanteToken } = require('../services/jwttoken.service');

const EMAIL   = 'usuario@example.com';
const NOMBRE  = 'Usuario Prueba';
const ROL_U   = 'Usuario';
const ROL_A   = 'Administrador';

describe('services/jwttoken.service.js', () => {
    describe('GeneraToken', () => {
        it('genera un JWT con tres partes', () => {
            const token = GeneraToken(EMAIL, NOMBRE, ROL_U);
            expect(token.split('.')).toHaveLength(3);
        });

        it('acepta rol Administrador', () => {
            expect(() => GeneraToken(EMAIL, NOMBRE, ROL_A)).not.toThrow();
        });

        it('lanza con email inválido', () => {
            expect(() => GeneraToken('no-email', NOMBRE, ROL_U)).toThrow();
        });

        it('lanza con rol no permitido', () => {
            expect(() => GeneraToken(EMAIL, NOMBRE, 'SuperAdmin')).toThrow();
        });

        it('lanza con nombre vacío', () => {
            expect(() => GeneraToken(EMAIL, '', ROL_U)).toThrow();
        });

        it('el payload contiene issuer y audience correctos', () => {
            const token = GeneraToken(EMAIL, NOMBRE, ROL_U);
            const decoded = jwt.decode(token);
            expect(decoded.iss).toBe(process.env.JWT_ISSUER);
            expect(decoded.aud).toBe(process.env.JWT_AUDIENCE);
        });

        it('el token expira en el futuro', () => {
            const token = GeneraToken(EMAIL, NOMBRE, ROL_U);
            const decoded = jwt.decode(token);
            expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
        });
    });

    describe('TiempoRestanteToken', () => {
        const makeReq = (token) => ({
            header: (name) => name === 'Authorization' ? `Bearer ${token}` : null
        });

        it('retorna formato MM:SS para token válido', () => {
            const token = GeneraToken(EMAIL, NOMBRE, ROL_U);
            const tiempo = TiempoRestanteToken(makeReq(token));
            expect(tiempo).toMatch(/^\d{2}:\d{2}$/);
        });

        it('retorna null si no hay header', () => {
            const req = { header: () => null };
            expect(TiempoRestanteToken(req)).toBeNull();
        });

        it('retorna null con token mal formado', () => {
            expect(TiempoRestanteToken(makeReq('no.es.jwt'))).toBeNull();
        });

        it('retorna null con firma incorrecta', () => {
            const badToken = jwt.sign({ sub: 'x' }, 'otra-clave-secreta-completamente-diferente', { expiresIn: '1h' });
            expect(TiempoRestanteToken(makeReq(badToken))).toBeNull();
        });

        it('retorna null si Authorization no empieza con Bearer', () => {
            const req = { header: (n) => n === 'Authorization' ? 'Token algo.algo.algo' : null };
            expect(TiempoRestanteToken(req)).toBeNull();
        });

        it('retorna null si Authorization tiene más de dos partes', () => {
            const req = { header: (n) => n === 'Authorization' ? 'Bearer token extra' : null };
            expect(TiempoRestanteToken(req)).toBeNull();
        });

        it('retorna null si el token es demasiado largo', () => {
            const longToken = 'a'.repeat(5000);
            const req = { header: (n) => n === 'Authorization' ? `Bearer ${longToken}` : null };
            expect(TiempoRestanteToken(req)).toBeNull();
        });
    });
});
