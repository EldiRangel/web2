const path    = require('path');
const express = require('express');

const router     = express.Router();
const CLIENT_DIR = path.join(__dirname, '..', '..', 'client');

// El index solo se entrega si hay sesion activa
router.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// El login no se muestra si ya hay sesion activa
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.sendFile(path.join(CLIENT_DIR, 'login.html'));
});

module.exports = router;
