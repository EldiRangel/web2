'use strict';

const { NotFoundError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

class Salarios {
    constructor(repository = new PayrollRepository()) {
        this.repository = repository;
    }

    async consultar({ empleadoId }) {
        const salary = await this.repository.getSalary(empleadoId);
        if (!salary) {
            throw new NotFoundError('Empleado no encontrado.');
        }

        return {
            empleadoId: salary.id,
            codigo: salary.employeeCode,
            nombre: salary.name,
            estado: salary.status,
            salarioBase: salary.amount,
            concepto: salary.conceptCode
                ? {
                    codigo: salary.conceptCode,
                    nombre: salary.conceptName
                }
                : null,
            vigenteDesde: salary.effectiveFrom,
            moneda: 'MXN'
        };
    }
}

module.exports = Salarios;
