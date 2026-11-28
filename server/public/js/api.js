// =========================================
// Capa de acceso al API - Sistema de Nomina
// =========================================

const BASE = '/api';

// Almacen en memoria del access token (se establece tras login exitoso)
let accessToken = null;
let csrfToken = null;

export function setAccessToken(token) {
    accessToken = token;
}

export function getAccessToken() {
    return accessToken;
}

export function setCsrfToken(token) {
    csrfToken = token;
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) meta.content = token;
}

export async function initCsrfToken() {
    try {
        const { ok, data } = await request('');
        if (ok && data && data.csrfToken) {
            setCsrfToken(data.csrfToken);
        }
    } catch (error) {
        // No hay sesion o no hay csrf; se obtendra tras el login
    }
}

async function refreshAccessToken() {
    try {
        const { ok, data } = await request('/auth/refresh', {
            method: 'POST',
            _noAuth: true // no enviar access token (no hay uno valido)
        });
        if (ok && data && data.accessToken) {
            setAccessToken(data.accessToken);
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

async function request(path, options = {}, _retry = false) {
    // No enviar access token en la peticion de refresh
    const skipAuth = options._noAuth || path === '/auth/refresh';
    delete options._noAuth;

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    // Enviar access token JWT si existe (para /api/dispatcher y rutas protegidas)
    if (!skipAuth && accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Enviar token CSRF para metodos que cambian estado
    if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method)) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }
    }

    const response = await fetch(BASE + path, {
        method: options.method || 'GET',
        headers,
        credentials: 'same-origin', // envia cookies (refresh_token HttpOnly)
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    let data = null;
    let headersOut = {};
    try {
        data = await response.json();
        headersOut = Object.fromEntries(response.headers.entries());
    } catch (error) {
        headersOut = Object.fromEntries(response.headers.entries());
    }

    // Si recibimos 401 y no es el endpoint de refresh, intentar renovar el token
    if (response.status === 401 && !_retry && !skipAuth) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            // Reintentar la peticion con el nuevo token
            return request(path, options, true);
        }
        // Si no se pudo renovar, limpiar token y redirigir a login
        setAccessToken(null);
        if (window.location.pathname !== '/login') {
            window.location.replace('/login');
        }
    }

    return { ok: response.ok, status: response.status, data, headers: headersOut };
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
    refreshToken() {
        return request('/auth/refresh', { method: 'POST' });
    },
    recoverPassword(email) {
        return request('/auth/recover', {
            method: 'POST',
            body: { email }
        });
    },
    verifyRecovery(token) {
        return request('/auth/verify', {
            method: 'POST',
            body: { token }
        });
    },
    resetPassword(token, password) {
        return request('/auth/reset', {
            method: 'POST',
            body: { token, password }
        });
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
            empleadoId, periodo, fecha, horas, tarifaHora: tarifa, factor, conceptoId, creadoPor
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
