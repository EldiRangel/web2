'use strict';

const Security = require('./Security');
const SecurityRepository = require('../repositories/SecurityRepository');
const { createMethodRegistry } = require('../dispatcher/registerMethods');

/**
 * Instancia compartida por la aplicacion Express.
 * El registro de metodos es interno y no depende de datos del cliente.
 */
const security = new Security({
    repository: new SecurityRepository(),
    methodRegistry: createMethodRegistry()
});

module.exports = security;
