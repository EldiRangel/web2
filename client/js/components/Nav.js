import BaseComponent from './BaseComponent.js';

// Barra superior: logo, enlaces, nombre del usuario y su icono
class Nav extends BaseComponent {
    constructor() {
        super({
            template: '/templates/nav.html',
            styles: ['/css/nav.css']
        });
        this.userName = '';
    }

    // La pagina le pasa el nombre que viene de la sesion
    setUserName(name) {
        this.userName = name || '';
        this._paintUserName();
    }

    render() {
        this._paintUserName();
    }

    // Avisa a la pagina cuando se hace click en el icono de usuario
    addEvents() {
        const icon = this.shadowRoot.querySelector('.user-icon');
        if (icon) {
            icon.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('user-icon-click'));
            });
        }
    }

    _paintUserName() {
        const span = this.shadowRoot.getElementById('user-name');
        if (span) span.textContent = this.userName;
    }
}

customElements.define('x-nav', Nav);
