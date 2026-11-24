'use strict';

const { NotFoundError, ConflictError, ValidationError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

class HorasExtras {
    constructor(repository = new PayrollRepository()) {
        this.repository = repository;
    }

    async listar({ empleadoId = null, periodo = null } = {}) {
        if (empleadoId !== null) {
            const employee = await this.repository.getEmployeeById(empleadoId);
            if (!employee) {
                throw new NotFoundError('Empleado no encontrado.');
            }
        }

        const records = await this.repository.listOvertime({ empleadoId, periodo });

        return records.map(record => ({
            id: record.id,
            empleadoId: record.employeeId,
            codigoEmpleado: record.employeeCode,
            nombreEmpleado: record.employeeName,
            periodo: record.periodCode,
            fecha: record.workDate,
            concepto: record.conceptName,
            codigoConcepto: record.conceptCode,
            horas: record.hours,
            tarifaHora: record.hourlyRate,
            factor: record.rateMultiplier,
            importe: record.amount,
            estado: record.status,
            moneda: 'MXN'
        }));
    }

    async registrar({ empleadoId, periodo, fecha, horas, tarifaHora, factor, conceptoId, creadoPor }) {
        if (!Number.isSafeInteger(empleadoId) || empleadoId <= 0) {
            throw new ValidationError('El campo empleadoId es obligatorio y debe ser un entero positivo.');
        }
        if (!Number.isSafeInteger(conceptoId) || conceptoId <= 0) {
            throw new ValidationError('El campo conceptoId es obligatorio y debe ser un entero positivo.');
        }
        const hours = round2(horas);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
            throw new ValidationError('El campo horas debe ser un numero entre 0 y 24.');
        }
        const rate = round2(tarifaHora);
        if (!Number.isFinite(rate) || rate <= 0) {
            throw new ValidationError('El campo tarifaHora debe ser un numero positivo.');
        }
        const multiplier = round2(factor || 1.5);
        if (!Number.isFinite(multiplier) || multiplier <= 0) {
            throw new ValidationError('El campo factor debe ser un numero positivo.');
        }
        const amount = round2(hours * rate * multiplier);

        const employee = await this.repository.getEmployeeById(empleadoId);
        if (!employee) {
            throw new NotFoundError('Empleado no encontrado.');
        }

        const period = await this.repository.getPeriodByCode(periodo);
        if (!period) {
            throw new NotFoundError('Periodo no encontrado.');
        }
        if (period.status !== 'ABIERTO') {
            throw new ConflictError(`El periodo ${periodo} esta ${period.status.toLowerCase()}; no se pueden registrar horas extra.`);
        }

        const result = await this.repository.createOvertime({
            employeeId,
            periodId: period.id,
            conceptId: conceptoId,
            workDate: fecha,
            hours,
            rateMultiplier: multiplier,
            hourlyRate: rate,
            amount,
            createdBy: creadoPor
        });

        return {
            id: result.id,
            empleadoId: result.employee_id,
            codigoEmpleado: employee.employeeCode,
            periodo: period.code,
            fecha,
            horas: hours,
            tarifaHora: rate,
            factor: multiplier,
            importe: amount,
            estado: 'PENDIENTE',
            moneda: 'MXN'
        };
    }
}

module.exports = HorasExtras;
