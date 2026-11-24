import { useEffect, useState } from 'react';

import { PayrollApi } from '../api/payroll.js';

export default function EmpleadosPage() {
    const [empleados, setEmpleados] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let active = true;

        PayrollApi.listEmployees()
            .then(({ ok, data }) => {
                if (!active) return;
                if (ok && data) {
                    setEmpleados(Array.isArray(data) ? data : []);
                } else {
                    setError(data && data.message ? data.message : 'No se pudieron cargar los empleados');
                }
            })
            .catch(() => {
                if (!active) return;
                setError('Error de conexión con el servidor');
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    if (loading) {
        return (
            <div className="page-container">
                <h1>Empleados</h1>
                <p>Cargando empleados...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-container">
                <h1>Empleados</h1>
                <p className="error">{error}</p>
                <button className="btn" onClick={() => window.location.reload()}>
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="page-container">
            <h1>Empleados</h1>
            <table className="table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Puesto</th>
                        <th>Departamento</th>
                        <th>Estado</th>
                        <th>Salario base</th>
                    </tr>
                </thead>
                <tbody>
                    {empleados.map(emp => (
                        <tr key={emp.id}>
                            <td>{emp.codigo}</td>
                            <td>{emp.nombre}</td>
                            <td>{emp.puesto || '—'}</td>
                            <td>{emp.departamento || '—'}</td>
                            <td>
                                <span className={`badge ${emp.estado === 'ACTIVO' ? 'badge-active' : 'badge-inactive'}`}>
                                    {emp.estado}
                                </span>
                            </td>
                            <td>${Number(emp.salarioBase || 0).toLocaleString('es-MX', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}</td>
                        </tr>
                    ))}
                    {empleados.length === 0 && (
                        <tr>
                            <td colSpan="6" className="empty">
                                No se encontraron empleados.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
