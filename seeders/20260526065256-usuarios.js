'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'gvera@uv.mx';
const USER_EMAIL = process.env.SEED_USER_EMAIL || 'patito@uv.mx';

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const USER_PASSWORD = process.env.SEED_USER_PASSWORD;

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Guillermo Vera';
const USER_NAME = process.env.SEED_USER_NAME || 'Usuario de prueba';

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,128}$/;

function validateSeedPassword(password, variableName) {
  if (!password || !PASSWORD_POLICY.test(password)) {
    throw new Error(
      `${variableName} debe estar configurada y cumplir política segura: mínimo 8 caracteres, mayúscula, minúscula, número y símbolo.`
    );
  }
}

module.exports = {
  async up(queryInterface) {
    validateSeedPassword(ADMIN_PASSWORD, 'SEED_ADMIN_PASSWORD');
    validateSeedPassword(USER_PASSWORD, 'SEED_USER_PASSWORD');

    const administradorUUID = crypto.randomUUID();
    const usuarioUUID = crypto.randomUUID();

    await queryInterface.bulkInsert('rol', [
      {
        id: administradorUUID,
        nombre: 'Administrador',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: usuarioUUID,
        nombre: 'Usuario',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    await queryInterface.bulkInsert('usuario', [
      {
        id: crypto.randomUUID(),
        email: ADMIN_EMAIL,
        passwordhash: await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS),
        nombre: ADMIN_NAME,
        rolid: administradorUUID,
        protegido: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: crypto.randomUUID(),
        email: USER_EMAIL,
        passwordhash: await bcrypt.hash(USER_PASSWORD, BCRYPT_SALT_ROUNDS),
        nombre: USER_NAME,
        rolid: usuarioUUID,
        protegido: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('usuario', {
      email: {
        [Sequelize.Op.in]: [ADMIN_EMAIL, USER_EMAIL]
      }
    });

    await queryInterface.bulkDelete('rol', {
      nombre: {
        [Sequelize.Op.in]: ['Administrador', 'Usuario']
      }
    });
  }
};