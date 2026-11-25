// =========================================
// Aplicacion - Sistema de Nomina (Vanilla JS)
// =========================================

import { Api } from './api.js';

const STATE = {
    session: null,
    currentPage: 'login'
};

// Elementos DOM
const loginRoot = document.getElementById('login-root');
const appRoot = document.getElementById('app-root');
const topbarUser = document.getElementById('topbar-user');
const mainContent = document.getElementById('main-content');

// =========================================
// Navegacion
// =========================================

function showLogin() {
    loginRoot.style.display = 'flex';
    appRoot.style.display = 'none';
    STATE.currentPage = 'login';
}

function showApp() {
    loginRoot.style.display = 'none';
    appRoot.style.display = 'flex';
    STATE.currentPage = 'app';
    renderDashboard();
}

function navigateTo(page) {
    STATE.currentPage = page;
    renderDashboard();
}

// =========================================
// Autenticacion
// =========================================

async function checkSession() {
    try {
        const { ok, data } = await Api.getSession();
        if (ok && data && data.session) {
            STATE.session = data.session;
            showApp();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('No se pudo verificar la sesion:', error);
        showLogin();
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const userName = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.textContent = '';
    errorEl.style.display = 'none';

    if (!userName || !password) {
        errorEl.textContent = 'Correo y contraseña son obligatorios';
        errorEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    try {
        const { ok, data } = await Api.login(userName, password);

        if (!ok || !data || !data.success) {
            errorEl.textContent = (data && data.message) || 'No se pudo iniciar sesión';
            errorEl.style.display = 'block';
            return;
        }

        STATE.session = data.session;
        topbarUser.textContent = STATE.session.Name || 'Usuario';
        showApp();
    } catch (err) {
        console.error('[Login]', err);
        errorEl.textContent = 'Error de conexión con el servidor';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Ingresar';
    }
}

async function handleLogout() {
    try {
        await Api.logout();
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
    STATE.session = null;
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    showLogin();
}

// =========================================
// Utilidades
// =========================================

function formatMoney(value) {
    return Number(value || 0).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =========================================
// Pantallas
// =========================================

function renderDashboard() {
    if (!STATE.session) return;

    const user = STATE.session;
    const profiles = (user.Profile || []).map(p => p.name).join(', ');

    mainContent.innerHTML = `
        <div class="dashboard">
            <h1>Panel de Nomina</h1>
            <p class="subtitle">Bienvenido, ${escapeHtml(user.Name)}. Perfiles: ${escapeHtml(profiles)}.</p>

            <div class="menu-grid">
                <div class="menu-card" onclick="app.navigate('empleados')">
                    <div class="icon">👥</div>
                    <h3>Empleados</h3>
                    <p>Consultar lista de empleados y sus salarios</p>
                </div>
                <div class="menu-card" onclick="app.navigate('prenomina')">
                    <div class="icon">📊</div>
                    <h3>Prenomina</h3>
                    <p>Calcular y consultar prenominas por periodo</p>
                </div>
                <div class="menu-card" onclick="app.navigate('recibo')">
                    <div class="icon">🧾</div>
                    <h3>Recibo de pago</h3>
                    <p>Ver detalle de recibos por empleado</p>
                </div>
                <div class="menu-card" onclick="app.navigate('horas')">
                    <div class="icon">⏱️</div>
                    <h3>Horas y Bonos</h3>
                    <p>Registrar horas extra y bonos por empleado</p>
                </div>
            </div>
        </div>
    `;
}

async function renderEmpleados() {
    if (!STATE.session) return;

    mainContent.innerHTML = `
        <div class="page-header">
            <h1>Empleados</h1>
            <button class="btn btn-primary" onclick="app.navigate('dashboard')">← Volver</button>
        </div>

        <div id="empleados-loading">Cargando empleados...</div>
        <div id="empleados-error" style="display:none;"></div>
        <table class="table" id="empleados-table" style="display:none;">
            <thead>
                <tr>
                    <th>Codigo</th>
                    <th>Nombre</th>
                    <th>Puesto</th>
                    <th>Departamento</th>
                    <th>Estado</th>
                    <th>Salario base</th>
                </tr>
            </thead>
            <tbody id="empleados-tbody"></tbody>
        </table>
    `;

    try {
        const { ok, data } = await PayrollApi.listEmployees();
        document.getElementById('empleados-loading').style.display = 'none';

        if (!ok || !data) {
            document.getElementById('empleados-error').style.display = 'block';
            document.getElementById('empleados-error').textContent = (data && data.message) || 'No se pudieron cargar los empleados';
            return;
        }

        const tbody = document.getElementById('empleados-tbody');
        const table = document.getElementById('empleados-table');

        if (data.length === 0) {
            table.style.display = 'none';
            document.getElementById('empleados-loading').innerHTML = '<p class="empty">No se encontraron empleados.</p>';
            document.getElementById('empleados-loading').style.display = 'block';
            return;
        }

        data.forEach(emp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(emp.codigo)}</td>
                <td>${escapeHtml(emp.nombre)}</td>
                <td>${escapeHtml(emp.puesto || '—')}</td>
                <td>${escapeHtml(emp.departamento || '—')}</td>
                <td><span class="badge ${emp.estado === 'ACTIVO' ? 'badge-active' : 'badge-inactive'}">${escapeHtml(emp.estado)}</span></td>
                <td>${formatMoney(emp.salarioBase)}</td>
            `;
            tbody.appendChild(tr);
        });

        table.style.display = 'table';
    } catch (err) {
        console.error('[Empleados]', err);
        document.getElementById('empleados-loading').style.display = 'none';
        document.getElementById('empleados-error').style.display = 'block';
        document.getElementById('empleados-error').textContent = 'Error de conexión con el servidor';
    }
}

async function renderPrenomina() {
    if (!STATE.session) return;

    mainContent.innerHTML = `
        <div class="page-header">
            <h1>Prenomina</h1>
            <button class="btn" onclick="app.navigate('dashboard')">← Volver</button>
        </div>

        <div class="form-section">
            <h2>Calcular Prenomina</h2>
            <div class="form-grid">
                <div class="form-field">
                    <label>Periodo</label>
                    <select id="prenomina-periodo">
                        <option value="2026-09">2026-09</option>
                        <option value="2026-10">2026-10</option>
                        <option value="2026-11">2026-11</option>
                        <option value="2026-12">2026-12</option>
                        <option value="2027-01">2027-01</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" id="btn-calcular">Calcular prenomina</button>
                <button class="btn" id="btn-consultar">Consultar prenomina</button>
            </div>
            <div id="prenomina-error" style="display:none;"></div>
            <div id="prenomina-success" style="display:none;"></div>
        </div>

        <div id="prenomina-resultado" style="display:none; margin-top:24px;"></div>
    `;

    const btnCalcular = document.getElementById('btn-calcular');
    const btnConsultar = document.getElementById('btn-consultar');
    const periodoSelect = document.getElementById('prenomina-periodo');
    const errorEl = document.getElementById('prenomina-error');
    const successEl = document.getElementById('prenomina-success');
    const resultadoEl = document.getElementById('prenomina-resultado');

    async function calcular() {
        const periodo = periodoSelect.value;
        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        resultadoEl.style.display = 'none';
        btnCalcular.disabled = true;
        btnCalcular.textContent = 'Calculando...';

        try {
            const { ok, data } = await PayrollApi.calculatePayroll({ periodo });

            if (!ok) {
                errorEl.textContent = (data && data.message) || 'No se pudo calcular la prenomina';
                errorEl.style.display = 'block';
                return;
            }

            successEl.textContent = `Prenomina calculada: ${data.empleados} empleado(s), run #${data.runNumero}`;
            successEl.style.display = 'block';

            renderPrenominaResultado(data);
        } catch (err) {
            console.error('[Prenomina]', err);
            errorEl.textContent = 'Error de conexión con el servidor';
            errorEl.style.display = 'block';
        } finally {
            btnCalcular.disabled = false;
            btnCalcular.textContent = 'Calcular prenomina';
        }
    }

    async function consultar() {
        const periodo = periodoSelect.value;
        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        resultadoEl.style.display = 'none';
        btnConsultar.disabled = true;
        btnConsultar.textContent = 'Consultando...';

        try {
            const { ok, data } = await PayrollApi.getPayroll({ periodo });

            if (!ok) {
                errorEl.textContent = (data && data.message) || 'No hay prenomina para este periodo';
                errorEl.style.display = 'block';
                return;
            }

            renderPrenominaResultado(data);
        } catch (err) {
            console.error('[Prenomina]', err);
            errorEl.textContent = 'Error de conexión con el servidor';
            errorEl.style.display = 'block';
        } finally {
            btnConsultar.disabled = false;
            btnConsultar.textContent = 'Consultar prenomina';
        }
    }

    btnCalcular.onclick = calcular;
    btnConsultar.onclick = consultar;
}

function renderPrenominaResultado(data) {
    const resultadoEl = document.getElementById('prenomina-resultado');
    const rows = data.resultados.map(emp => `
        <tr>
            <td>${escapeHtml(emp.codigo)} — ${escapeHtml(emp.nombre)}</td>
            <td>${formatMoney(emp.salarioBase)}</td>
            <td>${formatMoney(emp.percepciones)}</td>
            <td>${formatMoney(emp.deducciones)}</td>
            <td>${formatMoney(emp.neto)}</td>
        </tr>
    `).join('');

    const totalRow = `
        <tr style="font-weight:700; background:#f3f4f6;">
            <td colSpan="2">Totales</td>
            <td>${formatMoney(data.totales.percepciones)}</td>
            <td>${formatMoney(data.totales.deducciones)}</td>
            <td>${formatMoney(data.totales.neto)}</td>
        </tr>
    `;

    resultadoEl.innerHTML = `
        <div class="table-wrap">
            <table class="table">
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
                    ${rows}
                    ${totalRow}
                </tbody>
            </table>
        </div>
        <p><strong>Periodo:</strong> ${escapeHtml(data.periodo)} | <strong>Run #:</strong> ${data.runNumero} | <strong>Estado:</strong> ${escapeHtml(data.estado)}</p>
    `;
    resultadoEl.style.display = 'block';
}

async function renderRecibo() {
    if (!STATE.session) return;

    mainContent.innerHTML = `
        <div class="page-header">
            <h1>Recibo de Pago</h1>
            <button class="btn" onclick="app.navigate('dashboard')">← Volver</button>
        </div>

        <div class="form-section">
            <h2>Consultar Recibo</h2>
            <div class="form-grid">
                <div class="form-field">
                    <label>Periodo</label>
                    <select id="recibo-periodo">
                        <option value="2026-09">2026-09</option>
                        <option value="2026-10">2026-10</option>
                        <option value="2026-11">2026-11</option>
                        <option value="2026-12">2026-12</option>
                        <option value="2027-01">2027-01</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>ID Empleado</label>
                    <input type="number" id="recibo-empleado" placeholder="Ej: 1" min="1">
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" id="btn-ver-recibo">Ver recibo</button>
            </div>
            <div id="recibo-error" style="display:none;"></div>
        </div>

        <div id="recibo-resultado" style="display:none; margin-top:24px;"></div>
    `;

    const btnVer = document.getElementById('btn-ver-recibo');
    const errorEl = document.getElementById('recibo-error');
    const resultadoEl = document.getElementById('recibo-resultado');

    btnVer.onclick = async () => {
        const periodo = document.getElementById('recibo-periodo').value;
        const empleadoId = Number(document.getElementById('recibo-empleado').value);

        errorEl.style.display = 'none';
        resultadoEl.style.display = 'none';
        btnVer.disabled = true;
        btnVer.textContent = 'Cargando...';

        try {
            const { ok, data } = await PayrollApi.getPayroll({ periodo });

            if (!ok) {
                errorEl.textContent = (data && data.message) || 'No hay prenomina para este periodo';
                errorEl.style.display = 'block';
                return;
            }

            const emp = data.resultados.find(r => r.empleadoId === empleadoId);
            if (!emp) {
                errorEl.textContent = 'No se encontro el empleado en esta prenomina.';
                errorEl.style.display = 'block';
                return;
            }

            const lineasHtml = (emp.lineas || []).map(linea => `
                <tr>
                    <td>${escapeHtml(linea.concepto)}</td>
                    <td><span class="badge ${linea.tipo === 'PERCEPCION' ? 'badge-active' : 'badge-inactive'}">${linea.tipo === 'PERCEPCION' ? 'Percepcion' : 'Deduccion'}</span></td>
                    <td>${linea.cantidad}</td>
                    <td>${formatMoney(linea.tarifa)}</td>
                    <td>${formatMoney(linea.importe)}</td>
                </tr>
            `).join('');

            resultadoEl.innerHTML = `
                <div class="recibo">
                    <div class="recibo-header">
                        <h2>Recibo de Pago</h2>
                        <div class="recibo-meta">
                            <p><strong>Periodo:</strong> ${escapeHtml(data.periodo)}</p>
                            <p><strong>Empleado:</strong> ${escapeHtml(emp.codigo)} — ${escapeHtml(emp.nombre)}</p>
                        </div>
                    </div>
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th>Tipo</th>
                                <th>Cantidad</th>
                                <th>Tarifa</th>
                                <th>Importe</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lineasHtml}
                            <tr class="totals">
                                <td colSpan="3" style="text-align:right"><strong>Neto a pagar</strong></td>
                                <td colSpan="2">${formatMoney(emp.neto)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="recibo-resumen">
                        <p><strong>Salario base:</strong> ${formatMoney(emp.salarioBase)}</p>
                        <p><strong>Percepciones:</strong> ${formatMoney(emp.percepciones)}</p>
                        <p><strong>Deducciones:</strong> ${formatMoney(emp.deducciones)}</p>
                        <p><strong>Neto:</strong> ${formatMoney(emp.neto)}</p>
                    </div>
                </div>
            `;
            resultadoEl.style.display = 'block';
        } catch (err) {
            console.error('[Recibo]', err);
            errorEl.textContent = 'Error de conexión con el servidor';
            errorEl.style.display = 'block';
        } finally {
            btnVer.disabled = false;
            btnVer.textContent = 'Ver recibo';
        }
    };
}

async function renderHorasBonos() {
    if (!STATE.session) return;

    mainContent.innerHTML = `
        <div class="page-header">
            <h1>Horas y Bonos</h1>
            <button class="btn" onclick="app.navigate('dashboard')">← Volver</button>
        </div>

        <div class="form-section">
            <h2>Registrar Bono</h2>
            <div class="form-grid">
                <div class="form-field">
                    <label>ID Empleado</label>
                    <input type="number" id="bono-empleado" placeholder="Ej: 1" min="1">
                </div>
                <div class="form-field">
                    <label>Periodo</label>
                    <select id="bono-periodo">
                        <option value="2026-09">2026-09</option>
                        <option value="2026-10">2026-10</option>
                        <option value="2026-11">2026-11</option>
                        <option value="2026-12">2026-12</option>
                        <option value="2027-01">2027-01</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Concepto ID</label>
                    <input type="number" id="bono-concepto" placeholder="Ej: 2" min="1">
                </div>
                <div class="form-field">
                    <label>Monto</label>
                    <input type="number" id="bono-monto" placeholder="Ej: 1500" min="0" step="0.01">
                </div>
                <div class="form-field">
                    <label>Motivo</label>
                    <input type="text" id="bono-motivo" placeholder="Bono de productividad">
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" id="btn-crear-bono">Crear bono</button>
            </div>
            <div id="bono-error" style="display:none;"></div>
            <div id="bono-success" style="display:none;"></div>
        </div>

        <div class="form-section" style="margin-top:24px;">
            <h2>Registrar Horas Extra</h2>
            <div class="form-grid">
                <div class="form-field">
                    <label>ID Empleado</label>
                    <input type="number" id="hora-empleado" placeholder="Ej: 1" min="1">
                </div>
                <div class="form-field">
                    <label>Periodo</label>
                    <select id="hora-periodo">
                        <option value="2026-09">2026-09</option>
                        <option value="2026-10">2026-10</option>
                        <option value="2026-11">2026-11</option>
                        <option value="2026-12">2026-12</option>
                        <option value="2027-01">2027-01</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Fecha</label>
                    <input type="date" id="hora-fecha">
                </div>
                <div class="form-field">
                    <label>Horas</label>
                    <input type="number" id="hora-horas" placeholder="Ej: 6" min="0" max="24" step="0.5">
                </div>
                <div class="form-field">
                    <label>Tarifa Hora</label>
                    <input type="number" id="hora-tarifa" placeholder="Ej: 120" min="0" step="0.01">
                </div>
                <div class="form-field">
                    <label>Factor</label>
                    <input type="number" id="hora-factor" value="1.5" min="0" step="0.01">
                </div>
                <div class="form-field">
                    <label>Concepto ID</label>
                    <input type="number" id="hora-concepto" placeholder="Ej: 3" min="1">
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" id="btn-crear-hora">Registrar horas extra</button>
            </div>
            <div id="hora-error" style="display:none;"></div>
            <div id="hora-success" style="display:none;"></div>
        </div>
    `;

    // Bono
    const btnBono = document.getElementById('btn-crear-bono');
    const bonoError = document.getElementById('bono-error');
    const bonoSuccess = document.getElementById('bono-success');

    btnBono.onclick = async () => {
        const empleadoId = Number(document.getElementById('bono-empleado').value);
        const periodo = document.getElementById('bono-periodo').value;
        const conceptoId = Number(document.getElementById('bono-concepto').value);
        const monto = Number(document.getElementById('bono-monto').value);
        const motivo = document.getElementById('bono-motivo').value;

        bonoError.style.display = 'none';
        bonoSuccess.style.display = 'none';
        btnBono.disabled = true;
        btnBono.textContent = 'Creando...';

        try {
            const { ok, data } = await PayrollApi.createBonus({
                empleadoId, periodo, conceptoId, monto, motivo, creadoPor: STATE.session.UserID
            });

            if (!ok) {
                bonoError.textContent = (data && data.message) || 'No se pudo crear el bono';
                bonoError.style.display = 'block';
                return;
            }

            bonoSuccess.textContent = 'Bono creado correctamente (estado: PENDIENTE). Apruebalo desde el backend para que se refleje en la nomina.';
            bonoSuccess.style.display = 'block';
        } catch (err) {
            console.error('[Bono]', err);
            bonoError.textContent = 'Error de conexión con el servidor';
            bonoError.style.display = 'block';
        } finally {
            btnBono.disabled = false;
            btnBono.textContent = 'Crear bono';
        }
    };

    // Horas extra
    const btnHora = document.getElementById('btn-crear-hora');
    const horaError = document.getElementById('hora-error');
    const horaSuccess = document.getElementById('hora-success');

    btnHora.onclick = async () => {
        const empleadoId = Number(document.getElementById('hora-empleado').value);
        const periodo = document.getElementById('hora-periodo').value;
        const fecha = document.getElementById('hora-fecha').value;
        const horas = Number(document.getElementById('hora-horas').value);
        const tarifa = Number(document.getElementById('hora-tarifa').value);
        const factor = Number(document.getElementById('hora-factor').value);
        const conceptoId = Number(document.getElementById('hora-concepto').value);

        horaError.style.display = 'none';
        horaSuccess.style.display = 'none';
        btnHora.disabled = true;
        btnHora.textContent = 'Registrando...';

        try {
            const { ok, data } = await PayrollApi.createOvertime({
                empleadoId, periodo, fecha, horas, tarifaHora: tarifa, factor, conceptoId, creadoPor: STATE.session.UserID
            });

            if (!ok) {
                horaError.textContent = (data && data.message) || 'No se pudieron registrar las horas';
                horaError.style.display = 'block';
                return;
            }

            horaSuccess.textContent = 'Horas extra registradas correctamente (estado: PENDIENTE).';
            horaSuccess.style.display = 'block';
        } catch (err) {
            console.error('[Horas]', err);
            horaError.textContent = 'Error de conexión con el servidor';
            horaError.style.display = 'block';
        } finally {
            btnHora.disabled = false;
            btnHora.textContent = 'Registrar horas extra';
        }
    };
}

// =========================================
// Router de pantallas
// =========================================

async function renderCurrentPage() {
    switch (STATE.currentPage) {
        case 'empleados':
            await renderEmpleados();
            break;
        case 'prenomina':
            await renderPrenomina();
            break;
        case 'recibo':
            await renderRecibo();
            break;
        case 'horas':
            await renderHorasBonos();
            break;
        default:
            renderDashboard();
            break;
    }
}

// =========================================
// Inicializacion
// =========================================

window.app = {
    navigate: (page) => {
        navigateTo(page);
    }
};

document.getElementById('login-form').addEventListener('submit', handleLogin);
document.getElementById('btn-logout').addEventListener('click', handleLogout);

// Verificar sesion al cargar
checkSession();
