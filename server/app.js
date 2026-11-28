require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const sessionMiddleware = require('./config/session');
const createPageRoutes = require('./routes/pageRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const payrollRoutes = require('./routes/payrollRoutes');
const security = require('./src/security');
const { createDispatcherRouter } = require('./src/dispatcher/Server');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const isProduction = process.env.NODE_ENV === 'production';

// Rate limit: login y endpoints sensibles (max 10 peticiones por minuto por IP)
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Demasiados intentos. Intenta de nuevo en un minuto.' }
});

// Rate limit: API general (max 100 peticiones por minuto por IP)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

// CSRF: valida token en sesion para metodos que cambian estado (excepto rutas publicas de auth)
function csrfProtection(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }
    const publicAuth = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/recover',
        '/api/auth/verify',
        '/api/auth/reset',
        '/api/auth/refresh',
        '/api/auth/logout'
    ];
    if (publicAuth.includes(req.path)) {
        return next();
    }
    const token = req.headers['x-csrf-token'] || req.body._csrf || req.query._csrf;
    const sessionToken = req.session && req.session.csrfToken;
    if (!token || !sessionToken || token !== sessionToken) {
        return res.status(403).json({ success: false, message: 'Token CSRF invalido.' });
    }
    next();
}

function generateCsrfToken(req, res, next) {
    if (req.session) {
        if (!req.session.csrfToken) {
            req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        }
        res.locals.csrfToken = req.session.csrfToken;
        res.set('X-CSRF-Token', req.session.csrfToken);
    }
    next();
}

async function createApp() {
    const app = express();

    app.set('trust proxy', 1);

    // Seguridad de cabeceras (Helmet)
    app.use(helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                frameAncestors: ["'none'"],
                formAction: ["'self'"],
                imgSrc: ["'self'", 'data:'],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"]
            }
        },
        crossOriginEmbedderPolicy: false,
        hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }));

    // CORS con credenciales
    app.use(cors({
        origin: isProduction ? (process.env.CORS_ORIGIN || 'http://localhost:3000') : true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization']
    }));

    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Cabeceras anti-cache para rutas de API
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.set('Pragma', 'no-cache');
        }
        next();
    });

    // Sesion de Express. Debe ejecutarse antes de las paginas y del API.
    app.use(sessionMiddleware);

    // Generar/injectar token CSRF en sesion
    app.use(generateCsrfToken);

    // Proteccion CSRF para mutaciones
    app.use(csrfProtection);

    // Rate limit general en API
    app.use('/api', apiLimiter);

    // Rate limit mas estricto en login/registro/recuperacion
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
    app.use('/api/auth/recover', authLimiter);
    app.use('/api/auth/verify', authLimiter);
    app.use('/api/auth/reset', authLimiter);

    // Paginas del frontend simple (protegidas según la sesión).
    app.use(createPageRoutes());

    // Archivos estáticos del frontend (HTML, CSS, JS vanilla)
    app.use(express.static(PUBLIC_DIR, { index: false }));

    // API
    app.get('/api', (req, res) => {
        res.json({
            success: true,
            message: 'API activa. POST /api/auth/login | POST /api/dispatcher',
            csrfToken: res.locals.csrfToken || null
        });
    });

    app.use('/api', authRoutes);
    app.use(payrollRoutes);

    // Unico endpoint para operaciones de negocio.
    app.use('/api', createDispatcherRouter({ security }));

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
