import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, Link } from 'react-router-dom';

import { Api } from './api/api.js';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import EmpleadosPage from './pages/EmpleadosPage.jsx';
import PrenominaPage from './pages/PrenominaPage.jsx';

export default function App() {
    const location = useLocation();
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState('claro');

    // La sesion se valida contra el servidor. Nunca se guarda en localStorage.
    useEffect(() => {
        let active = true;

        Api.getSession()
            .then(({ ok, data }) => {
                if (!active) return;
                setSession(ok && data && data.session ? data.session : null);
            })
            .catch(error => {
                console.error('No se pudo verificar la sesion:', error);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    // El tema y la clase del body se conservan igual que en el frontend anterior.
    useEffect(() => {
        const isLogin = location.pathname === '/login';
        document.body.className = isLogin ? 'login-page' : `tema-${theme}`;
        document.title = isLogin ? 'Iniciar sesión' : 'Menú Mundial';
    }, [location.pathname, theme]);

    async function handleLogout() {
        try {
            await Api.logout();
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
        }
        setSession(null);
        navigate('/login', { replace: true });
    }

    if (loading) {
        return <div className="app-loading">Cargando...</div>;
    }

    const navLinks = [
        { to: '/', label: 'Inicio' },
        { to: '/empleados', label: 'Empleados' },
        { to: '/prenomina', label: 'Prenomina' }
    ];

    return (
        <Routes>
            <Route
                path="/login"
                element={
                    session
                        ? <Navigate to="/" replace />
                        : <LoginPage onLogin={setSession} />
                }
            />
            <Route
                path="/"
                element={
                    session ? (
                        <HomePage
                            session={session}
                            onThemeChange={setTheme}
                            onLogout={handleLogout}
                            navLinks={navLinks}
                            onNavLinkClick={to => navigate(to, { replace: true })}
                        />
                    ) : <Navigate to="/login" replace />
                }
            />
            <Route
                path="/empleados"
                element={
                    session ? <EmpleadosPage /> : <Navigate to="/login" replace />
                }
            />
            <Route
                path="/prenomina"
                element={
                    session ? <PrenominaPage /> : <Navigate to="/login" replace />
                }
            />
            <Route
                path="*"
                element={<Navigate to={session ? '/' : '/login'} replace />}
            />
        </Routes>
    );
}
