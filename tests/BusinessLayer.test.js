'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createMethodRegistry } = require('../server/src/dispatcher/registerMethods');

const EXPECTED_METHODS = [
    'Nomina.Empleados.listar',
    'Nomina.Empleados.consultar',
    'Nomina.Salarios.consultar',
    'Nomina.Bonos.listar',
    'Nomina.HorasExtras.listar',
    'Nomina.Prestamos.listar',
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
