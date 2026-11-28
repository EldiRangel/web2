'use strict';

const express = require('express');
const { AppError } = require('../errors/AppError');
const defaultAuthMiddleware = require('../middleware/authMiddleware');

function createDispatcherRouter({
    security,
    authMiddleware = defaultAuthMiddleware
} = {}) {
    if (!security || typeof security.execMethod !== 'function') {
        throw new Error('El Dispatcher requiere una instancia valida.');
    }

    const router = express.Router();

    router.post('/dispatcher', authMiddleware, async (req, res) => {
        try {
            const data = await security.execMethod(req.body, req.securityContext);
            return res.status(200).json({
                success: true,
                data: data === undefined ? null : data
            });
        } catch (error) {
            return sendError(res, error);
        }
    });

    return router;
}

function sendError(res, error) {
    const isAppError = error instanceof AppError;
    const status = isAppError ? error.status : 500;

    if (status >= 500) {
       
        console.error('[Dispatcher] Error interno:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor.'
        });
    }

    const message = status === 403
        ? 'No tienes permiso para ejecutar esta operacion.'
        : error.message;

    return res.status(status).json({
        success: false,
        message,
        ...(isAppError && error.code ? { code: error.code } : {})
    });
}

module.exports = {
    createDispatcherRouter,
    sendError
};
