// =========================================
// Login - Sistema de Nomina (Vanilla JS)
// =========================================

import { Api, setAccessToken, setCsrfToken, initCsrfToken } from './api.js';

// Elementos DOM (solo existen en login.html)
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');

async function checkSession() {
    try {
        const { ok, data } = await Api.getSession();
        if (ok && data && data.session) {
            // Ya hay sesion: ir al panel (el servidor servira index.html)
            window.location.replace('/');
        }
    } catch (error) {
        console.error('No se pudo verificar la sesion:', error);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const userName = loginEmail.value.trim();
    const password = loginPassword.value;

    loginError.textContent = '';
    loginError.style.display = 'none';

    if (!userName || !password) {
        loginError.textContent = 'Correo y contrasena son obligatorios';
        loginError.style.display = 'block';
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';

    try {
        const { ok, status, data, headers } = await Api.login(userName, password);

        // Capturar CSRF token de la respuesta del servidor
        const csrfHeader = headers['x-csrf-token'];
        if (csrfHeader) {
            setCsrfToken(csrfHeader);
        }

        if (!ok || !data || !data.success) {
            if (status === 429) {
                loginError.textContent = 'Demasiados intentos. Intenta de nuevo en un minuto.';
            } else {
                loginError.textContent = (data && data.message) || 'No se pudo iniciar sesion';
            }
            loginError.style.display = 'block';
            return;
        }

        // Guardar access token JWT si viene en la respuesta
        if (data.accessToken) {
            setAccessToken(data.accessToken);
        }

        // Sesion establecida: ir al panel
        window.location.replace('/');
    } catch (err) {
        console.error('[Login]', err);
        loginError.textContent = 'Error de conexion con el servidor';
        loginError.style.display = 'block';
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Ingresar';
    }
}

// Inicializacion
if (loginForm) {
    // Obtener CSRF token inicial del servidor
    initCsrfToken();
    loginForm.addEventListener('submit', handleLogin);
}

// Verificar sesion al cargar
checkSession();
