import { useState } from 'react';

import Nav from '../components/Nav.jsx';
import Panel from '../components/Panel.jsx';
import ThemeSwitcher from '../components/ThemeSwitcher.jsx';
import { menuConfig } from '../config/menu.js';

function buildGreeting(session) {
    const profiles = (session.Profile || [])
        .map(profile => profile.name)
        .join(', ');

    return `Hola ${session.Name}. Tu sesión está activa. Perfiles: ${profiles || 'sin perfiles'}.`;
}

export default function HomePage({ session, onThemeChange, onLogout, navLinks, onNavLinkClick }) {
    const [panelOpen, setPanelOpen] = useState(false);
    const [sectionTitle, setSectionTitle] = useState('Selecciona una opción');
    const [content, setContent] = useState(() => buildGreeting(session));

    async function handleMenuSelect(option) {
        if (option === 'Confirmar salida' || option === 'Cambiar de cuenta') {
            await onLogout();
            return;
        }

        setSectionTitle(option);
        setContent(`Configuración activa para: ${option}`);
        setPanelOpen(false);
    }

    return (
        <>
            <Nav
                userName={session.Name}
                panelOpen={panelOpen}
                onUserClick={() => setPanelOpen(open => !open)}
            />
            <Panel
                open={panelOpen}
                menu={menuConfig}
                onSelect={handleMenuSelect}
            />

            <main className="contenido">
                <nav className="sub-nav">
                    {navLinks.map(link => (
                        <Link
                            key={link.to}
                            to={link.to}
                            className="nav-link"
                            onClick={() => onNavLinkClick(link.to)}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <h1 id="seccion-titulo">{sectionTitle}</h1>
                <ThemeSwitcher onThemeChange={onThemeChange} />
                <div id="contenido-dinamico">
                    <p>{content}</p>
                </div>
            </main>
        </>
    );
}
