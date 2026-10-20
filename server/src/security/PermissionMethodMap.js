'use strict';

const { DuplicatePermissionError } = require('../errors/AppError');
const {
    normalizePermissionMethodKey,
    normalizePositiveInteger,
    parsePermissionMethodKey,
    validatePermissionValue
} = require('./permissionKeys');

/**
 * Mapa de permisos de metodos.
 * La clave tiene el formato subsystemId_classId_methodId_profileId.
 * Se extiende Map para conservar la semantica estandar y agregar validacion.
 */
class PermissionMethodMap extends Map {
    add(key, value) {
        const normalizedKey = normalizePermissionMethodKey(key);
        const normalizedValue = validatePermissionValue(value);

        if (super.has(normalizedKey)) {
            throw new DuplicatePermissionError(
                `La clave de permiso de metodo ya existe: ${normalizedKey}`
            );
        }

        super.set(normalizedKey, normalizedValue);
        return this;
    }

    set(key, value) {
        const normalizedKey = normalizePermissionMethodKey(key);
        const normalizedValue = validatePermissionValue(value);
        super.set(normalizedKey, normalizedValue);
        return this;
    }

    /**
     * Elimina las entradas de un perfil antes de recargar sus permisos.
     * Evita que una revocacion quede oculta por valores de una carga anterior.
     */
    removeProfile(profileId) {
        const normalizedProfileId = normalizePositiveInteger(profileId, 'profileId');

        for (const key of this.keys()) {
            const parsed = parsePermissionMethodKey(key);
            if (parsed.profileId === normalizedProfileId) {
                super.delete(key);
            }
        }

        return this;
    }
}

module.exports = PermissionMethodMap;
