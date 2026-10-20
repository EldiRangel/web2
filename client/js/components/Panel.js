import BaseComponent from './BaseComponent.js';

// Menu lateral: solo dibuja las opciones que la pagina le entrega
class Panel extends BaseComponent {
    constructor() {
        super({
            template: '/templates/panel.html',
            styles: ['/css/panel.css']
        });
        this.menuData = [];
        this.currentMenu = 'principal';
    }

    // Recibe los datos del menu desde la pagina
    setMenuData(data) {
        this.menuData = data;
        this.renderMenu('principal');
    }

    render() {
        this.renderMenu('principal');
    }

    addEvents() {
        const backBtn = this.shadowRoot.getElementById('back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.renderMenu('principal'));
        }
    }

    // Revisa el estado del menu y muestra las opciones
    renderMenu(menuState) {
        this.currentMenu = menuState;

        const contenedor = this.shadowRoot.querySelector('.menu-options');
        const menuTitle = this.shadowRoot.getElementById('menu-title');
        const backBtn = this.shadowRoot.getElementById('back-btn');

        if (!contenedor) return;
        contenedor.innerHTML = '';

        if (menuState === 'principal') {
            // En el menu principal se oculta el boton de volver
            backBtn.classList.add('hidden');
            menuTitle.textContent = 'Menú';

            this.menuData.forEach(item => {
                const row = this.createMenuRow(item.text, item.icon, true);
                row.addEventListener('click', () => this.renderMenu(item.text));
                contenedor.appendChild(row);
            });
        } else {
            // El submenu muestra el boton de volver y el titulo
            backBtn.classList.remove('hidden');
            menuTitle.textContent = menuState;

            const parentItem = this.menuData.find(item => item.text === menuState);
            if (parentItem && parentItem.submenus) {
                parentItem.submenus.forEach(subText => {
                    // Las subopciones finales no llevan flecha
                    const row = this.createMenuRow(subText, parentItem.icon, false);
                    row.addEventListener('click', () => {
                        this.dispatchSelect(subText);
                        this.hide();
                    });
                    contenedor.appendChild(row);
                });
            }
        }
    }

    // Crea cada fila del menu
    createMenuRow(text, iconPath, hasArrow) {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('menu-item');

        itemDiv.innerHTML = `
            <div class="menu-item-left">
                <img src="${iconPath}" alt="${text}">
                <p>${text}</p>
            </div>
            <span class="arrow">${hasArrow ? '❯' : ''}</span>
        `;
        return itemDiv;
    }

    // Avisa a la pagina que se eligio una opcion final
    dispatchSelect(title) {
        window.dispatchEvent(new CustomEvent('menu-select', { detail: title }));
    }

    show() {
        const menu = this.shadowRoot.querySelector('.side-menu');
        if (menu) menu.classList.add('open-menu');
    }

    hide() {
        const menu = this.shadowRoot.querySelector('.side-menu');
        if (menu) menu.classList.remove('open-menu');
    }
}

customElements.define('x-panel', Panel);
