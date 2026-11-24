'use strict';

const fs = require('fs');
const path = require('path');
const MethodRegistry = require('./MethodRegistry');
const { ValidationError } = require('../errors/AppError');

const SUBSYSTEM = 'Nomina';
const BUSINESS_DIR = path.join(__dirname, '..', 'business');

const BUSINESS_FILES = [
    'Empleados.js',
    'Salarios.js',
    'Bonos.js',
    'HorasExtras.js',
    'Prestamos.js',
    'Prenomina.js',
    'NominaDefinitiva.js',
    'PayrollCalculator.js',
    'validation.js'
];

function hasBusinessLayer() {
    return BUSINESS_FILES.every(file => fs.existsSync(path.join(BUSINESS_DIR, file)));
}

function ensureParams(params) {
    if (params === undefined || params === null) {
        return {};
    }

    if (typeof params !== 'object' || Array.isArray(params)) {
        throw new ValidationError('Los parametros de la operacion no son validos.');
    }

    return params;
}

function optionalEnum(data, field, allowed, defaultValue) {
    const value = data[field];

    if (value === undefined) {
        return defaultValue;
    }

    if (!allowed.includes(value)) {
        throw new ValidationError(
            `El campo ${field} debe ser uno de: ${allowed.join(', ')}.`
        );
    }

    return value;
}

function requirePositiveIntegerParam(data, field) {
    const value = data[field];

    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new ValidationError(`El campo ${field} es obligatorio y debe ser un entero positivo.`);
    }

    return value;
}

function optionalPositiveIntegerParam(data, field) {
    const value = data[field];

    if (value === undefined) {
        return undefined;
    }

    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new ValidationError(`El campo ${field} debe ser un entero positivo.`);
    }

    return value;
}

function requirePeriodParam(data, field) {
    const value = data[field];

    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
        throw new ValidationError(`El campo ${field} debe tener formato YYYY-MM.`);
    }

    return value;
}

function optionalPeriodParam(data, field) {
    if (data[field] === undefined) {
        return undefined;
    }

    return requirePeriodParam(data, field);
}

function employeeIdsParam(data, field) {
    const value = data[field];

    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value) || value.length === 0) {
        throw new ValidationError(`El campo ${field} debe ser un arreglo de enteros positivos.`);
    }

    for (const id of value) {
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new ValidationError(`El campo ${field} debe contener solo enteros positivos.`);
        }
    }

    return [...new Set(value)];
}

function requireTrueParam(data, field) {
    if (data[field] !== true) {
        throw new ValidationError(`El campo ${field} debe ser true.`);
    }

    return true;
}

function placeholder(operation) {
    return () => ({
        pendiente: true,
        operacion: operation,
        mensaje: 'La capa business no esta implementada todavia.'
    });
}

/**
 * Modo sin capa business.
 *
 * Mantiene registradas las mismas operaciones del catalogo de seguridad para
 * poder probar autenticacion, permisos, validacion y respuestas del Dispatcher
 * sin depender de la logica de nomina. Cuando los archivos de business existan,
 * createMethodRegistry usara automaticamente la implementacion real.
 */
function registerPlaceholderMethods(registry) {
    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Empleados',
        method: 'listar',
        validate: params => {
            const data = ensureParams(params);
            const limite = optionalPositiveIntegerParam(data, 'limite');
            return {
                estado: optionalEnum(data, 'estado', ['ACTIVO', 'INACTIVO', 'TODOS'], 'ACTIVO'),
                limite: limite || 100
            };
        },
        execute: placeholder('Empleados.listar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Empleados',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { empleadoId: requirePositiveIntegerParam(data, 'empleadoId') };
        },
        execute: placeholder('Empleados.consultar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Salarios',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { empleadoId: requirePositiveIntegerParam(data, 'empleadoId') };
        },
        execute: placeholder('Salarios.consultar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Bonos',
        method: 'listar',
        validate: params => {
            const data = ensureParams(params);
            return {
                empleadoId: optionalPositiveIntegerParam(data, 'empleadoId'),
                periodo: optionalPeriodParam(data, 'periodo')
            };
        },
        execute: placeholder('Bonos.listar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'HorasExtras',
        method: 'listar',
        validate: params => {
            const data = ensureParams(params);
            return {
                empleadoId: optionalPositiveIntegerParam(data, 'empleadoId'),
                periodo: optionalPeriodParam(data, 'periodo')
            };
        },
        execute: placeholder('HorasExtras.listar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prestamos',
        method: 'listar',
        validate: params => {
            const data = ensureParams(params);
            return { empleadoId: optionalPositiveIntegerParam(data, 'empleadoId') };
        },
        execute: placeholder('Prestamos.listar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prenomina',
        method: 'calcular',
        validate: params => {
            const data = ensureParams(params);
            return {
                periodo: requirePeriodParam(data, 'periodo'),
                empleadoIds: employeeIdsParam(data, 'empleadoIds')
            };
        },
        execute: placeholder('Prenomina.calcular')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prenomina',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { periodo: requirePeriodParam(data, 'periodo') };
        },
        execute: placeholder('Prenomina.consultar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'NominaDefinitiva',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { periodo: requirePeriodParam(data, 'periodo') };
        },
        execute: placeholder('NominaDefinitiva.consultar')
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'NominaDefinitiva',
        method: 'cerrar',
        validate: params => {
            const data = ensureParams(params);
            return {
                periodo: requirePeriodParam(data, 'periodo'),
                confirmar: requireTrueParam(data, 'confirmar')
            };
        },
        execute: placeholder('NominaDefinitiva.cerrar')
    });
}

function registerBusinessMethods(registry, repository) {
    const PayrollRepository = require('../repositories/PayrollRepository');
    const Empleados = require('../business/Empleados');
    const Salarios = require('../business/Salarios');
    const Bonos = require('../business/Bonos');
    const HorasExtras = require('../business/HorasExtras');
    const Tiempo = require('../business/Tiempo');
    const Prestamos = require('../business/Prestamos');
    const Prenomina = require('../business/Prenomina');
    const NominaDefinitiva = require('../business/NominaDefinitiva');
    const {
        ensureParams: ensureBusinessParams,
        optionalEnum: optionalBusinessEnum,
        requirePositiveIntegerParam: requireBusinessPositiveInteger,
        optionalPositiveIntegerParam: optionalBusinessPositiveInteger,
        requirePeriodParam: requireBusinessPeriod,
        optionalPeriodParam: optionalBusinessPeriod,
        employeeIdsParam: businessEmployeeIds,
        requireTrueParam: requireBusinessTrue
    } = require('../business/validation');

    const db = repository || new PayrollRepository();
    const empleados = new Empleados(db);
    const salarios = new Salarios(db);
    const bonos = new Bonos(db);
    const horasExtras = new HorasExtras(db);
    const tiempo = new Tiempo(db);
    const prestamos = new Prestamos(db);
    const prenomina = new Prenomina(db);
    const nominaDefinitiva = new NominaDefinitiva(db);

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Empleados',
        method: 'listar',
        validate: params => {
            const data = ensureBusinessParams(params);
            const limite = optionalBusinessPositiveInteger(data, 'limite');
            return {
                estado: optionalBusinessEnum(data, 'estado', ['ACTIVO', 'INACTIVO', 'TODOS'], 'ACTIVO'),
                limite: limite || 100
            };
        },
        execute: params => empleados.listar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Empleados',
        method: 'consultar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return { empleadoId: requireBusinessPositiveInteger(data, 'empleadoId') };
        },
        execute: params => empleados.consultar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Salarios',
        method: 'consultar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return { empleadoId: requireBusinessPositiveInteger(data, 'empleadoId') };
        },
        execute: params => salarios.consultar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Bonos',
        method: 'listar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return {
                empleadoId: optionalBusinessPositiveInteger(data, 'empleadoId'),
                periodo: optionalBusinessPeriod(data, 'periodo')
            };
        },
        execute: params => bonos.listar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Bonos',
        method: 'crear',
        validate: params => {
            const data = ensureBusinessParams(params);
            return {
                empleadoId: requireBusinessPositiveInteger(data, 'empleadoId'),
                periodo: requireBusinessPeriod(data, 'periodo'),
                conceptoId: requireBusinessPositiveInteger(data, 'conceptoId'),
                monto: data.monto,
                motivo: data.motivo,
                creadoPor: data.creadoPor
            };
        },
        execute: (params, context) => bonos.crear({
            empleadoId: params.empleadoId,
            periodo: params.periodo,
            conceptoId: params.conceptoId,
            monto: params.monto,
            motivo: params.motivo,
            creadoPor: context && context.userId ? context.userId : params.creadoPor
        })
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'HorasExtras',
        method: 'listar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return {
                empleadoId: optionalBusinessPositiveInteger(data, 'empleadoId'),
                periodo: optionalBusinessPeriod(data, 'periodo')
            };
        },
        execute: params => horasExtras.listar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'HorasExtras',
        method: 'registrar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return {
                empleadoId: requireBusinessPositiveInteger(data, 'empleadoId'),
                periodo: requireBusinessPeriod(data, 'periodo'),
                fecha: data.fecha,
                horas: data.horas,
                tarifaHora: data.tarifaHora,
                factor: data.factor,
                conceptoId: requireBusinessPositiveInteger(data, 'conceptoId'),
                creadoPor: data.creadoPor
            };
        },
        execute: (params, context) => horasExtras.registrar({
            empleadoId: params.empleadoId,
            periodo: params.periodo,
            fecha: params.fecha,
            horas: params.horas,
            tarifaHora: params.tarifaHora,
            factor: params.factor,
            conceptoId: params.conceptoId,
            creadoPor: context && context.userId ? context.userId : params.creadoPor
        })
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prestamos',
        method: 'listar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return { empleadoId: optionalBusinessPositiveInteger(data, 'empleadoId') };
        },
        execute: params => prestamos.listar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Tiempo',
        method: 'registrar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return {
                empleadoId: requireBusinessPositiveInteger(data, 'empleadoId'),
                fecha: data.fecha,
                horas: data.horas,
                tarifaHora: data.tarifaHora,
                notas: data.notas,
                creadoPor: data.creadoPor
            };
        },
        execute: (params, context) => tiempo.registrar({
            empleadoId: params.empleadoId,
            fecha: params.fecha,
            horas: params.horas,
            tarifaHora: params.tarifaHora,
            notas: params.notas,
            creadoPor: context && context.userId ? context.userId : params.creadoPor
        })
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prenomina',
        method: 'calcular',
        validate: params => {
            const data = ensureBusinessParams(params);
            return {
                periodo: requireBusinessPeriod(data, 'periodo'),
                empleadoIds: businessEmployeeIds(data, 'empleadoIds')
            };
        },
        execute: (params, context) => prenomina.calcular(params, context)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prenomina',
        method: 'consultar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return { periodo: requireBusinessPeriod(data, 'periodo') };
        },
        execute: params => prenomina.consultar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'NominaDefinitiva',
        method: 'consultar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return { periodo: requireBusinessPeriod(data, 'periodo') };
        },
        execute: params => nominaDefinitiva.consultar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'NominaDefinitiva',
        method: 'cerrar',
        validate: params => {
            const data = ensureBusinessParams(params);
            return {
                periodo: requireBusinessPeriod(data, 'periodo'),
                confirmar: requireBusinessTrue(data, 'confirmar')
            };
        },
        execute: (params, context) => nominaDefinitiva.cerrar(params, context)
    });
}

/**
 * Une las filas de seguridad (subsystem/class/method) con funciones reales.
 * Ninguna funcion se obtiene dinamicamente del cliente ni de la base.
 *
 * Si la carpeta business no existe, registra stubs de las mismas operaciones
 * para que el servidor y el flujo de seguridad sigan funcionando.
 */
function createMethodRegistry({ repository } = {}) {
    const registry = new MethodRegistry();

    if (hasBusinessLayer()) {
        registerBusinessMethods(registry, repository);
        return registry;
    }

    console.warn(
        '[Dispatcher] Capa business no encontrada. ' +
        'Las operaciones quedan registradas en modo PENDIENTE.'
    );
    registerPlaceholderMethods(registry);

    return registry;
}

module.exports = {
    SUBSYSTEM,
    createMethodRegistry
};
