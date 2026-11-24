// Capa de acceso a las operaciones de nomina.
// Centraliza los IDs de subsistema/clase/metodo registrados en PostgreSQL
// y el contrato del Dispatcher (POST /api/dispatcher).

const SUBSYSTEM_ID = 1;

function operation(classId, methodId, params = {}) {
    return {
        subsystemId: SUBSYSTEM_ID,
        classId,
        methodId,
        params
    };
}

export const PayrollApi = {
    // Empleados
    listEmployees({ estado = 'ACTIVO', limite = 200 } = {}) {
        return Api.dispatch(operation(1, 2, { estado, limite }));
    },
    getEmployee(employeeId) {
        return Api.dispatch(operation(1, 3, { empleadoId: employeeId }));
    },

    // Salarios
    getSalary(employeeId) {
        return Api.dispatch(operation(2, 10, { empleadoId: employeeId }));
    },

    // Bonos
    listBonuses({ empleadoId = null, periodo = null } = {}) {
        return Api.dispatch(operation(3, 1, { empleadoId, periodo }));
    },

    // Horas extra
    listOvertime({ empleadoId = null, periodo = null } = {}) {
        return Api.dispatch(operation(4, 4, { empleadoId, periodo }));
    },

    // Prestamos
    listLoans({ empleadoId = null } = {}) {
        return Api.dispatch(operation(5, 9, { empleadoId }));
    },

    // Prenomina
    calculatePayroll({ periodo, empleadoIds = null } = {}) {
        const params = { periodo };
        if (empleadoIds) params.empleadoIds = empleadoIds;
        return Api.dispatch(operation(6, 7, params));
    },
    getPayroll({ periodo }) {
        return Api.dispatch(operation(6, 8, { periodo }));
    },

    // Nomina definitiva
    getNominalStatus({ periodo }) {
        return Api.dispatch(operation(7, 5, { periodo }));
    },
    closePayroll({ periodo }) {
        return Api.dispatch(operation(7, 6, { periodo, confirmar: true }));
    }
};
