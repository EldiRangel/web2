'use strict';

const express = require('express');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Rutas HTML del frontend simple.
 *
 * El servidor conserva el control de acceso: "/" y "/index.html" solo se
 * entregan con sesion; "/login" y "/login.html" solo sin sesion. El frontend
 * valida la sesion contra el API al cargar la pagina.
 *
 * Estas rutas se montan ANTES de express.static (ver server/app.js) para que
 * express.static nunca sirva index.html sin pasar por la proteccion de sesion.
 */
function createPageRoutes() {
    const router = express.Router();

    router.get('/', (req, res) => {
        if (!req.session.user) return res.redirect('/login');
        return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    router.get('/index.html', (req, res) => {
        if (!req.session.user) return res.redirect('/login');
        return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    router.get('/login', (req, res) => {
        if (req.session.user) return res.redirect('/');
        return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
    });

    router.get('/login.html', (req, res) => {
        if (req.session.user) return res.redirect('/');
        return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
    });

    return router;
}

module.exports = createPageRoutes;
