'use strict'

const router = require('express').Router()
const { sequelize } = require('../models')

// GET: /health
router.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'backendnode',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    })
})

// GET: /health/db
router.get('/db', async (req, res) => {
    try {
        await sequelize.authenticate()
        res.status(200).json({
            status: 'ok',
            service: 'backendnode',
            db: 'conectado',
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        res.status(503).json({
            status: 'error',
            service: 'backendnode',
            db: 'no disponible',
            timestamp: new Date().toISOString()
        })
    }
})

module.exports = router
