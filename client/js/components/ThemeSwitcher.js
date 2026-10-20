import BaseComponent from './BaseComponent.js';

// Selector de vistas de fondo: solo avisa que tema se eligio
class ThemeSwitcher extends BaseComponent {
    constructor() {
        super({
            template: '/templates/theme-switcher.html',
            styles: ['/css/theme-switcher.css']
        });
    }

    render() {}

    addEvents() {
        this.shadowRoot.querySelectorAll('.btn-vista').forEach(boton => {
            boton.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('theme-change', {
                    detail: boton.getAttribute('data-theme')
                }));
            });
        });
    }
}

customElements.define('x-theme-switcher', ThemeSwitcher);
