'use strict';

const { ValidationError } = require('../errors/AppError');

const ID_PATTERN = /^[1-9]\d*$/;
const PERMISSION_METHOD_KEY_PATTERN = /^[1-9]\d*(?:_[1-9]\d*){3}$/;
const PERMISSION_OPTION_KEY_PATTERN = /^[1-9]\d*(?:_[1-9]\d*){2}$/;

/**
 * Normaliza un identificador a entero positivo.
 * Acepta numeros y cadenas numericas, pero nunca booleanos, decimales,
 * negativos, cero ni valores fuera del rango seguro de JavaScript.
 */
function normalizePositiveInteger(value, field = 'id') {
    if (typeof value === 'string' && ID_PATTERN.test(value.trim())) {
        value = Number(value.trim());
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new ValidationError(`El identificador "${field}" debe ser un entero positivo.`);
    }

    return value;
}

function buildPermissionMethodKey(subsystemId, classId, methodId, profileId) {
    return [
        normalizePositiveInteger(subsystemId, 'subsystemId'),
        normalizePositiveInteger(classId, 'classId'),
        normalizePositiveInteger(methodId, 'methodId'),
        normalizePositiveInteger(profileId, 'profileId')
    ].join('_');
}

function buildPermissionOptionKey(subsystemId, optionId, profileId) {
    return [
        normalizePositiveInteger(subsystemId, 'subsystemId'),
        normalizePositiveInteger(optionId, 'optionId'),
        normalizePositiveInteger(profileId, 'profileId')
    ].join('_');
}

function isValidPermissionMethodKey(key) {
    return typeof key === 'string' && PERMISSION_METHOD_KEY_PATTERN.test(key);
}

function isValidPermissionOptionKey(key) {
    return typeof key === 'string' && PERMISSION_OPTION_KEY_PATTERN.test(key);
}

function normalizePermissionMethodKey(key) {
    if (!isValidPermissionMethodKey(key)) {
        throw new ValidationError('La clave del permiso de metodo no es valida.');
    }
    return key;
}

function normalizePermissionOptionKey(key) {
    if (!isValidPermissionOptionKey(key)) {
        throw new ValidationError('La clave del permiso de opcion no es valida.');
    }
    return key;
}

function parsePermissionMethodKey(key) {
    const normalized = normalizePermissionMethodKey(key);
    const [subsystemId, classId, methodId, profileId] = normalized.split('_').map(Number);
    return { subsystemId, classId, methodId, profileId };
}

function parsePermissionOptionKey(key) {
    const normalized = normalizePermissionOptionKey(key);
    const [subsystemId, optionId, profileId] = normalized.split('_').map(Number);
    return { subsystemId, optionId, profileId };
}

function validatePermissionValue(value) {
    if (typeof value !== 'boolean') {
        throw new ValidationError('El valor del permiso debe ser booleano.');
    }
    return value;
}

module.exports = {
    normalizePositiveInteger,
    buildPermissionMethodKey,
    buildPermissionOptionKey,
    isValidPermissionMethodKey,
    isValidPermissionOptionKey,
    normalizePermissionMethodKey,
    normalizePermissionOptionKey,
    parsePermissionMethodKey,
    parsePermissionOptionKey,
    validatePermissionValue
};
