'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createMethodRegistry } = require('../server/src/dispatcher/registerMethods');

const EXPECTED_METHODS = [
    'Nomina.Empleados.listar',
    'Nomina.Empleados.consultar',
    'Nomina.Salarios.consultar',
    'Nomina.Bonos.listar',
    'Nomina.Bonos.crear',
    'Nomina.Bonos.aprobar',
    'Nomina.HorasExtras.listar',
    'Nomina.HorasExtras.registrar',
    'Nomina.HorasExtras.aprobar',
    'Nomina.Prestamos.listar',
    'Nomina.Tiempo.registrar',
    'Nomina.Tiempo.aprobar',
    'Nomina.Prenomina.calcular',
    'Nomina.Prenomina.consultar',
    'Nomina.NominaDefinitiva.consultar',
    'Nomina.NominaDefinitiva.cerrar'
];

test('registra las diez operaciones reales de nomina', () => {
    const registry = createMethodRegistry({ repository: {} });
    const keys = registry.list().map(entry => entry.key);

    assert.deepEqual(keys, EXPECTED_METHODS);
});

test('Empleados.listar delega en el repositorio y no usa el modo pendiente', async () => {
    let received = null;
    const repository = {
        async getEmployees(options) {
            received = options;
            return [{
                id: 1,
                employeeCode: 'DEMO-001',
                position: 'Analista',
                department: 'Nominas',
                hireDate: '2026-01-01',
                status: 'ACTIVO',
                name: 'Empleado Demo Uno',
                email: 'demo@example.com'
            }];
        }
    };

    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'Empleados', 'listar');
    const params = method.validate({ estado: 'ACTIVO', limite: 10 });
    const result = await method.execute(params);

    assert.deepEqual(received, { status: 'ACTIVO', limit: 10 });
    assert.equal(result.length, 1);
    assert.equal(result[0].codigo, 'DEMO-001');
    assert.equal(result[0].pendiente, undefined);
});

test('la validacion real de prenomina rechaza periodos mal formados', () => {
    const registry = createMethodRegistry({ repository: {} });
    const method = registry.resolve('Nomina', 'Prenomina', 'calcular');

    assert.deepEqual(
        method.validate({ periodo: '2026-11' }),
        { periodo: '2026-11', empleadoIds: null }
    );
    assert.throws(
        () => method.validate({ periodo: '11-2026' }),
        /YYYY-MM/
    );
});

test('cerrar exige confirmacion explicita', () => {
    const registry = createMethodRegistry({ repository: {} });
    const method = registry.resolve('Nomina', 'NominaDefinitiva', 'cerrar');

    assert.throws(
        () => method.validate({ periodo: '2026-11' }),
        /confirmar/
    );
    assert.deepEqual(
        method.validate({ periodo: '2026-11', confirmar: true }),
        { periodo: '2026-11', confirmar: true }
    );
});

test('Bonos.crear valida y delega en el repositorio', async () => {
    let received = null;
    const repository = {
        async getEmployeeById() {
            return { id: 1, employeeCode: 'DEMO-001' };
        },
        async getPeriodByCode() {
            return { id: 10, code: '2026-11', status: 'ABIERTO' };
        },
        async createBonus(input) {
            received = input;
            return {
                id: 100,
                employee_id: input.employeeId,
                concept_id: input.conceptId,
                period_id: input.periodId,
                amount: input.amount,
                reason: input.reason,
                status: 'PENDIENTE',
                created_at: '2026-11-23T00:00:00Z'
            };
        }
    };

    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'Bonos', 'crear');
    const params = method.validate({
        empleadoId: 1,
        periodo: '2026-11',
        conceptoId: 2,
        monto: 1500,
        motivo: 'Bono prueba',
        creadoPor: 1
    });
    const result = await method.execute(params, { userId: 1 });

    assert.deepEqual(received, {
        employeeId: 1,
        periodId: 10,
        conceptId: 2,
        amount: 1500,
        reason: 'Bono prueba',
        createdBy: 1
    });
    assert.equal(result.id, 100);
    assert.equal(result.monto, 1500);
    assert.equal(result.estado, 'PENDIENTE');
});

test('Bonos.crear rechaza periodo cerrado', async () => {
    const repository = {
        async getEmployeeById() {
            return { id: 1, employeeCode: 'DEMO-001' };
        },
        async getPeriodByCode() {
            return { id: 10, code: '2026-09', status: 'CERRADO' };
        }
    };
    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'Bonos', 'crear');

    const params = method.validate({
        empleadoId: 1,
        periodo: '2026-09',
        conceptoId: 2,
        monto: 1500
    });

    await assert.rejects(
        () => method.execute(params, { userId: 1 }),
        /cerrado/
    );
});

test('HorasExtras.registrar valida y delega en el repositorio', async () => {
    let received = null;
    const repository = {
        async getEmployeeById() {
            return { id: 1, employeeCode: 'DEMO-001' };
        },
        async getPeriodByCode() {
            return { id: 10, code: '2026-11', status: 'ABIERTO' };
        },
        async createOvertime(input) {
            received = input;
            return { id: 200 };
        }
    };

    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'HorasExtras', 'registrar');
    const params = method.validate({
        empleadoId: 1,
        periodo: '2026-11',
        fecha: '2026-11-10',
        horas: 6,
        tarifaHora: 120,
        factor: 1.5,
        conceptoId: 3,
        creadoPor: 1
    });
    const result = await method.execute(params, { userId: 1 });

    assert.deepEqual(received, {
        employeeId: 1,
        periodId: 10,
        conceptId: 3,
        workDate: '2026-11-10',
        hours: 6,
        rateMultiplier: 1.5,
        hourlyRate: 120,
        amount: 1080,
        createdBy: 1
    });
    assert.equal(result.importe, 1080);
    assert.equal(result.estado, 'PENDIENTE');
});

test('Tiempo.registrar valida y delega en el repositorio', async () => {
    let received = null;
    const repository = {
        async getEmployeeById() {
            return { id: 1, employeeCode: 'DEMO-001' };
        },
        async createTimeEntry(input) {
            received = input;
            return {
                id: 300,
                employee_id: input.employeeId,
                work_date: input.workDate,
                hours: input.hours,
                hourly_rate: input.hourlyRate,
                notes: input.notes,
                status: 'PENDIENTE'
            };
        }
    };

    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'Tiempo', 'registrar');
    const params = method.validate({
        empleadoId: 1,
        fecha: '2026-11-10',
        horas: 8,
        tarifaHora: 100,
        notas: 'Turno nocturno',
        creadoPor: 1
    });
    const result = await method.execute(params, { userId: 1 });

    assert.deepEqual(received, {
        employeeId: 1,
        workDate: '2026-11-10',
        hours: 8,
        hourlyRate: 100,
        notes: 'Turno nocturno',
        createdBy: 1
    });
    assert.equal(result.horas, 8);
    assert.equal(result.estado, 'PENDIENTE');
});

test('Bonos.aprobar valida y delega en el repositorio', async () => {
    const repository = {
        async approveBonus(id, approvedBy) {
            assert.equal(id, 100);
            assert.equal(approvedBy, 1);
            return { id: 100, status: 'APROBADO' };
        }
    };

    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'Bonos', 'aprobar');
    const params = method.validate({ bonoId: 100, aprobadoPor: 1 });
    const result = await method.execute(params, { userId: 1 });

    assert.equal(result.id, 100);
    assert.equal(result.estado, 'APROBADO');
});

test('Bonos.aprobar rechaza ID invalido', () => {
    const registry = createMethodRegistry({ repository: {} });
    const method = registry.resolve('Nomina', 'Bonos', 'aprobar');

    assert.throws(
        () => method.validate({ bonoId: 0, aprobadoPor: 1 }),
        /entero positivo/
    );
});

test('HorasExtras.aprobar valida y delega en el repositorio', async () => {
    const repository = {
        async approveOvertime(id, approvedBy) {
            assert.equal(id, 200);
            assert.equal(approvedBy, 1);
            return { id: 200, status: 'APROBADO' };
        }
    };

    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'HorasExtras', 'aprobar');
    const params = method.validate({ horasExtraId: 200, aprobadoPor: 1 });
    const result = await method.execute(params, { userId: 1 });

    assert.equal(result.id, 200);
    assert.equal(result.estado, 'APROBADO');
});

test('Tiempo.aprobar valida y delega en el repositorio', async () => {
    const repository = {
        async approveTimeEntry(id, approvedBy) {
            assert.equal(id, 300);
            assert.equal(approvedBy, 1);
            return { id: 300, status: 'APROBADO' };
        }
    };

    const registry = createMethodRegistry({ repository });
    const method = registry.resolve('Nomina', 'Tiempo', 'aprobar');
    const params = method.validate({ tiempoId: 300, aprobadoPor: 1 });
    const result = await method.execute(params, { userId: 1 });

    assert.equal(result.id, 300);
    assert.equal(result.estado, 'APROBADO');
});
