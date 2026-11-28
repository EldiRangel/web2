'use strict';

const Security = require('./Security');
const SecurityRepository = require('../repositories/SecurityRepository');
const { createMethodRegistry } = require('../dispatcher/registerMethods');

const security = new Security({
    repository: new SecurityRepository(),
    methodRegistry: createMethodRegistry()
});

module.exports = security;
