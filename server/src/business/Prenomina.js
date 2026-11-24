'use strict';

const { ConflictError, NotFoundError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');
const PayrollCalculator = require('./PayrollCalculator');

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function groupByEmployee(rows) {
    const grouped = new Map();

    for (const row of rows) {
        if (!grouped.has(row.employeeId)) {
            grouped.set(row.employeeId, []);
        }
        grouped.get(row.employeeId).push(row);
    }

    return grouped;
}

function summaryLine(result) {
    const amountByConcept = code => round2(
        result.lines
            .filter(line => line.conceptCode === code)
            .reduce((total, line) => total + line.amount, 0)
    );

    return {
        empleadoId: result.employee.id,
        codigo: result.employee.employeeCode,
        nombre: result.employee.name,
        salarioBase: result.baseSalary,
        bonos: amountByConcept('BONO'),
        horasExtras: amountByConcept('HORAS_EXTRA'),
        bruto: result.totalEarnings,
        deducciones: result.totalDeductions,
        neto: result.netAmount
    };
}

class Prenomina {
    constructor(repository = new PayrollRepository(), calculator = PayrollCalculator) {
        this.repository = repository;
        this.calculator = calculator;
    }

    /**
     * Calculo repetible mientras el periodo no este cerrado. Cada ejecucion
     * reemplaza el snapshot persistido del periodo; no duplica resultados.
     */
    async calcular({ periodo, empleadoIds = null }, context = {}) {
        const period = await this.repository.getPeriodByCode(periodo);
        if (!period) {
            throw new NotFoundError('Periodo no encontrado.');
        }
        if (period.status === 'CERRADO') {
            throw new ConflictError(
                'La nomina definitiva de este periodo ya esta cerrada; no se puede recalcular.'
            );
        }
        if (period.status === 'CANCELADO') {
            throw new ConflictError('El periodo indicado esta cancelado.');
        }

        let employees;

        if (empleadoIds !== null) {
            const found = await this.repository.getEmployees({
                employeeIds: empleadoIds,
                status: null,
                limit: empleadoIds.length
            });

            const byId = new Map(found.map(employee => [employee.id, employee]));
            const missing = empleadoIds.filter(id => !byId.has(id));
            if (missing.length > 0) {
                throw new NotFoundError(
                    `Empleados no encontrados: ${missing.join(', ')}.`
                );
            }

            const inactive = found.filter(employee => employee.status !== 'ACTIVO');
            if (inactive.length > 0) {
                throw new ConflictError(
                    `Los empleados ${inactive.map(employee => employee.id).join(', ')} estan inactivos y no pueden incluirse en la prenomina.`
                );
            }

            employees = found;
        } else {
            employees = await this.repository.getEmployees({
                status: 'ACTIVO',
                limit: 500
            });
        }

        if (employees.length === 0) {
            throw new ConflictError('No hay empleados activos para calcular la prenomina.');
        }

        const ids = employees.map(employee => employee.id);
        const [
            salaries,
            perceptions,
            deductions,
            bonuses,
            overtime,
            loanInstallments,
            timeEntries
        ] = await Promise.all([
            this.repository.getBaseSalaries(ids, period.endDate),
            this.repository.getRecurringPerceptions(period.id, ids),
            this.repository.getRecurringDeductions(period.id, ids),
            this.repository.getApprovedBonuses(period.id, ids),
            this.repository.getApprovedOvertime(period.id, ids),
            this.repository.getScheduledLoanInstallments(period.id, ids),
            this.repository.getApprovedTimeEntries(period.id, ids)
        ]);

        const salaryByEmployee = new Map(
            salaries.map(salary => [salary.employeeId, salary])
        );

        const missingSalary = employees.filter(employee => !salaryByEmployee.has(employee.id));
        if (missingSalary.length > 0) {
            throw new ConflictError(
                `Los empleados ${missingSalary.map(employee => employee.id).join(', ')} no tienen un salario base vigente para el periodo.`
            );
        }

        const perceptionsByEmployee = groupByEmployee(perceptions);
        const deductionsByEmployee = groupByEmployee(deductions);
        const bonusesByEmployee = groupByEmployee(bonuses);
        const overtimeByEmployee = groupByEmployee(overtime);
        const installmentsByEmployee = groupByEmployee(loanInstallments);
        const timeEntriesByEmployee = new Map(
            timeEntries.map(entry => [entry.employeeId, entry])
        );

        const calculation = this.calculator.calculatePayroll(
            employees.map(employee => ({
                employee,
                baseSalary: salaryByEmployee.get(employee.id),
                periodType: period.periodType,
                regularHours: timeEntriesByEmployee.get(employee.id)?.hours ?? 0,
                perceptions: perceptionsByEmployee.get(employee.id) || [],
                bonuses: bonusesByEmployee.get(employee.id) || [],
                overtime: overtimeByEmployee.get(employee.id) || [],
                deductions: deductionsByEmployee.get(employee.id) || [],
                loanInstallments: installmentsByEmployee.get(employee.id) || []
            }))
        );

        const saved = await this.repository.savePrenomina({
            periodCode: period.code,
            userId: context && context.userId ? context.userId : null,
            results: calculation.results,
            totals: calculation.totals
        });

        return {
            periodo: period.code,
            moneda: 'MXN',
            estado: 'CALCULADA',
            runId: saved.runId,
            runNumero: saved.runNumber,
            recalculada: saved.recalculated,
            totales: calculation.totals,
            lineas: calculation.results.map(summaryLine),
            calculadaEn: saved.calculatedAt
        };
    }

    async consultar({ periodo }) {
        return this.repository.getPrenomina(periodo);
    }
}

module.exports = Prenomina;
