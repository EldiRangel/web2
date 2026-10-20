'use strict';

const { NotFoundError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

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
}

module.exports = Bonos;
