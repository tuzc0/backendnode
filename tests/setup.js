'use strict';

// Variables de entorno para pruebas — NO son credenciales reales.
process.env.JWT_SECRET    = 'jest-test-secret-for-unit-tests-min32chars!!';
process.env.JWT_ISSUER    = 'ServidorFeiJWT';
process.env.JWT_AUDIENCE  = 'ClientesFeiJWT';
process.env.JWT_EXPIRES_IN = '20m';
process.env.NODE_ENV       = 'test';
process.env.SERVER_PORT    = '3099';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:8080';
process.env.ENABLE_SWAGGER = 'false';
process.env.FILES_IN_DB    = 'false';
process.env.DB_HOST        = 'localhost';
process.env.DB_DATABASE    = 'test_db';
process.env.DB_USER        = 'test_user';
process.env.DB_PASSWORD    = 'test_pass';
process.env.DB_PORT        = '3306';
