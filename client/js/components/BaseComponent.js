// Clase base de los componentes desacoplados: cada componente carga
// su template HTML y sus hojas de estilo desde archivos externos.
export default class BaseComponent extends HTMLElement {
    /**
     * @param {Object}   recursos
     * @param {string}   recursos.template ruta del template HTML externo
     * @param {string[]} recursos.styles   rutas de las hojas de estilo externas
     */
    constructor({ template, styles = [] }) {
        super();
        this.attachShadow({ mode: 'open' });
        this._templateUrl = template;
        this._styleUrls = styles;
        this._resourcesReady = this._loadResources();
    }

    // Los componentes hijos sobreescriben estos metodos
    render() {}
    addEvents() {}

    async connectedCallback() {
        await this._resourcesReady;
        this.render();
        this.addEvents();
    }

    // Carga el css y el template externos dentro del shadow root
    async _loadResources() {
        try {
            for (const href of this._styleUrls) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                this.shadowRoot.appendChild(link);
            }

            const response = await fetch(this._templateUrl);
            if (!response.ok) {
                throw new Error(`No se pudo cargar el template (${response.status})`);
            }

            const text = await response.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const template = doc.querySelector('template');

            if (!template) {
                throw new Error('El archivo del template no contiene <template>');
            }

            this.shadowRoot.appendChild(template.content.cloneNode(true));
        } catch (error) {
            console.error(`[${this.tagName.toLowerCase()}] Error al cargar sus recursos:`, error);
        }
    }
}
