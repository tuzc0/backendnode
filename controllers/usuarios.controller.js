'use strict';

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { usuario, rol, sequelize } = require('../models');
const { body, param, query } = require('express-validator');
const { createHttpError, safeBitacora } = require('../utils/http');
const { validateRequest, parsePositiveInteger, normalizeText } = require('../utils/validators');
const ClaimTypes = require('../config/claimtypes');

let self = {};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const BCRYPT_SALT_ROUNDS = 12;

function normalizeEmail(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().toLowerCase();
}

function getCurrentUserEmail(req) {
    const email = req?.decodedToken?.[ClaimTypes.Name];

    if (email) {
        return normalizeEmail(email);
    }

    return null;
}

function getRoleName(userData) {
    const plain = typeof userData.get === 'function'
        ? userData.get({ plain: true })
        : userData;

    return plain.rol?.nombre ?? plain['rol.nombre'] ?? null;
}

function sanitizeUsuarioOutput(userData) {
    const plain = typeof userData.get === 'function'
        ? userData.get({ plain: true })
        : userData;

    return {
        id: plain.id,
        email: plain.email,
        nombre: plain.nombre,
        rol: getRoleName(plain)
    };
}

async function findRoleByName(roleName) {
    const normalizedRole = normalizeText(roleName);

    const roleData = await rol.findOne({
        where: {
            nombre: normalizedRole
        },
        attributes: ['id', 'nombre']
    });

    if (!roleData) {
        throw createHttpError(400, 'Rol inválido.');
    }

    return roleData;
}

self.emailParamValidator = [
    param('email')
        .exists({ checkFalsy: true })
        .withMessage('El email es obligatorio.')
        .bail()
        .isEmail()
        .withMessage('El email no tiene un formato válido.')
        .bail()
        .isLength({ max: 150 })
        .withMessage('El email no debe superar 150 caracteres.')
];

self.paginationValidator = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('La página debe ser un número entero positivo.'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: MAX_LIMIT })
        .withMessage(`El límite debe estar entre 1 y ${MAX_LIMIT}.`)
];

self.usuarioCreateValidator = [
    body('email')
        .exists({ checkFalsy: true })
        .withMessage('El email es obligatorio.')
        .bail()
        .isEmail()
        .withMessage('El email no tiene un formato válido.')
        .bail()
        .isLength({ max: 150 })
        .withMessage('El email no debe superar 150 caracteres.'),

    body('password')
        .exists({ checkFalsy: true })
        .withMessage('La contraseña es obligatoria.')
        .bail()
        .isString()
        .withMessage('La contraseña debe ser texto.')
        .bail()
        .isLength({ min: 8, max: 72 })
        .withMessage('La contraseña debe tener entre 8 y 72 caracteres.')
        .bail()
        .matches(/[a-z]/)
        .withMessage('La contraseña debe tener al menos una minúscula.')
        .bail()
        .matches(/[A-Z]/)
        .withMessage('La contraseña debe tener al menos una mayúscula.')
        .bail()
        .matches(/[/d]]/)
        .withMessage('La contraseña debe tener al menos un número.'),

    body('nombre')
        .exists({ checkFalsy: true })
        .withMessage('El nombre es obligatorio.')
        .bail()
        .isString()
        .withMessage('El nombre debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 2, max: 120 })
        .withMessage('El nombre debe tener entre 2 y 120 caracteres.')
        .bail()
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s.'-]+$/)
        .withMessage('El nombre contiene caracteres no permitidos.'),

    body('rol')
        .exists({ checkFalsy: true })
        .withMessage('El rol es obligatorio.')
        .bail()
        .isString()
        .withMessage('El rol debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('El rol debe tener entre 3 y 50 caracteres.')
        .bail()
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
        .withMessage('El rol contiene caracteres no permitidos.'),

    body('id').not().exists().withMessage('No está permitido enviar id.'),
    body('passwordhash').not().exists().withMessage('No está permitido enviar passwordhash.'),
    body('rolid').not().exists().withMessage('No está permitido enviar rolid.'),
    body('protegido').not().exists().withMessage('No está permitido modificar protegido.'),
    body('createdAt').not().exists().withMessage('No está permitido modificar createdAt.'),
    body('updatedAt').not().exists().withMessage('No está permitido modificar updatedAt.')
];

self.usuarioUpdateValidator = [
    body('email').not().exists().withMessage('No está permitido modificar el email desde este endpoint.'),

    body('password')
        .optional()
        .isString()
        .withMessage('La contraseña debe ser texto.')
        .bail()
        .isLength({ min: 8, max: 72 })
        .withMessage('La contraseña debe tener entre 8 y 72 caracteres.')
        .bail()
        .matches(/[a-z]/)
        .withMessage('La contraseña debe tener al menos una minúscula.')
        .bail()
        .matches(/[A-Z]/)
        .withMessage('La contraseña debe tener al menos una mayúscula.')
        .bail()
        .matches(/\d/)
        .withMessage('La contraseña debe tener al menos un número.'),

    body('nombre')
        .exists({ checkFalsy: true })
        .withMessage('El nombre es obligatorio.')
        .bail()
        .isString()
        .withMessage('El nombre debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 2, max: 120 })
        .withMessage('El nombre debe tener entre 2 y 120 caracteres.')
        .bail()
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s.'-]+$/)
        .withMessage('El nombre contiene caracteres no permitidos.'),

    body('rol')
        .exists({ checkFalsy: true })
        .withMessage('El rol es obligatorio.')
        .bail()
        .isString()
        .withMessage('El rol debe ser texto.')
        .bail()
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('El rol debe tener entre 3 y 50 caracteres.')
        .bail()
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
        .withMessage('El rol contiene caracteres no permitidos.'),

    body('id').not().exists().withMessage('No está permitido modificar id.'),
    body('passwordhash').not().exists().withMessage('No está permitido modificar passwordhash.'),
    body('rolid').not().exists().withMessage('No está permitido modificar rolid.'),
    body('protegido').not().exists().withMessage('No está permitido modificar protegido.'),
    body('createdAt').not().exists().withMessage('No está permitido modificar createdAt.'),
    body('updatedAt').not().exists().withMessage('No está permitido modificar updatedAt.')
];

// GET: api/usuarios
self.getAll = async function (req, res, next) {
    try {
        validateRequest(req);

        const page = req.query.page ? parsePositiveInteger(req.query.page, 'page') : 1;
        const limit = req.query.limit ? parsePositiveInteger(req.query.limit, 'limit') : DEFAULT_LIMIT;
        const safeLimit = Math.min(limit, MAX_LIMIT);
        const offset = (page - 1) * safeLimit;

        const { count, rows } = await usuario.findAndCountAll({
            attributes: ['id', 'email', 'nombre'],
            include: [
                {
                    model: rol,
                    attributes: ['nombre']
                }
            ],
            order: [['email', 'ASC']],
            limit: safeLimit,
            offset: offset
        });

        res.status(200).json({
            total: count,
            page: page,
            limit: safeLimit,
            data: rows.map(sanitizeUsuarioOutput)
        });
    } catch (error) {
        next(error);
    }
};

// GET: api/usuarios/email
self.get = async function (req, res, next) {
    try {
        validateRequest(req);

        const email = normalizeEmail(req.params.email);

        const data = await usuario.findOne({
            where: {
                email: email
            },
            attributes: ['id', 'email', 'nombre'],
            include: [
                {
                    model: rol,
                    attributes: ['nombre']
                }
            ]
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado.'
            });
        }

        res.status(200).json(sanitizeUsuarioOutput(data));
    } catch (error) {
        next(error);
    }
};

// POST: api/usuarios
self.create = async function (req, res, next) {
    try {
        validateRequest(req);

        const email = normalizeEmail(req.body.email);
        const nombre = normalizeText(req.body.nombre);
        const password = req.body.password;
        const roleData = await findRoleByName(req.body.rol);

        const exists = await usuario.findOne({
            where: {
                email: email
            },
            attributes: ['id']
        });

        if (exists) {
            return res.status(409).json({
                mensaje: 'Ya existe un usuario con ese email.'
            });
        }

        const passwordhash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        const data = await sequelize.transaction(async (transaction) => {
            return await usuario.create(
                {
                    id: crypto.randomUUID(),
                    email: email,
                    passwordhash: passwordhash,
                    nombre: nombre,
                    rolid: roleData.id,
                    protegido: false
                },
                { transaction }
            );
        });

        await safeBitacora(req, 'usuarios.crear', data.email);

        res.status(201).json({
            id: data.id,
            email: data.email,
            nombre: data.nombre,
            rol: roleData.nombre
        });
    } catch (error) {
        next(error);
    }
};

// PUT: api/usuarios/email
self.update = async function (req, res, next) {
    try {
        validateRequest(req);

        const email = normalizeEmail(req.params.email);
        const nombre = normalizeText(req.body.nombre);
        const roleData = await findRoleByName(req.body.rol);
        const currentUserEmail = getCurrentUserEmail(req);

        const data = await usuario.findOne({
            where: {
                email: email
            },
            attributes: ['id', 'email', 'nombre', 'passwordhash', 'rolid', 'protegido'],
            include: [
                {
                    model: rol,
                    attributes: ['id', 'nombre']
                }
            ]
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado.'
            });
        }

        const currentRoleName = getRoleName(data);

        if (data.protegido === true && currentRoleName !== roleData.nombre) {
            return res.status(403).json({
                mensaje: 'No se puede cambiar el rol de un usuario protegido.'
            });
        }

        if (currentUserEmail === email && currentRoleName !== roleData.nombre) {
            return res.status(403).json({
                mensaje: 'No puedes cambiar tu propio rol.'
            });
        }

        const updateData = {
            nombre: nombre,
            rolid: roleData.id
        };

        if (req.body.password) {
            updateData.passwordhash = await bcrypt.hash(req.body.password, BCRYPT_SALT_ROUNDS);
        }

        await sequelize.transaction(async (transaction) => {
            await data.update(updateData, { transaction });
        });

        await safeBitacora(req, 'usuarios.editar', email);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// DELETE: api/usuarios/email
self.delete = async function (req, res, next) {
    try {
        validateRequest(req);

        const email = normalizeEmail(req.params.email);
        const currentUserEmail = getCurrentUserEmail(req);

        if (currentUserEmail === email) {
            return res.status(403).json({
                mensaje: 'No puedes eliminar tu propio usuario.'
            });
        }

        const data = await usuario.findOne({
            where: {
                email: email
            },
            attributes: ['id', 'email', 'protegido']
        });

        if (!data) {
            return res.status(404).json({
                mensaje: 'Usuario no encontrado.'
            });
        }

        if (data.protegido === true) {
            return res.status(403).json({
                mensaje: 'No se puede eliminar un usuario protegido.'
            });
        }

        const deletedRows = await sequelize.transaction(async (transaction) => {
            return await usuario.destroy({
                where: {
                    email: email,
                    protegido: false
                },
                transaction
            });
        });

        if (deletedRows === 0) {
            return res.status(409).json({
                mensaje: 'No se pudo eliminar el usuario.'
            });
        }

        await safeBitacora(req, 'usuarios.eliminar', email);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

module.exports = self;
