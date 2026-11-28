'use strict';

const { DuplicatePermissionError } = require('../errors/AppError');
const {
    normalizePermissionOptionKey,
    normalizePositiveInteger,
    parsePermissionOptionKey,
    validatePermissionValue
} = require('./permissionKeys');

class PermissionOptionMap extends Map {
    add(key, value) {
        const normalizedKey = normalizePermissionOptionKey(key);
        const normalizedValue = validatePermissionValue(value);

        if (super.has(normalizedKey)) {
            throw new DuplicatePermissionError(
                `La clave de permiso de opcion ya existe: ${normalizedKey}`
            );
        }

        super.set(normalizedKey, normalizedValue);
        return this;
    }

    set(key, value) {
        const normalizedKey = normalizePermissionOptionKey(key);
        const normalizedValue = validatePermissionValue(value);
        super.set(normalizedKey, normalizedValue);
        return this;
    }

    removeProfile(profileId) {
        const normalizedProfileId = normalizePositiveInteger(profileId, 'profileId');

        for (const key of this.keys()) {
            const parsed = parsePermissionOptionKey(key);
            if (parsed.profileId === normalizedProfileId) {
                super.delete(key);
            }
        }

        return this;
    }
}

module.exports = PermissionOptionMap;
