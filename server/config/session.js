
//configuracion del Middleware
const session = require('express-session'); 
const PgStore = require('connect-pg-simple')(session);
const pool    = require('./database');

const isProduction = process.env.NODE_ENV === 'production';
const cookieName   = process.env.SESSION_COOKIE_NAME || 'sid';
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-me';

// En produccion no se acepta el secreto de desarrollo.
if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET es obligatorio cuando NODE_ENV=production');
}

const sessionMiddleware = session({
    name: cookieName,
    store: new PgStore({
        pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        secure:   isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge:   parseInt(process.env.SESSION_MAX_AGE || '3600000', 10)
    }
});

//configura y crea un middleware de sesión para una aplicación Express. 
// Este middleware se utiliza para manejar sesiones de usuario, 
// permitiendo que los datos de sesión se almacenen y se mantengan entre las solicitudes HTTP.
module.exports = sessionMiddleware;
