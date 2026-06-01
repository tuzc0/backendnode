'use strict';

const { isNonEmptyString, normalizeText, parsePositiveInteger, getPagination } = require('../utils/validators');

describe('utils/validators.js', () => {
    describe('isNonEmptyString', () => {
        it('retorna true para string con contenido', () => {
            expect(isNonEmptyString('hola')).toBe(true);
        });

        it('retorna false para string vacío', () => {
            expect(isNonEmptyString('')).toBe(false);
        });

        it('retorna false para string solo espacios', () => {
            expect(isNonEmptyString('   ')).toBe(false);
        });

        it('retorna false para null y undefined', () => {
            expect(isNonEmptyString(null)).toBe(false);
            expect(isNonEmptyString(undefined)).toBe(false);
        });

        it('retorna false para número', () => {
            expect(isNonEmptyString(123)).toBe(false);
        });
    });

    describe('normalizeText', () => {
        it('recorta espacios extremos y colapsa internos', () => {
            expect(normalizeText('  hola   mundo  ')).toBe('hola mundo');
        });

        it('retorna string vacío si no es string', () => {
            expect(normalizeText(null)).toBe('');
            expect(normalizeText(undefined)).toBe('');
            expect(normalizeText(42)).toBe('');
        });
    });

    describe('parsePositiveInteger', () => {
        it('parsea string numérico positivo', () => {
            expect(parsePositiveInteger('5')).toBe(5);
            expect(parsePositiveInteger('1')).toBe(1);
        });

        it('parsea número positivo directamente', () => {
            expect(parsePositiveInteger(10)).toBe(10);
        });

        it('lanza con statusCode 400 para valor negativo', () => {
            let err;
            try { parsePositiveInteger('-1'); } catch (e) { err = e; }
            expect(err.statusCode).toBe(400);
        });

        it('lanza para cero', () => {
            expect(() => parsePositiveInteger('0')).toThrow();
        });

        it('lanza para texto no numérico', () => {
            expect(() => parsePositiveInteger('abc')).toThrow();
        });

        it('usa el nombre del campo en el mensaje de error', () => {
            let err;
            try { parsePositiveInteger('x', 'precio'); } catch (e) { err = e; }
            expect(err.message).toContain('precio');
        });
    });

    describe('getPagination', () => {
        it('retorna defaults cuando query está vacío', () => {
            const req = { query: {} };
            const { page, limit, offset } = getPagination(req);
            expect(page).toBe(1);
            expect(limit).toBe(20);
            expect(offset).toBe(0);
        });

        it('respeta maxLimit', () => {
            const req = { query: { page: '1', limit: '200' } };
            expect(getPagination(req).limit).toBe(50);
        });

        it('calcula offset correctamente', () => {
            const req = { query: { page: '3', limit: '10' } };
            const { offset } = getPagination(req, 50, 10);
            expect(offset).toBe(20);
        });

        it('acepta maxLimit y defaultLimit personalizados', () => {
            const req = { query: { limit: '150' } };
            const { limit } = getPagination(req, 100, 25);
            expect(limit).toBe(100);
        });
    });
});
