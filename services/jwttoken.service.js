'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const ClaimTypes = require('../config/claimtypes');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'ServidorFeiJWT';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ClientesFeiJWT';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '20m';

const JWT_ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32;
const MAX_TOKEN_LENGTH = 4096;

const ALLOWED_ROLES = new Set(['Administrador', 'Usuario']);

if (!JWT_SECRET || JWT_SECRET.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET no configurado o inseguro. Debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`
  );
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(email) {
  if (!isNonEmptyString(email)) return false;

  const normalizedEmail = email.trim();

  return (
    normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  );
}

function isValidRole(role) {
  return isNonEmptyString(role) && ALLOWED_ROLES.has(role.trim());
}

function getBearerToken(req) {
  if (!req || typeof req.header !== 'function') {
    return null;
  }

  const authHeader = req.header('Authorization');

  if (!isNonEmptyString(authHeader)) {
    return null;
  }

  const parts = authHeader.trim().split(/\s+/);

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  const token = parts[1];

  if (!isNonEmptyString(token) || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  return token;
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    clockTolerance: 5
  });
}

function verifyTokenOrNull(token) {
  try {
    return verifyToken(token);
  } catch (error) {
    if (
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.NotBeforeError
    ) {
      return null;
    }

    throw error;
  }
}

const GeneraToken = (email, nombre, rol) => {
  if (!isValidEmail(email)) {
    throw new Error('Email inválido para generar token.');
  }

  if (!isNonEmptyString(nombre)) {
    throw new Error('Nombre inválido para generar token.');
  }

  if (!isValidRole(rol)) {
    throw new Error('Rol inválido para generar token.');
  }

  const safeEmail = email.trim().toLowerCase();
  const safeNombre = nombre.trim();
  const safeRol = rol.trim();

  const payload = Object.freeze({
    [ClaimTypes.Name]: safeEmail,
    [ClaimTypes.GivenName]: safeNombre,
    [ClaimTypes.Role]: safeRol
  });

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: crypto.randomUUID()
  });
};

const TiempoRestanteToken = (req) => {
  const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  const decodedToken = verifyTokenOrNull(token);

  if (!decodedToken || typeof decodedToken.exp !== 'number') {
    return null;
  }

  const remainingSeconds = Math.max(
    0,
    Math.floor(decodedToken.exp - Date.now() / 1000)
  );

  const minutos = Math.floor(remainingSeconds / 60);
  const segundos = remainingSeconds % 60;

  return `${minutos.toString().padStart(2, '0')}:${segundos
    .toString()
    .padStart(2, '0')}`;
};

module.exports = {
  GeneraToken,
  TiempoRestanteToken
};