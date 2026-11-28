'use strict';

const { DuplicatePermissionError } = require('../errors/AppError');
const {
    normalizePermissionMethodKey,
    normalizePositiveInteger,
    parsePermissionMethodKey,
    validatePermissionValue
} = require('./permissionKeys');


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
