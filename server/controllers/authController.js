const Session = require('../services/Session');
const jwt = require('jsonwebtoken');
const MailOutboxService = require('../src/services/MailOutboxService');
const mailService = new MailOutboxService();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const ACCESS_TTL  = process.env.JWT_ACCESS_TTL  || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';

const authController = {

    // ------------------------------------------------------------------
    // Perfiles
    // ------------------------------------------------------------------
    async listProfiles(req, res) {
        try {
            const result = await Session.ListProfiles();
            return res.json(result);
        } catch (err) {
            console.error('[authController.listProfiles]', err);
            return res.status(500).json({
                success: false,
                message: 'Error al consultar perfiles'
            });
        }
    },

    // ------------------------------------------------------------------
    // Registro
    // ------------------------------------------------------------------
    async register(req, res) {
        try {
            const { name, email, password, profiles, autoLogin } = req.body || {};

            const result = await Session.Register({ name, email, password, profiles });

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    ...(result.validProfiles ? { validProfiles: result.validProfiles } : {})
                });
            }

            const shouldAutoLogin = autoLogin !== false;

            if (shouldAutoLogin) {
                await Session.CreateSession(req, result.user);
            }

            return res.status(201).json({
                success: true,
                message: result.message,
                session: shouldAutoLogin ? result.user : null,
                autoLogin: shouldAutoLogin
            });
        } catch (err) {
            console.error('[authController.register]', err);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor'
            });
        }
    },

    // ------------------------------------------------------------------
    // Login con JWT + bloqueo por intentos fallidos
    // ------------------------------------------------------------------
    async login(req, res) {
        const pool = require('../config/database');

        try {
            const existing = Session.GetSession(req);
            if (existing) {
                return res.json({
                    success: true,
                    message: 'Sesion ya activa',
                    session: existing
                });
            }

            const { userName, password } = req.body || {};
            const clientIp = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';

            if (!userName || !password) {
                await Session.RecordLoginAttempt(pool, userName || '', clientIp, false);
                return res.status(400).json({
                    success: false,
                    message: 'Usuario y contrasena son obligatorios'
                });
            }

            // 1. Verificar si el usuario esta bloqueado
            const user = await Session.FindUserByEmail(userName);
            if (user) {
                const locked = await Session.IsUserLocked(pool, user.id);
                if (locked) {
                    await Session.RecordLoginAttempt(pool, userName, clientIp, false);
                    return res.status(403).json({
                        success: false,
                        message: 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo despues.'
                    });
                }
            }

            // 2. Autenticar credenciales
            const auth = await Session.Authenticate(userName, password);

            if (!auth.success) {
                if (user) {
                    await Session.RecordLoginAttempt(pool, userName, clientIp, false);
                    await Session.IncrementFailedAttempts(pool, user.id);
                }
                return res.status(401).json({
                    success: false,
                    message: auth.message
                });
            }

            // 3. Exito: resetear intentos fallidos y generar tokens
            await Session.ResetFailedAttempts(pool, auth.user.UserID);

            const sessionObject = {
                UserID:  auth.user.UserID,
                Name:    auth.user.Name,
                Profile: auth.user.Profile
            };

            await Session.CreateSession(req, sessionObject);

            // Enviar el nuevo token CSRF generado durante CreateSession
            const newCsrfToken = req.session && req.session.csrfToken;
            if (newCsrfToken) {
                res.set('X-CSRF-Token', newCsrfToken);
            }

            // Access token (corta duracion)
            const accessToken = jwt.sign(
                {
                    sub: String(auth.user.UserID),
                    name: auth.user.Name,
                    profiles: auth.user.Profile.map(p => p.name)
                },
                JWT_SECRET,
                { algorithm: 'HS256', expiresIn: ACCESS_TTL }
            );

            // Refresh token (larga duracion, guardado en BD y cookie HttpOnly)
            const refreshToken = jwt.sign(
                {
                    sub: String(auth.user.UserID),
                    type: 'refresh'
                },
                JWT_SECRET,
                { algorithm: 'HS256', expiresIn: REFRESH_TTL }
            );

            await Session.SaveRefreshToken(pool, auth.user.UserID, refreshToken, REFRESH_TTL);

            // Cookie HttpOnly para refresh token
            const isProduction = process.env.NODE_ENV === 'production';
            const cookieOpts = {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'lax',
                path: '/',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
            };
            res.cookie('refresh_token', refreshToken, cookieOpts);

            return res.json({
                success: true,
                message: 'Login exitoso',
                session: sessionObject,
                accessToken,
                tokenType: 'Bearer',
                expiresIn: ACCESS_TTL
            });
        } catch (err) {
            console.error('[authController.login]', err);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor'
            });
        }
    },

    // ------------------------------------------------------------------
    // Refresh token: obtener nuevo access token
    // ------------------------------------------------------------------
    async refreshToken(req, res) {
        const pool = require('../config/database');

        try {
            const refreshToken = req.cookies && req.cookies.refresh_token;
            if (!refreshToken) {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token requerido.'
                });
            }

            // Verificar firma y expiracion del JWT
            let payload;
            try {
                payload = jwt.verify(refreshToken, JWT_SECRET);
            } catch (err) {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token invalido o expirado.'
                });
            }

            if (payload.type !== 'refresh') {
                return res.status(401).json({
                    success: false,
                    message: 'Token invalido.'
                });
            }

            const userId = Number(payload.sub);

            // Verificar que el refresh token exista en BD, no este revocado ni expirado
            const stored = await Session.FindRefreshToken(pool, refreshToken);
            if (!stored || stored.revoked || new Date(stored.expires_at) < new Date()) {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token invalido o revocado.'
                });
            }

            // Verificar que el usuario siga activo
            const user = await Session.FindUserById(pool, userId);
            if (!user || user.active !== true) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario invalido o inactivo.'
                });
            }

            const profiles = await Session.GetProfilesByUserId(userId);

            const sessionObject = {
                UserID: user.id,
                Name: user.name,
                Profile: profiles.map(p => ({ id: p.id, name: p.name, description: p.description }))
            };

            // Rotar refresh token: revocar el viejo y crear uno nuevo
            await Session.RevokeRefreshToken(pool, refreshToken);

            const newRefreshToken = jwt.sign(
                {
                    sub: String(user.id),
                    type: 'refresh'
                },
                JWT_SECRET,
                { algorithm: 'HS256', expiresIn: REFRESH_TTL }
            );

            await Session.SaveRefreshToken(pool, user.id, newRefreshToken, REFRESH_TTL);

            const isProduction = process.env.NODE_ENV === 'production';
            const cookieOpts = {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'lax',
                path: '/',
                maxAge: 7 * 24 * 60 * 60 * 1000
            };
            res.cookie('refresh_token', newRefreshToken, cookieOpts);

            // Nuevo access token
            const accessToken = jwt.sign(
                {
                    sub: String(user.id),
                    name: user.name,
                    profiles: profiles.map(p => p.name)
                },
                JWT_SECRET,
                { algorithm: 'HS256', expiresIn: ACCESS_TTL }
            );

            return res.json({
                success: true,
                message: 'Token renovado.',
                accessToken,
                tokenType: 'Bearer',
                expiresIn: ACCESS_TTL,
                session: sessionObject
            });
        } catch (err) {
            console.error('[authController.refreshToken]', err);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor.'
            });
        }
    },

    // ------------------------------------------------------------------
    // Sesion actual (Express session)
    // ------------------------------------------------------------------
    getSession(req, res) {
        const data = Session.GetSession(req);
        if (!data) {
            return res.status(401).json({
                success: false,
                message: 'No hay una sesion activa'
            });
        }
        return res.json({ success: true, session: data });
    },

    // ------------------------------------------------------------------
    // Logout: cerrar sesion Express y revocar refresh token
    // ------------------------------------------------------------------
    async logout(req, res) {
        const pool = require('../config/database');

        try {
            const existing = Session.GetSession(req);
            if (!existing) {
                // Ainda revocar refresh token si existe
                const refreshToken = req.cookies && req.cookies.refresh_token;
                if (refreshToken) {
                    await Session.RevokeRefreshToken(pool, refreshToken);
                    res.clearCookie('refresh_token', { path: '/' });
                }
                return res.json({ success: true, message: 'No habia sesion activa' });
            }

            const result = await Session.CloseSession(req, res);

            const refreshToken = req.cookies && req.cookies.refresh_token;
            if (refreshToken) {
                await Session.RevokeRefreshToken(pool, refreshToken);
                res.clearCookie('refresh_token', { path: '/' });
            }

            return res.json(result);
        } catch (err) {
            console.error('[authController.logout]', err);
            return res.status(500).json({
                success: false,
                message: 'Error al cerrar sesion'
            });
        }
    },

    // ------------------------------------------------------------------
    // Recuperacion de contrasena: solicitar codigo
    // ------------------------------------------------------------------
    async recoverPassword(req, res) {
        const pool = require('../config/database');

        try {
            const { email } = req.body || {};
            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'El correo electronico es obligatorio.'
                });
            }

            const user = await Session.FindUserByEmail(email);
            if (!user) {
                // No revelar si el email existe o no
                return res.json({
                    success: true,
                    message: 'Si el correo existe, se ha enviado un codigo de recuperacion.'
                });
            }

            // Generar token de recuperacion (valido 1 hora)
            const recoveryToken = require('crypto').randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

            // Guardar token en BD para verificacion posterior
            await Session.SavePasswordRecovery(pool, user.id, recoveryToken, expiresAt);

            // Encolar correo en el outbox
            const userName = user.name || email.split('@')[0];
            await mailService.crearRecuperacionClave({
                toEmail: email,
                toName: userName,
                token: recoveryToken,
                expiresAt: expiresAt.toISOString()
            });

            // En desarrollo, devolver el token para pruebas sin SMTP
            const isProduction = process.env.NODE_ENV === 'production';
            const isDev = !isProduction;

            return res.json({
                success: true,
                message: 'Si el correo existe, se ha enviado un codigo de recuperacion.',
                ...(isDev ? { recoveryToken, expiresAt } : {})
            });
        } catch (err) {
            console.error('[authController.recoverPassword]', err);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor.'
            });
        }
    },

    // ------------------------------------------------------------------
    // Recuperacion: verificar codigo de recuperacion
    // ------------------------------------------------------------------
    async verifyRecovery(req, res) {
        const pool = require('../config/database');

        try {
            const { token } = req.body || {};
            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: 'El token de recuperacion es obligatorio.'
                });
            }

            const valid = await Session.VerifyPasswordRecovery(pool, token);
            if (!valid) {
                return res.status(400).json({
                    success: false,
                    message: 'Token invalido o expirado.'
                });
            }

            return res.json({ success: true, message: 'Token valido.' });
        } catch (err) {
            console.error('[authController.verifyRecovery]', err);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor.'
            });
        }
    },

    // ------------------------------------------------------------------
    // Recuperacion: establecer nueva contrasena
    // ------------------------------------------------------------------
    async resetPassword(req, res) {
        const pool = require('../config/database');

        try {
            const { token, password } = req.body || {};
            if (!token || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Token y nueva contrasena son obligatorios.'
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'La contrasena debe tener al menos 6 caracteres.'
                });
            }

            const result = await Session.ResetPasswordWithToken(pool, token, password);
            if (!result.success) {
                return res.status(400).json(result);
            }

            // Revocar todos los refresh tokens del usuario (forzar nuevo login)
            await Session.RevokeAllRefreshTokens(pool, result.userId);

            return res.json({
                success: true,
                message: 'Contrasena restablecida correctamente. Inicia sesion de nuevo.'
            });
        } catch (err) {
            console.error('[authController.resetPassword]', err);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor.'
            });
        }
    },

    // ------------------------------------------------------------------
    protectedRoute(req, res) {
        return res.json({
            success: true,
            message: 'Acceso concedido a la ruta privada',
            session: req.sessionUser
        });
    }
};

module.exports = authController;
