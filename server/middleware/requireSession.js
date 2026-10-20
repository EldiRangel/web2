'use strict';

// Se reutiliza el middleware de seguridad para validar la sesion y construir
// el contexto del servidor tambien en la ruta privada existente.
module.exports = require('../src/middleware/authMiddleware');
