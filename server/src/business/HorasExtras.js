'use strict';

const { NotFoundError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

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
}

module.exports = HorasExtras;
