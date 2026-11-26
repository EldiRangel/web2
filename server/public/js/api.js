// =========================================
// Capa de acceso al API - Sistema de Nomina
// =========================================

const BASE = '/api';

async function request(path, options = {}) {
    const response = await fetch(BASE + path, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        // No hay JSON en la respuesta
    }

    return { ok: response.ok, status: response.status, data };
}

export const Api = {
    // Sesion
    getSession() {
        return request('/auth/session');
    },
    login(userName, password) {
        return request('/auth/login', {
            method: 'POST',
            body: { userName, password }
        });
    },
    logout() {
        return request('/auth/logout', { method: 'POST' });
    },

    // Dispatcher - operaciones de nomina
    dispatch(operation) {
        return request('/dispatcher', { method: 'POST', body: operation });
    }
};

// IDs de operaciones registrados en PostgreSQL (subsistema 'Nomina')
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
    createBonus({ empleadoId, periodo, conceptoId, monto, motivo, creadoPor }) {
        return Api.dispatch(operation(3, 32, {
            empleadoId, periodo, conceptoId, monto, motivo, creadoPor
        }));
    },

    // Horas extra
    listOvertime({ empleadoId = null, periodo = null } = {}) {
        return Api.dispatch(operation(4, 4, { empleadoId, periodo }));
    },
    createOvertime({ empleadoId, periodo, fecha, horas, tarifaHora, factor, conceptoId, creadoPor }) {
        return Api.dispatch(operation(4, 37, {
            empleadoId, periodo, fecha, horas, tarifaHora, factor, conceptoId, creadoPor
        }));
    },

    // Tiempo (horas normales)
    createTimeEntry({ empleadoId, fecha, horas, tarifaHora, notas, creadoPor }) {
        return Api.dispatch(operation(27, 45, {
            empleadoId, fecha, horas, tarifaHora, notas, creadoPor
        }));
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
