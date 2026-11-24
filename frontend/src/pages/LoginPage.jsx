import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Api } from '../api/api.js';

export default function LoginPage({ onLogin }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        setError(null);

        const cleanEmail = email.trim();
        if (!cleanEmail || !password) {
            setError('Correo y contraseña son obligatorios');
            return;
        }

        setSubmitting(true);

        try {
            const { ok, data } = await Api.login(cleanEmail, password);

            if (!ok || !data || !data.success) {
                setError((data && data.message) || 'No se pudo iniciar sesión');
                return;
            }

            onLogin(data.session);
            navigate('/', { replace: true });
        } catch (err) {
            console.error('[LoginPage]', err);
            setError('Error de conexión con el servidor');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="login-root">
            <div className="login-wrap">
                <div className="login-brand">
                    <span className="brand-mark">N</span>
                    <span className="brand-name">Nómina</span>
                </div>

                <form className="login-form" onSubmit={handleSubmit} noValidate>
                    <div className="field">
                        <label htmlFor="email">Correo electrónico</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="ana@example.com"
                            autoComplete="email"
                            autoFocus
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="field">
                        <label htmlFor="password">Contraseña</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p className="login-error" role="alert">{error}</p>
                    )}

                    <button
                        type="submit"
                        className="login-btn"
                        disabled={submitting}
                    >
                        {submitting ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>

                <p className="login-hint">
                    Demo: <strong>ana@example.com</strong> / <strong>password123</strong>
                </p>
            </div>
        </div>
    );
}
