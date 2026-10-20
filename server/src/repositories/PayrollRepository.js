'use strict';

const pool = require('../../config/database');
const {
    AppError,
    DatabaseError,
    NotFoundError,
    ConflictError
} = require('../errors/AppError');

function toNumber(value) {
    if (value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function sum(values) {
    return values.reduce((total, value) => total + Number(value || 0), 0);
}

function toIso(value) {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Acceso a datos del modelo de nomina definido en database/payroll.sql.
 *
 * Todos los metodos usan consultas parametrizadas. Las operaciones que
 * modifican varias tablas se ejecutan dentro de una transaccion con bloqueo
 * del periodo para evitar calculos o cierres concurrentes.
 */
class PayrollRepository {
    constructor({ db = pool } = {}) {
        this.db = db;
    }

    async _query(sql, params = []) {
        try {
            return await this.db.query(sql, params);
        } catch (error) {
            throw new DatabaseError(error);
        }
    }

    async _withTransaction(callback) {
        let client;

        try {
            client = await this.db.connect();
        } catch (error) {
            throw new DatabaseError(error);
        }

        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                // La transaccion pudo no haber iniciado.
            }

            if (error instanceof AppError) {
                throw error;
            }
            throw new DatabaseError(error);
        } finally {
            client.release();
        }
    }

    async getPeriodByCode(code) {
        const result = await this._query(
            `SELECT id,
                    code,
                    period_type,
                    TO_CHAR(start_date, 'YYYY-MM-DD')   AS start_date,
                    TO_CHAR(end_date, 'YYYY-MM-DD')     AS end_date,
                    TO_CHAR(payment_date, 'YYYY-MM-DD') AS payment_date,
                    status
             FROM pay_periods
             WHERE code = $1`,
            [code]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: row.id,
            code: row.code,
            periodType: row.period_type,
            startDate: row.start_date,
            endDate: row.end_date,
            paymentDate: row.payment_date,
            status: row.status
        };
    }

    async getEmployees({ employeeIds = null, status = null, limit = 200 } = {}) {
        if (Array.isArray(employeeIds) && employeeIds.length === 0) {
            return [];
        }

        const conditions = [];
        const params = [];

        if (Array.isArray(employeeIds)) {
            params.push(employeeIds);
            conditions.push(`e.id = ANY($${params.length}::int[])`);
        }

        if (status) {
            params.push(status);
            conditions.push(`e.status = $${params.length}`);
        }

        const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
        params.push(safeLimit);

        const where = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        const result = await this._query(
            `SELECT e.id,
                    e.employee_code,
                    e.position,
                    e.department,
                    TO_CHAR(e.hire_date, 'YYYY-MM-DD') AS hire_date,
                    e.status,
                    p.name,
                    p.email
             FROM employees e
             INNER JOIN person p ON p.id = e.person_id
             ${where}
             ORDER BY e.employee_code
             LIMIT $${params.length}`,
            params
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeCode: row.employee_code,
            position: row.position,
            department: row.department,
            hireDate: row.hire_date,
            status: row.status,
            name: row.name,
            email: row.email
        }));
    }

    async getEmployeeById(employeeId) {
        const employees = await this.getEmployees({
            employeeIds: [employeeId],
            status: null,
            limit: 1
        });
        return employees[0] || null;
    }

    async getSalary(employeeId) {
        const result = await this._query(
            `SELECT e.id,
                    e.employee_code,
                    p.name,
                    e.status,
                    latest.amount,
                    latest.effective_from,
                    pc.code AS concept_code,
                    pc.name AS concept_name
             FROM employees e
             INNER JOIN person p ON p.id = e.person_id
             LEFT JOIN LATERAL (
                 SELECT ec.amount,
                        ec.concept_id,
                        TO_CHAR(ec.effective_from, 'YYYY-MM-DD') AS effective_from
                 FROM employee_compensations ec
                 INNER JOIN payroll_concepts c2
                     ON c2.id = ec.concept_id
                    AND c2.code = 'SALARIO_BASE'
                    AND c2.active = TRUE
                 WHERE ec.employee_id = e.id
                   AND ec.status = 'ACTIVA'
                   AND ec.effective_from <= CURRENT_DATE
                   AND (ec.effective_to IS NULL OR ec.effective_to >= CURRENT_DATE)
                 ORDER BY ec.effective_from DESC, ec.id DESC
                 LIMIT 1
             ) latest ON TRUE
             LEFT JOIN payroll_concepts pc ON pc.id = latest.concept_id
             WHERE e.id = $1`,
            [employeeId]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: row.id,
            employeeCode: row.employee_code,
            name: row.name,
            status: row.status,
            amount: toNumber(row.amount),
            effectiveFrom: row.effective_from,
            conceptCode: row.concept_code,
            conceptName: row.concept_name
        };
    }

    async listBonuses({ empleadoId = null, periodo = null } = {}) {
        const result = await this._query(
            `SELECT b.id,
                    b.employee_id,
                    e.employee_code,
                    p.name AS employee_name,
                    pp.code AS period_code,
                    pc.code AS concept_code,
                    pc.name AS concept_name,
                    b.amount,
                    b.reason,
                    b.status
             FROM bonus_entries b
             INNER JOIN employees e ON e.id = b.employee_id
             INNER JOIN person p ON p.id = e.person_id
             INNER JOIN payroll_concepts pc ON pc.id = b.concept_id
             INNER JOIN pay_periods pp ON pp.id = b.period_id
             WHERE ($1::int IS NULL OR b.employee_id = $1)
               AND ($2::text IS NULL OR pp.code = $2)
             ORDER BY b.id DESC
             LIMIT 200`,
            [empleadoId, periodo]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            employeeCode: row.employee_code,
            employeeName: row.employee_name,
            periodCode: row.period_code,
            conceptCode: row.concept_code,
            conceptName: row.concept_name,
            amount: toNumber(row.amount),
            reason: row.reason,
            status: row.status
        }));
    }

    async listOvertime({ empleadoId = null, periodo = null } = {}) {
        const result = await this._query(
            `SELECT o.id,
                    o.employee_id,
                    e.employee_code,
                    p.name AS employee_name,
                    pp.code AS period_code,
                    pc.code AS concept_code,
                    pc.name AS concept_name,
                    TO_CHAR(o.work_date, 'YYYY-MM-DD') AS work_date,
                    o.hours,
                    o.rate_multiplier,
                    o.hourly_rate,
                    o.amount,
                    o.status
             FROM overtime_entries o
             INNER JOIN employees e ON e.id = o.employee_id
             INNER JOIN person p ON p.id = e.person_id
             INNER JOIN payroll_concepts pc ON pc.id = o.concept_id
             INNER JOIN pay_periods pp ON pp.id = o.period_id
             WHERE ($1::int IS NULL OR o.employee_id = $1)
               AND ($2::text IS NULL OR pp.code = $2)
             ORDER BY o.work_date DESC, o.id DESC
             LIMIT 200`,
            [empleadoId, periodo]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            employeeCode: row.employee_code,
            employeeName: row.employee_name,
            periodCode: row.period_code,
            conceptCode: row.concept_code,
            conceptName: row.concept_name,
            workDate: row.work_date,
            hours: toNumber(row.hours),
            rateMultiplier: toNumber(row.rate_multiplier),
            hourlyRate: toNumber(row.hourly_rate),
            amount: toNumber(row.amount),
            status: row.status
        }));
    }

    async listLoans({ empleadoId = null } = {}) {
        const result = await this._query(
            `SELECT l.id,
                    l.employee_id,
                    e.employee_code,
                    p.name AS employee_name,
                    l.principal,
                    l.balance,
                    l.installment_amount,
                    l.status,
                    spp.code AS start_period_code,
                    COALESCE(
                        JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'periodo', pp.code,
                                'numero', li.installment_number,
                                'monto', li.amount,
                                'estado', li.status
                            )
                            ORDER BY pp.code
                        ) FILTER (WHERE li.id IS NOT NULL),
                        '[]'::json
                    ) AS installments
             FROM employee_loans l
             INNER JOIN employees e ON e.id = l.employee_id
             INNER JOIN person p ON p.id = e.person_id
             LEFT JOIN pay_periods spp ON spp.id = l.start_period_id
             LEFT JOIN loan_installments li ON li.loan_id = l.id
             LEFT JOIN pay_periods pp ON pp.id = li.period_id
             WHERE ($1::int IS NULL OR l.employee_id = $1)
             GROUP BY l.id, e.employee_code, p.name, spp.code
             ORDER BY l.id`,
            [empleadoId]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            employeeCode: row.employee_code,
            employeeName: row.employee_name,
            principal: toNumber(row.principal),
            balance: toNumber(row.balance),
            installmentAmount: toNumber(row.installment_amount),
            status: row.status,
            startPeriodCode: row.start_period_code,
            installments: (row.installments || []).map(item => ({
                ...item,
                monto: toNumber(item.monto)
            }))
        }));
    }

    async getBaseSalaries(employeeIds, referenceDate) {
        const result = await this._query(
            `SELECT DISTINCT ON (ec.employee_id)
                    ec.id,
                    ec.employee_id,
                    ec.amount,
                    ec.concept_id,
                    pc.code AS concept_code,
                    pc.name AS concept_name
             FROM employee_compensations ec
             INNER JOIN payroll_concepts pc
                 ON pc.id = ec.concept_id
                AND pc.code = 'SALARIO_BASE'
                AND pc.active = TRUE
             WHERE ec.employee_id = ANY($1::int[])
               AND ec.status = 'ACTIVA'
               AND ec.effective_from <= $2::date
               AND (ec.effective_to IS NULL OR ec.effective_to >= $2::date)
             ORDER BY ec.employee_id, ec.effective_from DESC, ec.id DESC`,
            [employeeIds, referenceDate]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            amount: toNumber(row.amount),
            conceptId: row.concept_id,
            conceptCode: row.concept_code,
            conceptName: row.concept_name
        }));
    }

    async getRecurringPerceptions(periodId, employeeIds) {
        const result = await this._query(
            `SELECT ec.id,
                    ec.employee_id,
                    ec.amount,
                    ec.concept_id,
                    pc.code AS concept_code,
                    pc.name AS concept_name
             FROM employee_compensations ec
             INNER JOIN payroll_concepts pc
                 ON pc.id = ec.concept_id
                AND pc.active = TRUE
                AND pc.concept_type = 'PERCEPCION'
                AND pc.code <> 'SALARIO_BASE'
             INNER JOIN pay_periods pp ON pp.id = $1
             WHERE ec.employee_id = ANY($2::int[])
               AND ec.status = 'ACTIVA'
               AND ec.effective_from <= pp.end_date
               AND (ec.effective_to IS NULL OR ec.effective_to >= pp.start_date)
             ORDER BY ec.employee_id, ec.id`,
            [periodId, employeeIds]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            amount: toNumber(row.amount),
            conceptId: row.concept_id,
            conceptCode: row.concept_code,
            conceptName: row.concept_name
        }));
    }

    async getRecurringDeductions(periodId, employeeIds) {
        const result = await this._query(
            `SELECT d.id,
                    d.employee_id,
                    d.amount,
                    d.concept_id,
                    pc.code AS concept_code,
                    pc.name AS concept_name
             FROM employee_deductions d
             INNER JOIN payroll_concepts pc
                 ON pc.id = d.concept_id
                AND pc.active = TRUE
                AND pc.concept_type <> 'PERCEPCION'
             INNER JOIN pay_periods pp ON pp.id = $1
             WHERE d.employee_id = ANY($2::int[])
               AND d.status = 'ACTIVA'
               AND d.start_date <= pp.end_date
               AND (d.end_date IS NULL OR d.end_date >= pp.start_date)
             ORDER BY d.employee_id, d.id`,
            [periodId, employeeIds]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            amount: toNumber(row.amount),
            conceptId: row.concept_id,
            conceptCode: row.concept_code,
            conceptName: row.concept_name
        }));
    }

    async getApprovedBonuses(periodId, employeeIds) {
        const result = await this._query(
            `SELECT b.id,
                    b.employee_id,
                    b.amount,
                    b.concept_id,
                    pc.code AS concept_code,
                    pc.name AS concept_name
             FROM bonus_entries b
             INNER JOIN payroll_concepts pc ON pc.id = b.concept_id
             WHERE b.period_id = $1
               AND b.status = 'APROBADO'
               AND b.employee_id = ANY($2::int[])
             ORDER BY b.employee_id, b.id`,
            [periodId, employeeIds]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            amount: toNumber(row.amount),
            conceptId: row.concept_id,
            conceptCode: row.concept_code,
            conceptName: row.concept_name
        }));
    }

    async getApprovedOvertime(periodId, employeeIds) {
        const result = await this._query(
            `SELECT o.id,
                    o.employee_id,
                    o.amount,
                    o.concept_id,
                    pc.code AS concept_code,
                    pc.name AS concept_name,
                    o.hours,
                    o.rate_multiplier,
                    o.hourly_rate
             FROM overtime_entries o
             INNER JOIN payroll_concepts pc ON pc.id = o.concept_id
             WHERE o.period_id = $1
               AND o.status = 'APROBADO'
               AND o.employee_id = ANY($2::int[])
             ORDER BY o.employee_id, o.id`,
            [periodId, employeeIds]
        );

        return result.rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            amount: toNumber(row.amount),
            conceptId: row.concept_id,
            conceptCode: row.concept_code,
            conceptName: row.concept_name,
            hours: toNumber(row.hours),
            rateMultiplier: toNumber(row.rate_multiplier),
            hourlyRate: toNumber(row.hourly_rate)
        }));
    }

    async getScheduledLoanInstallments(periodId, employeeIds) {
        const result = await this._query(
            `SELECT li.id,
                    li.loan_id,
                    li.amount,
                    l.employee_id,
                    l.concept_id,
                    pc.code AS concept_code,
                    pc.name AS concept_name
             FROM loan_installments li
             INNER JOIN employee_loans l
                 ON l.id = li.loan_id
                AND l.status = 'ACTIVO'
             INNER JOIN payroll_concepts pc ON pc.id = l.concept_id
             WHERE li.period_id = $1
               AND li.status = 'PROGRAMADA'
               AND l.employee_id = ANY($2::int[])
             ORDER BY l.employee_id, li.id`,
            [periodId, employeeIds]
        );

        return result.rows.map(row => ({
            id: row.id,
            loanId: row.loan_id,
            employeeId: row.employee_id,
            amount: toNumber(row.amount),
            conceptId: row.concept_id,
            conceptCode: row.concept_code,
            conceptName: row.concept_name
        }));
    }

    async savePrenomina({ periodCode, userId = null, results, totals }) {
        return this._withTransaction(async client => {
            const periodResult = await client.query(
                `SELECT id, code, status
                 FROM pay_periods
                 WHERE code = $1
                 FOR UPDATE`,
                [periodCode]
            );

            const period = periodResult.rows[0];
            if (!period) {
                throw new NotFoundError('Periodo no encontrado.');
            }
            if (period.status === 'CERRADO') {
                throw new ConflictError(
                    'La nomina definitiva de este periodo ya esta cerrada; no se puede recalcular.'
                );
            }
            if (period.status === 'CANCELADO') {
                throw new ConflictError('El periodo indicado esta cancelado.');
            }

            const existingResult = await client.query(
                `SELECT id, status, run_number
                 FROM payroll_runs
                 WHERE period_id = $1
                   AND run_type = 'PRENOMINA'
                   AND status <> 'CANCELADA'
                 ORDER BY id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [period.id]
            );

            const existing = existingResult.rows[0];
            if (existing && existing.status === 'CERRADA') {
                throw new ConflictError(
                    'La nomina definitiva de este periodo ya esta cerrada; no se puede recalcular.'
                );
            }

            let runResult;
            const recalculated = Boolean(existing);

            if (existing) {
                runResult = await client.query(
                    `UPDATE payroll_runs
                     SET status = 'CALCULADA',
                         calculated_by = $2::int,
                         calculated_at = CURRENT_TIMESTAMP,
                         total_earnings = $3,
                         total_deductions = $4,
                         total_net = $5
                     WHERE id = $1
                     RETURNING id, run_number, calculated_at`,
                    [
                        existing.id,
                        userId,
                        totals.percepciones,
                        totals.deducciones,
                        totals.neto
                    ]
                );
            } else {
                const numberResult = await client.query(
                    `SELECT COALESCE(MAX(run_number), 0) + 1 AS next_number
                     FROM payroll_runs
                     WHERE period_id = $1`,
                    [period.id]
                );

                runResult = await client.query(
                    `INSERT INTO payroll_runs
                         (period_id, run_number, run_type, status, calculated_by,
                          calculated_at, total_earnings, total_deductions, total_net)
                     VALUES ($1, $2, 'PRENOMINA', 'CALCULADA', $3::int,
                             CURRENT_TIMESTAMP, $4, $5, $6)
                     RETURNING id, run_number, calculated_at`,
                    [
                        period.id,
                        numberResult.rows[0].next_number,
                        userId,
                        totals.percepciones,
                        totals.deducciones,
                        totals.neto
                    ]
                );
            }

            const run = runResult.rows[0];

            // Cada recalculo reemplaza el snapshot anterior; no duplica filas.
            await client.query('DELETE FROM payroll_results WHERE run_id = $1', [run.id]);

            for (const employeeResult of results) {
                const resultInsert = await client.query(
                    `INSERT INTO payroll_results
                         (run_id, employee_id, base_salary, total_earnings,
                          total_deductions, net_amount, status)
                     VALUES ($1, $2, $3, $4, $5, $6, 'CALCULADO')
                     RETURNING id`,
                    [
                        run.id,
                        employeeResult.employee.id,
                        employeeResult.baseSalary,
                        employeeResult.totalEarnings,
                        employeeResult.totalDeductions,
                        employeeResult.netAmount
                    ]
                );

                const payrollResultId = resultInsert.rows[0].id;

                for (const line of employeeResult.lines) {
                    await client.query(
                        `INSERT INTO payroll_lines
                             (result_id, concept_id, line_type, quantity, rate,
                              amount, source_type, source_id)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            payrollResultId,
                            line.conceptId,
                            line.lineType,
                            line.quantity,
                            line.rate,
                            line.amount,
                            line.sourceType,
                            line.sourceId
                        ]
                    );
                }
            }

            await client.query(
                `UPDATE pay_periods
                 SET status = 'CALCULADO'
                 WHERE id = $1
                   AND status = 'ABIERTO'`,
                [period.id]
            );

            return {
                runId: run.id,
                runNumber: run.run_number,
                recalculated,
                calculatedAt: toIso(run.calculated_at)
            };
        });
    }

    async _getPeriodWithRun(periodCode) {
        const result = await this._query(
            `SELECT p.id AS period_id,
                    p.code,
                    p.period_type,
                    TO_CHAR(p.start_date, 'YYYY-MM-DD') AS start_date,
                    TO_CHAR(p.end_date, 'YYYY-MM-DD') AS end_date,
                    TO_CHAR(p.payment_date, 'YYYY-MM-DD') AS payment_date,
                    p.status AS period_status,
                    r.id AS run_id,
                    r.run_number,
                    r.run_type,
                    r.status AS run_status,
                    r.calculated_at,
                    r.closed_at,
                    r.closed_by,
                    r.total_earnings,
                    r.total_deductions,
                    r.total_net
             FROM pay_periods p
             LEFT JOIN LATERAL (
                 SELECT r2.*
                 FROM payroll_runs r2
                 WHERE r2.period_id = p.id
                   AND r2.status <> 'CANCELADA'
                 ORDER BY r2.id DESC
                 LIMIT 1
             ) r ON TRUE
             WHERE p.code = $1`,
            [periodCode]
        );

        const row = result.rows[0];
        if (!row) {
            throw new NotFoundError('Periodo no encontrado.');
        }
        return row;
    }

    async getPrenomina(periodCode) {
        const period = await this._getPeriodWithRun(periodCode);

        if (!period.run_id) {
            throw new NotFoundError(
                'No hay una prenomina calculada para el periodo indicado.'
            );
        }

        const resultsQuery = await this._query(
            `SELECT pr.id,
                    pr.employee_id,
                    e.employee_code,
                    p.name AS employee_name,
                    pr.base_salary,
                    pr.total_earnings,
                    pr.total_deductions,
                    pr.net_amount
             FROM payroll_results pr
             INNER JOIN employees e ON e.id = pr.employee_id
             INNER JOIN person p ON p.id = e.person_id
             WHERE pr.run_id = $1
             ORDER BY e.employee_code`,
            [period.run_id]
        );

        const resultIds = resultsQuery.rows.map(row => row.id);
        let linesRows = [];

        if (resultIds.length > 0) {
            const linesQuery = await this._query(
                `SELECT pl.id,
                        pl.result_id,
                        pl.concept_id,
                        pc.code AS concept_code,
                        pc.name AS concept_name,
                        pl.line_type,
                        pl.quantity,
                        pl.rate,
                        pl.amount,
                        pl.source_type,
                        pl.source_id
                 FROM payroll_lines pl
                 INNER JOIN payroll_concepts pc ON pc.id = pl.concept_id
                 WHERE pl.result_id = ANY($1::int[])
                 ORDER BY pl.id`,
                [resultIds]
            );
            linesRows = linesQuery.rows;
        }

        const linesByResult = new Map();
        for (const line of linesRows) {
            if (!linesByResult.has(line.result_id)) {
                linesByResult.set(line.result_id, []);
            }
            linesByResult.get(line.result_id).push({
                id: line.id,
                conceptoId: line.concept_id,
                codigoConcepto: line.concept_code,
                concepto: line.concept_name,
                tipo: line.line_type,
                cantidad: toNumber(line.quantity),
                tarifa: toNumber(line.rate),
                importe: toNumber(line.amount),
                origenTipo: line.source_type,
                origenId: line.source_id
            });
        }

        const resultados = resultsQuery.rows.map(row => ({
            empleadoId: row.employee_id,
            codigo: row.employee_code,
            nombre: row.employee_name,
            salarioBase: toNumber(row.base_salary),
            percepciones: toNumber(row.total_earnings),
            deducciones: toNumber(row.total_deductions),
            neto: toNumber(row.net_amount),
            lineas: linesByResult.get(row.id) || []
        }));

        const salarioBase = round2(sum(resultados.map(row => row.salarioBase)));
        const bonos = round2(sum(
            resultados.flatMap(row => row.lineas)
                .filter(line => line.codigoConcepto === 'BONO')
                .map(line => line.importe)
        ));
        const horasExtras = round2(sum(
            resultados.flatMap(row => row.lineas)
                .filter(line => line.codigoConcepto === 'HORAS_EXTRA')
                .map(line => line.importe)
        ));
        const percepciones = toNumber(period.total_earnings) ?? 0;
        const deducciones = toNumber(period.total_deductions) ?? 0;
        const neto = toNumber(period.total_net) ?? 0;

        const totales = {
            salarioBase,
            bonos,
            horasExtras,
            otrasPercepciones: round2(percepciones - salarioBase - bonos - horasExtras),
            percepciones,
            bruto: percepciones,
            deducciones,
            neto
        };

        const resumen = resultados.map(row => ({
            empleadoId: row.empleadoId,
            codigo: row.codigo,
            nombre: row.nombre,
            salarioBase: row.salarioBase,
            bonos: round2(sum(row.lineas.filter(line => line.codigoConcepto === 'BONO').map(line => line.importe))),
            horasExtras: round2(sum(row.lineas.filter(line => line.codigoConcepto === 'HORAS_EXTRA').map(line => line.importe))),
            bruto: row.percepciones,
            deducciones: row.deducciones,
            neto: row.neto
        }));

        return {
            periodo: period.code,
            periodoInfo: {
                codigo: period.code,
                tipo: period.period_type,
                inicio: period.start_date,
                fin: period.end_date,
                fechaPago: period.payment_date,
                estado: period.period_status
            },
            moneda: 'MXN',
            run: {
                id: period.run_id,
                numero: period.run_number,
                tipo: period.run_type,
                estado: period.run_status,
                calculadaEn: toIso(period.calculated_at),
                cerradaEn: toIso(period.closed_at)
            },
            resultados,
            lineas: resumen,
            totales
        };
    }

    async getNominaStatus(periodCode) {
        const period = await this._getPeriodWithRun(periodCode);

        if (!period.run_id) {
            const closed = period.period_status === 'CERRADO';
            const cancelled = period.period_status === 'CANCELADO';

            return {
                periodo: period.code,
                periodoInfo: {
                    codigo: period.code,
                    tipo: period.period_type,
                    inicio: period.start_date,
                    fin: period.end_date,
                    fechaPago: period.payment_date,
                    estado: period.period_status
                },
                estado: cancelled ? 'CANCELADA' : (closed ? 'CERRADA' : 'ABIERTA'),
                estadoRun: null,
                calculada: false,
                totales: null,
                calculadaEn: null,
                cerradaEn: null,
                cerradaPor: null,
                moneda: 'MXN',
                pagosGenerados: 0,
                run: null
            };
        }

        const detail = await this.getPrenomina(periodCode);
        const paymentsResult = await this._query(
            `SELECT COUNT(*)::int AS count
             FROM payroll_payments
             WHERE run_id = $1`,
            [period.run_id]
        );

        return {
            periodo: period.code,
            periodoInfo: detail.periodoInfo,
            estado: period.run_status === 'CERRADA' ? 'CERRADA' : 'ABIERTA',
            estadoRun: period.run_status,
            calculada: ['CALCULADA', 'CERRADA'].includes(period.run_status),
            totales: detail.totales,
            calculadaEn: toIso(period.calculated_at),
            cerradaEn: toIso(period.closed_at),
            cerradaPor: period.closed_by,
            moneda: 'MXN',
            pagosGenerados: paymentsResult.rows[0].count,
            run: detail.run
        };
    }

    async closeNomina(periodCode, userId = null) {
        return this._withTransaction(async client => {
            const periodResult = await client.query(
                `SELECT id, code, status
                 FROM pay_periods
                 WHERE code = $1
                 FOR UPDATE`,
                [periodCode]
            );

            const period = periodResult.rows[0];
            if (!period) {
                throw new NotFoundError('Periodo no encontrado.');
            }
            if (period.status === 'CERRADO') {
                throw new ConflictError(
                    'La nomina definitiva de este periodo ya fue cerrada.'
                );
            }
            if (period.status === 'CANCELADO') {
                throw new ConflictError('El periodo indicado esta cancelado.');
            }

            const runResult = await client.query(
                `SELECT id, run_number, status,
                        total_earnings, total_deductions, total_net
                 FROM payroll_runs
                 WHERE period_id = $1
                   AND status <> 'CANCELADA'
                 ORDER BY id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [period.id]
            );

            const run = runResult.rows[0];
            if (!run) {
                throw new ConflictError(
                    'Debe calcular la prenomina del periodo antes de cerrar la nomina definitiva.'
                );
            }
            if (run.status === 'CERRADA') {
                throw new ConflictError(
                    'La nomina definitiva de este periodo ya fue cerrada.'
                );
            }
            if (run.status !== 'CALCULADA') {
                throw new ConflictError(
                    'La prenomina del periodo debe estar calculada antes de cerrar la nomina definitiva.'
                );
            }

            // Solo se aplican las cuotas que realmente formaron parte de este run.
            await client.query(
                `WITH aplicadas AS (
                     UPDATE loan_installments li
                     SET status = 'APLICADA',
                         applied_at = CURRENT_TIMESTAMP
                     WHERE li.period_id = $1
                       AND li.status = 'PROGRAMADA'
                       AND EXISTS (
                           SELECT 1
                           FROM payroll_lines pl
                           INNER JOIN payroll_results pr ON pr.id = pl.result_id
                           WHERE pr.run_id = $2
                             AND pl.source_type = 'PRESTAMO'
                             AND pl.source_id = li.id
                       )
                     RETURNING li.loan_id, li.amount
                 )
                 UPDATE employee_loans el
                 SET balance = GREATEST(el.balance - a.total, 0),
                     status = CASE
                         WHEN GREATEST(el.balance - a.total, 0) = 0 THEN 'PAGADO'
                         ELSE el.status
                     END
                 FROM (
                     SELECT loan_id, SUM(amount) AS total
                     FROM aplicadas
                     GROUP BY loan_id
                 ) a
                 WHERE el.id = a.loan_id`,
                [period.id, run.id]
            );

            await client.query(
                `UPDATE bonus_entries
                 SET status = 'APLICADO',
                     applied_at = CURRENT_TIMESTAMP
                 WHERE period_id = $1
                   AND status = 'APROBADO'
                   AND id IN (
                       SELECT pl.source_id
                       FROM payroll_lines pl
                       INNER JOIN payroll_results pr ON pr.id = pl.result_id
                       WHERE pr.run_id = $2
                         AND pl.source_type = 'BONO'
                   )`,
                [period.id, run.id]
            );

            await client.query(
                `UPDATE overtime_entries
                 SET status = 'APLICADO',
                     applied_at = CURRENT_TIMESTAMP
                 WHERE period_id = $1
                   AND status = 'APROBADO'
                   AND id IN (
                       SELECT pl.source_id
                       FROM payroll_lines pl
                       INNER JOIN payroll_results pr ON pr.id = pl.result_id
                       WHERE pr.run_id = $2
                         AND pl.source_type = 'HORAS_EXTRA'
                   )`,
                [period.id, run.id]
            );

            const paymentsResult = await client.query(
                `INSERT INTO payroll_payments
                     (run_id, result_id, employee_id, payment_date, amount, status)
                 SELECT $1,
                        pr.id,
                        pr.employee_id,
                        COALESCE(pp.payment_date, pp.end_date),
                        pr.net_amount,
                        'PENDIENTE'
                 FROM payroll_results pr
                 INNER JOIN pay_periods pp ON pp.id = $2
                 WHERE pr.run_id = $1
                 ON CONFLICT (result_id) DO NOTHING`,
                [run.id, period.id]
            );

            const closedResult = await client.query(
                `UPDATE payroll_runs
                 SET status = 'CERRADA',
                     closed_by = $2::int,
                     closed_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING closed_at, total_earnings, total_deductions, total_net`,
                [run.id, userId]
            );

            await client.query(
                `UPDATE pay_periods
                 SET status = 'CERRADO'
                 WHERE id = $1`,
                [period.id]
            );

            const closed = closedResult.rows[0];

            const breakdownResult = await client.query(
                `SELECT
                     COALESCE((
                         SELECT SUM(pr.base_salary)
                         FROM payroll_results pr
                         WHERE pr.run_id = $1
                     ), 0) AS salario_base,
                     COALESCE((
                         SELECT SUM(pl.amount)
                         FROM payroll_lines pl
                         INNER JOIN payroll_results pr ON pr.id = pl.result_id
                         INNER JOIN payroll_concepts pc ON pc.id = pl.concept_id
                         WHERE pr.run_id = $1
                           AND pc.code = 'BONO'
                     ), 0) AS bonos,
                     COALESCE((
                         SELECT SUM(pl.amount)
                         FROM payroll_lines pl
                         INNER JOIN payroll_results pr ON pr.id = pl.result_id
                         INNER JOIN payroll_concepts pc ON pc.id = pl.concept_id
                         WHERE pr.run_id = $1
                           AND pc.code = 'HORAS_EXTRA'
                     ), 0) AS horas_extras`,
                [run.id]
            );

            const breakdown = breakdownResult.rows[0];
            const percepciones = toNumber(closed.total_earnings) ?? 0;
            const deducciones = toNumber(closed.total_deductions) ?? 0;
            const salarioBase = toNumber(breakdown.salario_base) ?? 0;
            const bonos = toNumber(breakdown.bonos) ?? 0;
            const horasExtras = toNumber(breakdown.horas_extras) ?? 0;

            return {
                periodo: period.code,
                estado: 'CERRADA',
                moneda: 'MXN',
                runId: run.id,
                totales: {
                    salarioBase,
                    bonos,
                    horasExtras,
                    otrasPercepciones: round2(percepciones - salarioBase - bonos - horasExtras),
                    percepciones,
                    bruto: percepciones,
                    deducciones,
                    neto: toNumber(closed.total_net) ?? 0
                },
                cerradaEn: toIso(closed.closed_at),
                cerradaPor: userId,
                pagosGenerados: paymentsResult.rowCount
            };
        });
    }
}

module.exports = PayrollRepository;
