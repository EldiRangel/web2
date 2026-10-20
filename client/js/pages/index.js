// Logica de la pagina principal: une la sesion, el menu y los temas
import { Api } from '../api.js';
import { menuConfig } from '../config/menu.js';
import '../components/Nav.js';
import '../components/Panel.js';
import '../components/ThemeSwitcher.js';

const nav = document.querySelector('x-nav');
const panel = document.querySelector('x-panel');
const seccionTitulo = document.getElementById('seccion-titulo');
const contenidoDinamico = document.getElementById('contenido-dinamico');

let abierto = false;

async function init() {
    // Sin sesion activa no se muestra esta pagina
    let session = null;
    try {
        const { ok, data } = await Api.getSession();
        if (ok) session = data.session;
    } catch (error) {
        console.error('No se pudo verificar la sesion:', error);
    }

    if (!session) {
        window.location.replace('/login');
        return;
    }

    nav.setUserName(session.Name);

    const perfiles = session.Profile.map(p => p.name).join(', ');
    contenidoDinamico.querySelector('p').textContent =
        `Hola ${session.Name}. Tu sesion esta activa. Perfiles: ${perfiles || 'sin perfiles'}.`;

    panel.setMenuData(menuConfig);
}

// El icono de usuario abre y cierra el panel
window.addEventListener('user-icon-click', () => {
    abierto = !abierto;
    if (abierto) panel.show(); else panel.hide();
});

// Opcion final elegida en el menu
window.addEventListener('menu-select', event => {
    if (event.detail === 'Confirmar salida' || event.detail === 'Cambiar de cuenta') {
        cerrarSesion();
        return;
    }

    seccionTitulo.textContent = event.detail;
    contenidoDinamico.querySelector('p').textContent = `Configuración activa para: ${event.detail}`;
    abierto = false;
});

// El componente de temas solo avisa cual se eligio; aqui se aplica al body
window.addEventListener('theme-change', event => {
    document.body.classList.remove('tema-claro', 'tema-gris', 'tema-oscuro');
    document.body.classList.add(`tema-${event.detail}`);
});

async function cerrarSesion() {
    try {
        await Api.logout();
    } catch (error) {
        console.error('Error al cerrar sesion:', error);
    }
    window.location.replace('/login');
}

init();
