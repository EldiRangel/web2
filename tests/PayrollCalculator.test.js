'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateEmployee,
    calculatePayroll
} = require('../server/src/business/PayrollCalculator');

const BASE_CONCEPT = {
    conceptId: 1,
    conceptCode: 'SALARIO_BASE',
    conceptName: 'Sueldo base'
};

const BONUS_CONCEPT = {
    conceptId: 2,
    conceptCode: 'BONO',
    conceptName: 'Bono'
};

const OVERTIME_CONCEPT = {
    conceptId: 3,
    conceptCode: 'HORAS_EXTRA',
    conceptName: 'Horas extra'
};

const LOAN_CONCEPT = {
    conceptId: 4,
    conceptCode: 'PRESTAMO',
    conceptName: 'Deduccion por prestamo'
};

const DEDUCTION_CONCEPT = {
    conceptId: 5,
    conceptCode: 'DEDUCCION_RECURRENTE',
    conceptName: 'Deduccion recurrente'
};

function employee(id, code) {
    return {
        id,
        employeeCode: code,
        name: `Empleado ${code}`,
        status: 'ACTIVO'
    };
}

function baseSalary(amount) {
    return { ...BASE_CONCEPT, amount };
}

test('calcula percepciones, deducciones y neto de un empleado', () => {
    const result = calculateEmployee({
        employee: employee(1, 'DEMO-001'),
        baseSalary: baseSalary(18000),
        bonuses: [{ id: 11, ...BONUS_CONCEPT, amount: 1500 }],
        overtime: [{
            id: 21,
            ...OVERTIME_CONCEPT,
            amount: 1080,
            hours: 6,
            hourlyRate: 120,
            rateMultiplier: 1.5
        }],
        deductions: [{ id: 31, ...DEDUCTION_CONCEPT, amount: 350 }],
        loanInstallments: [{ id: 41, ...LOAN_CONCEPT, amount: 600 }]
    });

    assert.equal(result.lines.length, 5);
    assert.equal(result.baseSalary, 18000);
    assert.equal(result.totalEarnings, 20580);
    assert.equal(result.totalDeductions, 950);
    assert.equal(result.netAmount, 19630);
    assert.deepEqual(
        result.lines.map(line => line.lineType),
        ['PERCEPCION', 'PERCEPCION', 'PERCEPCION', 'DEDUCCION', 'DEDUCCION']
    );
    assert.equal(result.lines[1].sourceType, 'BONO');
    assert.equal(result.lines[2].sourceType, 'HORAS_EXTRA');
    assert.equal(result.lines[3].sourceType, 'DEDUCCION');
    assert.equal(result.lines[4].sourceType, 'PRESTAMO');
});

test('suma los totales de varios empleados', () => {
    const result = calculatePayroll([
        {
            employee: employee(1, 'DEMO-001'),
            baseSalary: baseSalary(18000),
            bonuses: [{ id: 11, ...BONUS_CONCEPT, amount: 1500 }]
        },
        {
            employee: employee(2, 'DEMO-002'),
            baseSalary: baseSalary(22000),
            deductions: [{ id: 31, ...DEDUCTION_CONCEPT, amount: 350 }],
            loanInstallments: [{ id: 41, ...LOAN_CONCEPT, amount: 600 }]
        }
    ]);

    assert.equal(result.results.length, 2);
    assert.equal(result.totals.salarioBase, 40000);
    assert.equal(result.totals.bonos, 1500);
    assert.equal(result.totals.horasExtras, 0);
    assert.equal(result.totals.percepciones, 41500);
    assert.equal(result.totals.deducciones, 950);
    assert.equal(result.totals.neto, 40550);
});

test('redondea los importes a dos decimales', () => {
    const result = calculateEmployee({
        employee: employee(1, 'DEMO-001'),
        baseSalary: baseSalary(1000.555)
    });

    assert.equal(result.baseSalary, 1000.56);
    assert.equal(result.lines[0].amount, 1000.56);
    assert.equal(result.totalEarnings, 1000.56);
    assert.equal(result.netAmount, 1000.56);
});

test('rechaza una prenomina con deducciones mayores a las percepciones', () => {
    assert.throws(
        () => calculateEmployee({
            employee: employee(2, 'DEMO-002'),
            baseSalary: baseSalary(500),
            loanInstallments: [{ id: 41, ...LOAN_CONCEPT, amount: 600 }]
        }),
        error => error.status === 409 && /deducciones mayores/.test(error.message)
    );
});

test('rechaza un empleado sin salario base vigente', () => {
    assert.throws(
        () => calculateEmployee({
            employee: employee(1, 'DEMO-001'),
            baseSalary: null
        }),
        error => error.status === 409 && /salario base vigente/.test(error.message)
    );
});

test('rechaza lineas sin un concepto valido', () => {
    assert.throws(
        () => calculateEmployee({
            employee: employee(1, 'DEMO-001'),
            baseSalary: { ...BASE_CONCEPT, conceptId: null, amount: 1000 }
        }),
        error => error.status === 400 && error.code === 'VALIDATION_ERROR'
    );
});

test('rechaza una prenomina sin empleados', () => {
    assert.throws(
        () => calculatePayroll([]),
        error => error.status === 409
    );
});
