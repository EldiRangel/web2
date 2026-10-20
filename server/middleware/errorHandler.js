// Manejo centralizado de errores: va al final de la cadena de middlewares
module.exports = function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    // Error de JSON mal formado producido por express.json().
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'El cuerpo de la solicitud no es un JSON valido.'
        });
    }

    console.error('[Server (Dispatcher)] Error:', err);
    return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
    });
};
