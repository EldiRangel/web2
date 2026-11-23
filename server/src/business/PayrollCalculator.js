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

const PAYMENT_TYPES = new Set(['FIJO', 'POR_HORA']);
const PAY_FREQUENCIES = new Set(['MENSUAL', 'QUINCENAL', 'SEMANAL']);

// Un salario mensual se convierte al periodo que se esta pagando.
// Semanal usa el promedio anual de 52 semanas, no una division por cuatro.
const FREQUENCY_FACTOR = Object.freeze({
    MENSUAL: 1,
    QUINCENAL: 0.5,
    SEMANAL: 12 / 52
});

function normalizePaymentType(value) {
    const normalized = String(value || 'FIJO').toUpperCase();

    if (!PAYMENT_TYPES.has(normalized)) {
        throw new ValidationError('El tipo de pago debe ser FIJO o POR_HORA.');
    }

    return normalized;
}

function normalizePayFrequency(value) {
    const normalized = String(value || 'MENSUAL').toUpperCase();

    if (!PAY_FREQUENCIES.has(normalized)) {
        throw new ValidationError(
            'La frecuencia de pago debe ser MENSUAL, QUINCENAL o SEMANAL.'
        );
    }

    return normalized;
}

function periodBaseAmount(monthlyAmount, payFrequency) {
    return round2(toAmount(monthlyAmount) * FREQUENCY_FACTOR[payFrequency]);
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
    periodType = null,
    regularHours = 0,
    hourlyRate = null,
    perceptions = [],
    bonuses = [],
    overtime = [],
    deductions = [],
    loanInstallments = []
}) {
    if (!employee || !Number.isSafeInteger(employee.id)) {
        throw new ValidationError('El empleado es obligatorio para calcular la prenomina.');
    }

    if (!baseSalary) {
        throw new ConflictError(
            `El empleado ${employee.employeeCode} no tiene un salario base vigente.`
        );
    }

    const paymentType = normalizePaymentType(employee.paymentType);
    const payFrequency = normalizePayFrequency(employee.payFrequency);

    if (periodType && normalizePayFrequency(periodType) !== payFrequency) {
        throw new ConflictError(
            `El empleado ${employee.employeeCode} tiene frecuencia ${payFrequency} y el periodo es ${periodType}.`
        );
    }

    if (paymentType === 'FIJO' && (baseSalary.amount === null || baseSalary.amount === undefined)) {
        throw new ConflictError(
            `El empleado ${employee.employeeCode} no tiene un salario base vigente.`
        );
    }

    const lines = [];
    let baseAmount = 0;
    let baseQuantity = 1;
    let baseRate = 0;
    let baseSourceType = 'COMPENSACION';
    let baseSourceId = baseSalary.id || null;
    let effectiveHourlyRate = null;
    let effectiveRegularHours = 0;

    if (paymentType === 'POR_HORA') {
        effectiveHourlyRate = toAmount(hourlyRate ?? employee.hourlyRate);

        if (effectiveHourlyRate <= 0) {
            throw new ConflictError(
                `El empleado ${employee.employeeCode} es POR_HORA y no tiene tarifa horaria.`
            );
        }

        effectiveRegularHours = round2(toAmount(regularHours));

        if (effectiveRegularHours < 0) {
            throw new ValidationError('Las horas normales no pueden ser negativas.');
        }

        baseAmount = round2(effectiveRegularHours * effectiveHourlyRate);
        baseQuantity = effectiveRegularHours;
        baseRate = effectiveHourlyRate;
        baseSourceType = 'HORAS_NORMALES';
        baseSourceId = null;

        if (effectiveRegularHours > 0) {
            lines.push(buildLine({
                conceptId: baseSalary.conceptId,
                conceptCode: baseSalary.conceptCode,
                conceptName: baseSalary.conceptName,
                lineType: 'PERCEPCION',
                quantity: effectiveRegularHours,
                rate: effectiveHourlyRate,
                amount: baseAmount,
                sourceType: baseSourceType,
                sourceId: baseSourceId
            }));
        }
    } else {
        baseAmount = periodBaseAmount(baseSalary.amount, payFrequency);
        baseRate = baseAmount;

        lines.push(buildLine({
            conceptId: baseSalary.conceptId,
            conceptCode: baseSalary.conceptCode,
            conceptName: baseSalary.conceptName,
            lineType: 'PERCEPCION',
            quantity: 1,
            rate: baseRate,
            amount: baseAmount,
            sourceType: baseSourceType,
            sourceId: baseSourceId
        }));
    }

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
        paymentType,
        payFrequency,
        regularHours: effectiveRegularHours,
        hourlyRate: effectiveHourlyRate,
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
