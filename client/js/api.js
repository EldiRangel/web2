// Capa de acceso al API: la interfaz solo llama estos metodos,
// no sabe como se hacen las peticiones por dentro.

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
        // La respuesta no traia JSON
    }

    return { ok: response.ok, status: response.status, data };
}

export const Api = {
    getSession() {
        return request('/auth/session');
    },

    login(userName, password) {
        return request('/auth/login', { method: 'POST', body: { userName, password } });
    },

    logout() {
        return request('/auth/logout', { method: 'POST' });
    },

    getProfiles() {
        return request('/auth/profiles');
    }
};
