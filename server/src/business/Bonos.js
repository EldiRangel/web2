'use strict';

const { NotFoundError, ConflictError, ValidationError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

class Bonos {
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

        const bonuses = await this.repository.listBonuses({ empleadoId, periodo });

        return bonuses.map(bonus => ({
            id: bonus.id,
            empleadoId: bonus.employeeId,
            codigoEmpleado: bonus.employeeCode,
            nombreEmpleado: bonus.employeeName,
            periodo: bonus.periodCode,
            concepto: bonus.conceptName,
            codigoConcepto: bonus.conceptCode,
            monto: bonus.amount,
            motivo: bonus.reason,
            estado: bonus.status,
            moneda: 'MXN'
        }));
    }

    async crear({ empleadoId, periodo, conceptoId, monto, motivo, creadoPor }) {
        if (!Number.isSafeInteger(empleadoId) || empleadoId <= 0) {
            throw new ValidationError('El campo empleadoId es obligatorio y debe ser un entero positivo.');
        }
        if (!Number.isSafeInteger(conceptoId) || conceptoId <= 0) {
            throw new ValidationError('El campo conceptoId es obligatorio y debe ser un entero positivo.');
        }
        const amount = round2(monto);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new ValidationError('El campo monto debe ser un numero positivo.');
        }

        const employee = await this.repository.getEmployeeById(empleadoId);
        if (!employee) {
            throw new NotFoundError('Empleado no encontrado.');
        }

        const period = await this.repository.getPeriodByCode(periodo);
        if (!period) {
            throw new NotFoundError('Periodo no encontrado.');
        }
        if (period.status !== 'ABIERTO') {
            throw new ConflictError(`El periodo ${periodo} esta ${period.status.toLowerCase()}; no se pueden registrar bonos.`);
        }

        const result = await this.repository.createBonus({
            employeeId,
            periodId: period.id,
            conceptId: conceptoId,
            amount,
            reason: motivo || null,
            createdBy: creadoPor
        });

        return {
            id: result.id,
            empleadoId: result.employee_id,
            codigoEmpleado: employee.employeeCode,
            periodo: period.code,
            conceptoId: result.concept_id,
            monto: result.amount,
            motivo: result.reason,
            estado: result.status,
            moneda: 'MXN'
        };
    }
}

module.exports = Bonos;
