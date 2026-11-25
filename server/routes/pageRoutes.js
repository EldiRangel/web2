'use strict';

const express = require('express');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Rutas HTML del frontend simple.
 *
 * El servidor conserva el control de acceso: "/" solo se entrega con sesion y
 * "/login" solo sin sesion. El frontend valida la sesion contra el API.
 */
function createPageRoutes() {
    const router = express.Router();

    router.get('/', (req, res) => {
        if (!req.session.user) return res.redirect('/login');
        return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    router.get('/login', (req, res) => {
        if (req.session.user) return res.redirect('/');
        return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
    });

    return router;
}

module.exports = createPageRoutes;
