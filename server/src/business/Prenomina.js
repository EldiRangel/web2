'use strict';

const { ConflictError, NotFoundError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');
const PayrollCalculator = require('./PayrollCalculator');
const VenezuelanPayroll = require('./VenezuelanPayroll');

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

        // --- Integracion nomina venezolana: deducciones de ley (Bloque 3) ---
        const venezolano = new VenezuelanPayroll(this.repository);
        const periodoStart = period.startDate;
        const periodoEnd = period.endDate;

        // Calcular dias del periodo
        const start = new Date(periodoStart);
        const end = new Date(periodoEnd);
        const diasPeriodo = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

        for (const result of calculation.results) {
            const emp = employees.find(e => e.id === result.employee.id);
            if (!emp) continue;

            // Calcular dias trabajados (considerando despidos - Bloque 4)
            const diasInfo = await venezolano.getDiasTrabajadosPeriodo({
                empleadoId: emp.id,
                periodoStart,
                periodoEnd
            });

            // Calcular deducciones de ley sobre el salario base del empleado
            const salarioBaseEmp = result.baseSalary || 0;
            const ley = await venezolano.calcularDeduccionesLey({
                empleadoId: emp.id,
                salarioBase: salarioBaseEmp,
                diasTrabajados: diasInfo.diasTrabajados,
                diasPeriodo: diasInfo.diasPeriodo
            });

            // Agregar lineas de deduccion de ley a las lineas del empleado
            for (const linea of ley.deducciones) {
                result.lines.push({
                    conceptId: linea.conceptoId,
                    conceptCode: linea.codigoConcepto,
                    conceptName: linea.concepto,
                    lineType: 'DEDUCCION',
                    quantity: 1,
                    rate: linea.tarifa,
                    amount: linea.importe,
                    sourceType: 'LEY',
                    sourceId: linea.origenId
                });
            }

            // Recalcular totalDeductions y netAmount del empleado
            result.totalDeductions = Math.round(
                (result.totalDeductions + ley.totalDeducciones) * 100
            ) / 100;
            result.netAmount = Math.round(
                (result.totalEarnings - result.totalDeductions) * 100
            ) / 100;

            if (result.netAmount < 0) {
                result.netAmount = 0;
            }
        }

        // Recalcular totales globales despues de agregar deducciones de ley
        const allLines = calculation.results.flatMap(r => r.lines);
        calculation.totals.deducciones = Math.round(
            calculation.results.reduce((sum, r) => sum + r.totalDeductions, 0) * 100
        ) / 100;
        calculation.totals.neto = Math.round(
            calculation.results.reduce((sum, r) => sum + r.netAmount, 0) * 100
        ) / 100;
        calculation.totals.percepciones = Math.round(
            calculation.results.reduce((sum, r) => sum + r.totalEarnings, 0) * 100
        ) / 100;
        calculation.totals.bruto = calculation.totals.percepciones;

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
