// Datos del menu, desacoplados del componente que los dibuja
export const menuConfig = [
    {
        icon: '/images/display.png',
        text: 'Pantalla y accesibilidad',
        submenus: ['Tamaño de fuente', 'Contraste alto', 'Zoom de página']
    },
    {
        icon: '/images/help.png',
        text: 'Ayuda y soporte',
        submenus: ['Documentación', 'Reportar un problema', 'Centro de ayuda']
    },
    {
        icon: '/images/feedback.png',
        text: 'Enviar comentarios',
        submenus: ['Sugerir mejora', 'Calificar aplicación']
    },
    {
        icon: '/images/setting.png',
        text: 'Configuración',
        submenus: ['Perfil de usuario', 'Privacidad y seguridad', 'Notificaciones']
    },
    {
        icon: '/images/logout.png',
        text: 'Cerrar sesión',
        submenus: ['Confirmar salida', 'Cambiar de cuenta']
    }
];
