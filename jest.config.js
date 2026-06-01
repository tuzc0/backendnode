'use strict';

module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'controllers/auth.controller.js',
        'services/jwttoken.service.js',
        'middlewares/auth.middleware.js',
        'routes/health.routes.js',
        'utils/http.js',
        'utils/validators.js'
    ],
    coverageThreshold: {
        global: { lines: 70, functions: 70, branches: 60 }
    }
};
