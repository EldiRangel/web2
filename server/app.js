require('dotenv').config();
const express = require('express');
const path = require('path');

const sessionMiddleware = require('./config/session');
const createPageRoutes = require('./routes/pageRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const security = require('./src/security');
const { createDispatcherRouter } = require('./src/dispatcher/Server');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

async function createApp() {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Sesion de Express. Debe ejecutarse antes de las paginas y del API.
    app.use(sessionMiddleware);

    // Paginas del frontend simple (protegidas según la sesión).
    // Se montan ANTES de express.static para que "/" nunca sirva index.html
    // sin sesion y para cubrir las variantes .html.
    app.use(createPageRoutes());

    // Archivos estáticos del frontend (HTML, CSS, JS vanilla)
    // index: false para que express.static no sirva index.html en "/" ni en
    // otras rutas, dejando el control de acceso a createPageRoutes().
    app.use(express.static(PUBLIC_DIR, { index: false }));

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

    // Paginas del frontend simple (protegidas según la sesión)
    app.use(createPageRoutes());

    app.use((req, res) => {
        res.status(404).json({ success: false, message: 'Ruta no encontrada' });
    });

    app.use(errorHandler);

    return app;
}

async function start() {
    const app = await createApp();

    return app.listen(PORT, () => {
        const url = `http://localhost:${PORT}`;
        console.log(`Server (Dispatcher) escuchando en ${url}`);
        console.log(`Frontend simple disponible en ${url}`);
    });
}

if (require.main === module) {
    start().catch(error => {
        console.error('[Server] No se pudo iniciar:', error);
        process.exit(1);
    });
}

module.exports = {
    createApp,
    start
};
