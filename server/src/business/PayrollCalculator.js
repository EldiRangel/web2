'use strict';

const { ConflictError, ValidationError } = require('../errors/AppError');

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toAmount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function sum(values) {
    return values.reduce((total, value) => total + Number(value || 0), 0);
}

function buildLine({
    conceptId,
    conceptCode,
    conceptName,
    lineType,
    quantity = 1,
    rate = 0,
    amount,
    sourceType = null,
    sourceId = null
}) {
    if (!Number.isSafeInteger(conceptId) || conceptId <= 0) {
        throw new ValidationError('Cada linea de nomina debe tener un concepto valido.');
    }

    return {
        conceptId,
        conceptCode,
        conceptName,
        lineType,
        quantity,
        rate: round2(rate),
        amount: round2(amount),
        sourceType,
        sourceId
    };
}

/**
 * Calculo puro de prenomina. No accede a la base de datos; recibe las
 * entradas ya cargadas por PayrollRepository y devuelve las lineas que se
 * persistiran en payroll_results / payroll_lines.
 */
function calculateEmployee({
    employee,
    baseSalary,
    perceptions = [],
    bonuses = [],
    overtime = [],
    deductions = [],
    loanInstallments = []
}) {
    if (!employee || !Number.isSafeInteger(employee.id)) {
        throw new ValidationError('El empleado es obligatorio para calcular la prenomina.');
    }

    if (!baseSalary || baseSalary.amount === null || baseSalary.amount === undefined) {
        throw new ConflictError(
            `El empleado ${employee.employeeCode} no tiene un salario base vigente.`
        );
    }

    const lines = [];
    const baseAmount = toAmount(baseSalary.amount);

    lines.push(buildLine({
        conceptId: baseSalary.conceptId,
        conceptCode: baseSalary.conceptCode,
        conceptName: baseSalary.conceptName,
        lineType: 'PERCEPCION',
        quantity: 1,
        rate: baseAmount,
        amount: baseAmount,
        sourceType: 'COMPENSACION',
        sourceId: baseSalary.id || null
    }));

    for (const perception of perceptions) {
        lines.push(buildLine({
            conceptId: perception.conceptId,
            conceptCode: perception.conceptCode,
            conceptName: perception.conceptName,
            lineType: 'PERCEPCION',
            quantity: 1,
            rate: perception.amount,
            amount: perception.amount,
            sourceType: 'COMPENSACION',
            sourceId: perception.id
        }));
    }

    for (const bonus of bonuses) {
        lines.push(buildLine({
            conceptId: bonus.conceptId,
            conceptCode: bonus.conceptCode,
            conceptName: bonus.conceptName,
            lineType: 'PERCEPCION',
            quantity: 1,
            rate: bonus.amount,
            amount: bonus.amount,
            sourceType: 'BONO',
            sourceId: bonus.id
        }));
    }

    for (const record of overtime) {
        const rate = round2(toAmount(record.hourlyRate) * toAmount(record.rateMultiplier));
        lines.push(buildLine({
            conceptId: record.conceptId,
            conceptCode: record.conceptCode,
            conceptName: record.conceptName,
            lineType: 'PERCEPCION',
            quantity: record.hours,
            rate,
            amount: record.amount,
            sourceType: 'HORAS_EXTRA',
            sourceId: record.id
        }));
    }

    for (const deduction of deductions) {
        lines.push(buildLine({
            conceptId: deduction.conceptId,
            conceptCode: deduction.conceptCode,
            conceptName: deduction.conceptName,
            lineType: 'DEDUCCION',
            quantity: 1,
            rate: deduction.amount,
            amount: deduction.amount,
            sourceType: 'DEDUCCION',
            sourceId: deduction.id
        }));
    }

    for (const installment of loanInstallments) {
        lines.push(buildLine({
            conceptId: installment.conceptId,
            conceptCode: installment.conceptCode,
            conceptName: installment.conceptName,
            lineType: 'DEDUCCION',
            quantity: 1,
            rate: installment.amount,
            amount: installment.amount,
            sourceType: 'PRESTAMO',
            sourceId: installment.id
        }));
    }

    const totalEarnings = round2(sum(
        lines
            .filter(line => line.lineType === 'PERCEPCION')
            .map(line => line.amount)
    ));
    const totalDeductions = round2(sum(
        lines
            .filter(line => line.lineType === 'DEDUCCION')
            .map(line => line.amount)
    ));
    const netAmount = round2(totalEarnings - totalDeductions);

    if (netAmount < 0) {
        throw new ConflictError(
            `El empleado ${employee.employeeCode} tiene deducciones mayores a sus percepciones.`
        );
    }

    return {
        employee,
        baseSalary: round2(baseAmount),
        lines,
        totalEarnings,
        totalDeductions,
        netAmount
    };
}

function calculatePayroll(employees) {
    if (!Array.isArray(employees) || employees.length === 0) {
        throw new ConflictError('No hay empleados para calcular la prenomina.');
    }

    const results = employees.map(calculateEmployee);
    const allLines = results.flatMap(result => result.lines);

    const totalEarnings = round2(sum(results.map(result => result.totalEarnings)));
    const totalDeductions = round2(sum(results.map(result => result.totalDeductions)));
    const totalNet = round2(sum(results.map(result => result.netAmount)));
    const salarioBase = round2(sum(results.map(result => result.baseSalary)));
    const bonos = round2(sum(
        allLines
            .filter(line => line.conceptCode === 'BONO')
            .map(line => line.amount)
    ));
    const horasExtras = round2(sum(
        allLines
            .filter(line => line.conceptCode === 'HORAS_EXTRA')
            .map(line => line.amount)
    ));

    return {
        results,
        totals: {
            salarioBase,
            bonos,
            horasExtras,
            otrasPercepciones: round2(totalEarnings - salarioBase - bonos - horasExtras),
            percepciones: totalEarnings,
            bruto: totalEarnings,
            deducciones: totalDeductions,
            neto: totalNet
        }
    };
}

module.exports = {
    round2,
    calculateEmployee,
    calculatePayroll
};
