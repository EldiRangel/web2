'use strict';

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

function normalizeName(value, field) {
    if (typeof value !== 'string' || !NAME_PATTERN.test(value.trim())) {
        throw new Error(`Nombre invalido para ${field}.`);
    }
    return value.trim();
}


class MethodRegistry {
    constructor() {
        this.methods = new Map();
    }

    register({ subsystem, className, method, validate = null, execute }) {
        const subsystemName = normalizeName(subsystem, 'subsystem');
        const classValue = normalizeName(className, 'className');
        const methodValue = normalizeName(method, 'method');

        if (validate !== null && typeof validate !== 'function') {
            throw new Error('El validador de una operacion debe ser una funcion.');
        }

        if (typeof execute !== 'function') {
            throw new Error('La operacion registrada debe tener una funcion execute.');
        }

        const key = MethodRegistry.buildKey(subsystemName, classValue, methodValue);

        if (this.methods.has(key)) {
            throw new Error(`La operacion ya esta registrada: ${key}`);
        }

        const entry = Object.freeze({
            key,
            subsystem: subsystemName,
            className: classValue,
            method: methodValue,
            validate,
            execute
        });

        this.methods.set(key, entry);
        return this;
    }

    resolve(subsystem, className, method) {
        if (
            typeof subsystem !== 'string' ||
            typeof className !== 'string' ||
            typeof method !== 'string'
        ) {
            return null;
        }

        return this.methods.get(
            MethodRegistry.buildKey(subsystem.trim(), className.trim(), method.trim())
        ) || null;
    }

    has(subsystem, className, method) {
        return this.resolve(subsystem, className, method) !== null;
    }

    list() {
        return [...this.methods.values()];
    }

    static buildKey(subsystem, className, method) {
        return `${subsystem}.${className}.${method}`;
    }
}

module.exports = MethodRegistry;
