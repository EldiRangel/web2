'use strict';

const { NotFoundError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

class Prestamos {
    constructor(repository = new PayrollRepository()) {
        this.repository = repository;
    }

    async listar({ empleadoId = null } = {}) {
        if (empleadoId !== null) {
            const employee = await this.repository.getEmployeeById(empleadoId);
            if (!employee) {
                throw new NotFoundError('Empleado no encontrado.');
            }
        }

        const loans = await this.repository.listLoans({ empleadoId });

        return loans.map(loan => ({
            id: loan.id,
            empleadoId: loan.employeeId,
            codigoEmpleado: loan.employeeCode,
            nombreEmpleado: loan.employeeName,
            montoOriginal: loan.principal,
            saldo: loan.balance,
            deduccionMensual: loan.installmentAmount,
            periodoInicio: loan.startPeriodCode,
            estado: loan.status,
            cuotas: loan.installments,
            moneda: 'MXN'
        }));
    }
}

module.exports = Prestamos;
