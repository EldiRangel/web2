const Session = require('../services/Session');

const authController = {

  
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

    async login(req, res) {
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

            const auth = await Session.Authenticate(userName, password);
            if (!auth.success) {
                return res.status(401).json({
                    success: false,
                    message: auth.message
                });
            }

            const sessionObject = {
                UserID:  auth.user.UserID,
                Name:    auth.user.Name,
                Profile: auth.user.Profile
            };

            await Session.CreateSession(req, sessionObject);

            return res.json({
                success: true,
                message: 'Login exitoso',
                session: sessionObject
            });
        } catch (err) {
            console.error('[authController.login]', err);
            return res.status(500).json({
                success: false,
                message: 'Error interno del servidor'
            });
        }
    },

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

    async logout(req, res) {
        try {
            const existing = Session.GetSession(req);
            if (!existing) {
                return res.json({ success: true, message: 'No habia sesion activa' });
            }
            const result = await Session.CloseSession(req, res);
            return res.json(result);
        } catch (err) {
            console.error('[authController.logout]', err);
            return res.status(500).json({
                success: false,
                message: 'Error al cerrar sesion'
            });
        }
    },

    protectedRoute(req, res) {
        return res.json({
            success: true,
            message: 'Acceso concedido a la ruta privada',
            session: req.sessionUser
        });
    }
};

module.exports = authController;
