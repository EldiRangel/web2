require('dotenv').config();
const path    = require('path');
const express = require('express');

const sessionMiddleware = require('./config/session');
const pageRoutes        = require('./routes/pageRoutes');
const authRoutes        = require('./routes/authRoutes');
const errorHandler      = require('./middleware/errorHandler');
const security          = require('./src/security');
const { createDispatcherRouter } = require('./src/dispatcher/Server');

const app  = express();
const PORT = process.env.PORT || 3000;

// El cliente (html, css, js, imagenes) vive aparte, en su propia carpeta
const CLIENT_DIR = path.join(__dirname, '..', 'client');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos estaticos del cliente
app.use(express.static(CLIENT_DIR, { index: false }));

// Sesion de Express
app.use(sessionMiddleware);

// Paginas (protegidas segun la sesion)
app.use(pageRoutes);

// API
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'API activa. POST /api/auth/login | POST /api/dispatcher'
    });
});

app.use('/api', authRoutes);

// Unico endpoint para operaciones de negocio.
// La identidad se obtiene de req.session dentro del Dispatcher.
app.use('/api', createDispatcherRouter({ security }));

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

app.use(errorHandler);

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server (Dispatcher) escuchando en http://localhost:${PORT}`);
    });
}

module.exports = app;
