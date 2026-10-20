'use strict';

const { NotFoundError } = require('../errors/AppError');
const PayrollRepository = require('../repositories/PayrollRepository');

function mapEmployee(employee) {
    return {
        id: employee.id,
        codigo: employee.employeeCode,
        nombre: employee.name,
        correo: employee.email,
        puesto: employee.position,
        departamento: employee.department,
        fechaIngreso: employee.hireDate,
        estado: employee.status
    };
}

class Empleados {
    constructor(repository = new PayrollRepository()) {
        this.repository = repository;
    }

    async listar({ estado = 'ACTIVO', limite = 100 } = {}) {
        const employees = await this.repository.getEmployees({
            status: estado === 'TODOS' ? null : estado,
            limit: limite
        });

        return employees.map(mapEmployee);
    }

    async consultar({ empleadoId }) {
        const employee = await this.repository.getEmployeeById(empleadoId);
        if (!employee) {
            throw new NotFoundError('Empleado no encontrado.');
        }
        return mapEmployee(employee);
    }
}

module.exports = Empleados;
