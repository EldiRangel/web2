'use strict';

const { ValidationError } = require('../errors/AppError');
const { normalizePositiveInteger } = require('../security/permissionKeys');

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function ensureParams(params) {
    if (params === undefined || params === null) {
        return {};
    }
    if (!isPlainObject(params)) {
        throw new ValidationError('Los parametros deben ser un objeto JSON.');
    }
    return params;
}

function optionalEnum(params, field, allowed, defaultValue) {
    const value = params[field];

    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }

    if (typeof value !== 'string') {
        throw new ValidationError(`El campo "${field}" debe ser texto.`);
    }

    const normalized = value.trim().toUpperCase();
    if (!allowed.includes(normalized)) {
        throw new ValidationError(
            `El campo "${field}" debe ser uno de: ${allowed.join(', ')}.`
        );
    }

    return normalized;
}

function requirePositiveIntegerParam(params, field) {
    return normalizePositiveInteger(params[field], field);
}

function optionalPositiveIntegerParam(params, field) {
    const value = params[field];

    if (value === undefined || value === null || value === '') {
        return null;
    }

    return normalizePositiveInteger(value, field);
}

function validatePeriod(value, field = 'periodo') {
    if (typeof value !== 'string' || !PERIOD_PATTERN.test(value.trim())) {
        throw new ValidationError(`El campo "${field}" debe tener el formato YYYY-MM.`);
    }
    return value.trim();
}

function requirePeriodParam(params, field = 'periodo') {
    return validatePeriod(params[field], field);
}

function optionalPeriodParam(params, field = 'periodo') {
    const value = params[field];

    if (value === undefined || value === null || value === '') {
        return null;
    }

    return validatePeriod(value, field);
}

function employeeIdsParam(params, field = 'empleadoIds') {
    const value = params[field];

    if (value === undefined || value === null) {
        return null;
    }

    if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
        throw new ValidationError(
            `El campo "${field}" debe ser un arreglo con entre 1 y 100 identificadores.`
        );
    }

    const unique = new Set();
    for (const item of value) {
        unique.add(normalizePositiveInteger(item, field));
    }

    return [...unique];
}

function requireTrueParam(params, field) {
    if (params[field] !== true) {
        throw new ValidationError(`El campo "${field}" debe ser true para confirmar la operacion.`);
    }
    return true;
}

module.exports = {
    ensureParams,
    optionalEnum,
    requirePositiveIntegerParam,
    optionalPositiveIntegerParam,
    requirePeriodParam,
    optionalPeriodParam,
    employeeIdsParam,
    requireTrueParam
};
