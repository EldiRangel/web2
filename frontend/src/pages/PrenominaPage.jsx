import { useEffect, useState } from 'react';

import { PayrollApi } from '../api/payroll.js';

const PERIODOS_DEMO = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'];

export default function PrenominaPage() {
    const [periodo, setPeriodo] = useState('2026-11');
    const [resultado, setResultado] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [mensaje, setMensaje] = useState(null);

    async function handleCalcular() {
        setError(null);
        setMensaje(null);
        setLoading(true);

        try {
            const { ok, data } = await PayrollApi.calculatePayroll({ periodo });

            if (!ok) {
                setError(data && data.message ? data.message : 'No se pudo calcular la prenomina');
                return;
            }

            setResultado(data);
            setMensaje(`Prenomina calculada: ${data.empleados} empleado(s), run #${data.runNumero}`);
        } catch (err) {
            console.error('[PrenominaPage]', err);
            setError('Error de conexión con el servidor');
        } finally {
            setLoading(false);
        }
    }

    async function handleConsultar() {
        setError(null);
        setMensaje(null);
        setLoading(true);

        try {
            const { ok, data } = await PayrollApi.getPayroll({ periodo });

            if (!ok) {
                setError(data && data.message ? data.message : 'No hay prenomina para este periodo');
                return;
            }

            setResultado(data);
            setMensaje(`Prenomina encontrada: ${data.empleados} empleado(s), run #${data.runNumero}`);
        } catch (err) {
            console.error('[PrenominaPage]', err);
            setError('Error de conexión con el servidor');
        } finally {
            setLoading(false);
        }
    }

    if (loading && !resultado) {
        return (
            <div className="page-container">
                <h1>Prenomina</h1>
                <p>Cargando...</p>
            </div>
        );
    }

    return (
        <div className="page-container">
            <h1>Prenomina</h1>

            <div className="card">
                <div className="card-body">
                    <div className="form-row">
                        <label className="form-label">Periodo</label>
                        <select
                            className="form-select"
                            value={periodo}
                            onChange={e => setPeriodo(e.target.value)}
                        >
                            {PERIODOS_DEMO.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={handleCalcular} disabled={loading}>
                            Calcular prenomina
                        </button>
                        <button className="btn" onClick={handleConsultar} disabled={loading}>
                            Consultar prenomina
                        </button>
                    </div>

                    {error && <p className="error">{error}</p>}
                    {mensaje && <p className="success">{mensaje}</p>}
                </div>
            </div>

            {resultado && (
                <div className="card mt">
                    <div className="card-body">
                        <h2>Resultados — {resultado.periodo}</h2>
                        <p>
                            Estado: <strong>{resultado.estado}</strong> | Run #{resultado.runNumero} | Moneda: {resultado.moneda}
                        </p>

                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Salario base</th>
                                    <th>Percepciones</th>
                                    <th>Deducciones</th>
                                    <th>Neto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resultado.resultados.map(emp => (
                                    <tr key={emp.empleadoId}>
                                        <td>{emp.codigo} — {emp.nombre}</td>
                                        <td>{formatMoney(emp.salarioBase)}</td>
                                        <td>{formatMoney(emp.percepciones)}</td>
                                        <td>{formatMoney(emp.deducciones)}</td>
                                        <td>{formatMoney(emp.neto)}</td>
                                    </tr>
                                ))}
                                <tr className="totals">
                                    <td colSpan="2">Totales</td>
                                    <td>{formatMoney(resultado.totales.percepciones)}</td>
                                    <td>{formatMoney(resultado.totales.deducciones)}</td>
                                    <td>{formatMoney(resultado.totales.neto)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
