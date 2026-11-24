'use strict';

const { NotFoundError, ConflictError, ValidationError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

class Tiempo {
    constructor(repository = new PayrollRepository()) {
        this.repository = repository;
    }

    async registrar({ empleadoId, fecha, horas, tarifaHora, notas, creadoPor }) {
        if (!Number.isSafeInteger(empleadoId) || empleadoId <= 0) {
            throw new ValidationError('El campo empleadoId es obligatorio y debe ser un entero positivo.');
        }
        const hours = round2(horas);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
            throw new ValidationError('El campo horas debe ser un numero entre 0 y 24.');
        }
        const rate = round2(tarifaHora);
        if (!Number.isFinite(rate) || rate <= 0) {
            throw new ValidationError('El campo tarifaHora debe ser un numero positivo.');
        }

        const employee = await this.repository.getEmployeeById(empleadoId);
        if (!employee) {
            throw new NotFoundError('Empleado no encontrado.');
        }

        const result = await this.repository.createTimeEntry({
            employeeId,
            workDate: fecha,
            hours,
            hourlyRate: rate,
            notes: notas || null,
            createdBy: creadoPor
        });

        return {
            id: result.id,
            empleadoId: result.employee_id,
            codigoEmpleado: employee.employeeCode,
            fecha: result.work_date,
            horas: result.hours,
            tarifaHora: result.hourly_rate,
            notas: result.notes,
            estado: result.status,
            moneda: 'MXN'
        };
    }
}

module.exports = Tiempo;
