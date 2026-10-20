'use strict';

const MethodRegistry = require('./MethodRegistry');
const PayrollRepository = require('../repositories/PayrollRepository');
const Empleados = require('../business/Empleados');
const Salarios = require('../business/Salarios');
const Bonos = require('../business/Bonos');
const HorasExtras = require('../business/HorasExtras');
const Prestamos = require('../business/Prestamos');
const Prenomina = require('../business/Prenomina');
const NominaDefinitiva = require('../business/NominaDefinitiva');
const {
    ensureParams,
    optionalEnum,
    requirePositiveIntegerParam,
    optionalPositiveIntegerParam,
    requirePeriodParam,
    optionalPeriodParam,
    employeeIdsParam,
    requireTrueParam
} = require('../business/validation');

const SUBSYSTEM = 'Nomina';

/**
 * Une las filas de seguridad (subsystem/class/method) con funciones reales.
 * Ninguna funcion se obtiene dinamicamente del cliente ni de la base.
 */
function createMethodRegistry({ repository = new PayrollRepository() } = {}) {
    const registry = new MethodRegistry();

    const empleados = new Empleados(repository);
    const salarios = new Salarios(repository);
    const bonos = new Bonos(repository);
    const horasExtras = new HorasExtras(repository);
    const prestamos = new Prestamos(repository);
    const prenomina = new Prenomina(repository);
    const nominaDefinitiva = new NominaDefinitiva(repository);

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
        execute: params => empleados.listar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Empleados',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { empleadoId: requirePositiveIntegerParam(data, 'empleadoId') };
        },
        execute: params => empleados.consultar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Salarios',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { empleadoId: requirePositiveIntegerParam(data, 'empleadoId') };
        },
        execute: params => salarios.consultar(params)
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
        execute: params => bonos.listar(params)
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
        execute: params => horasExtras.listar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prestamos',
        method: 'listar',
        validate: params => {
            const data = ensureParams(params);
            return { empleadoId: optionalPositiveIntegerParam(data, 'empleadoId') };
        },
        execute: params => prestamos.listar(params)
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
        execute: (params, context) => prenomina.calcular(params, context)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'Prenomina',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { periodo: requirePeriodParam(data, 'periodo') };
        },
        execute: params => prenomina.consultar(params)
    });

    registry.register({
        subsystem: SUBSYSTEM,
        className: 'NominaDefinitiva',
        method: 'consultar',
        validate: params => {
            const data = ensureParams(params);
            return { periodo: requirePeriodParam(data, 'periodo') };
        },
        execute: params => nominaDefinitiva.consultar(params)
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
        execute: (params, context) => nominaDefinitiva.cerrar(params, context)
    });

    return registry;
}

module.exports = {
    SUBSYSTEM,
    createMethodRegistry
};
