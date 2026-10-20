'use strict';

const Session = require('../../services/Session');

/**
 * Obtiene la identidad exclusivamente de la sesion validada por Express
 * Session. Los perfiles y permisos nunca se toman del cuerpo de la peticion.
 */
module.exports = function authMiddleware(req, res, next) {
    const sessionUser = Session.GetSession(req);

    if (!sessionUser) {
        return res.status(401).json({
            success: false,
            message: 'No hay una sesion activa. Inicia sesion primero.'
        });
    }

    const userId = Number(sessionUser.UserID);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            success: false,
            message: 'La sesion no contiene un usuario valido.'
        });
    }

    req.sessionUser = sessionUser;
    req.securityContext = Object.freeze({
        userId,
        name: sessionUser.Name,
        sessionId: req.sessionID || null
    });

    return next();
};
