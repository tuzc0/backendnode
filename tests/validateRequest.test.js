'use strict';

jest.mock('express-validator', () => ({
    validationResult: jest.fn()
}));

const { validationResult } = require('express-validator');
const { validateRequest } = require('../utils/validators');

describe('utils/validators.js — validateRequest', () => {
    it('no lanza si la validación no tiene errores', () => {
        validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
        expect(() => validateRequest({})).not.toThrow();
    });

    it('lanza con statusCode 400 si hay errores de validación', () => {
        validationResult.mockReturnValue({ isEmpty: () => false, array: () => [{ msg: 'campo requerido' }] });
        let err;
        try { validateRequest({}); } catch (e) { err = e; }
        expect(err.statusCode).toBe(400);
        expect(err.details).toEqual([{ msg: 'campo requerido' }]);
    });
});
