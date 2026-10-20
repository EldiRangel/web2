import BaseComponent from './BaseComponent.js';
import { Api } from '../api.js';

// Formulario de login: valida, llama al API y avisa el resultado
class Login extends BaseComponent {
    constructor() {
        super({
            template: '/templates/login.html',
            styles: ['/css/login.css']
        });
    }

    render() {}

    addEvents() {
        this._form = this.shadowRoot.getElementById('login-form');
        this._errorBox = this.shadowRoot.getElementById('login-error');
        this._submitBtn = this.shadowRoot.querySelector("button[type='submit']");

        if (this._form) {
            this._form.addEventListener('submit', event => this._onSubmit(event));
        }
    }

    async _onSubmit(event) {
        event.preventDefault();
        this._hideError();

        const userName = this.shadowRoot.getElementById('userName').value.trim();
        const password = this.shadowRoot.getElementById('password').value;

        if (!userName || !password) {
            return this._showError('Usuario y contraseña son obligatorios');
        }

        this._submitBtn.disabled = true;

        try {
            const { ok, data } = await Api.login(userName, password);

            if (!ok || !data.success) {
                return this._showError((data && data.message) || 'No se pudo iniciar sesión');
            }

            // La pagina decide a donde navegar
            window.dispatchEvent(new CustomEvent('login-success', { detail: data.session }));
        } catch (error) {
            console.error('[x-login]', error);
            this._showError('Error de conexión con el servidor');
        } finally {
            this._submitBtn.disabled = false;
        }
    }

    _showError(message) {
        this._errorBox.textContent = message;
        this._errorBox.classList.remove('hidden');
    }

    _hideError() {
        this._errorBox.textContent = '';
        this._errorBox.classList.add('hidden');
    }
}

customElements.define('x-login', Login);
