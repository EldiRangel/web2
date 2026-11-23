-- ============================================================================
-- Modelo de datos de nomina (segun diagrama del profesor)
--
-- Se ejecuta DESPUES de schema.sql y security.sql, porque reutiliza:
--   person -> empleados (person_id)
--   users  -> auditoria de calculo/cierre
--
-- Entidades implementadas:
--   PAY_PERIODS            -> pay_periods
--   PAYROLL_RUNS           -> payroll_runs
--   EMPLOYEES              -> employees
--   BONUS_ENTRIES          -> bonus_entries
--   EMPLOYEE_LOANS         -> employee_loans
--   LOAN_INSTALLMENTS      -> loan_installments
--   EMPLOYEE_DEDUCTIONS    -> employee_deductions
--   OVERTIME_ENTRIES       -> overtime_entries
--   EMPLOYEE_COMPENSATIONS -> employee_compensations
--   PAYROLL_CONCEPTS       -> payroll_concepts
--   PAYROLL_RESULTS        -> payroll_results
--   PAYROLL_LINES          -> payroll_lines
--   PAYROLL_PAYMENTS       -> payroll_payments
--
-- El archivo es idempotente y no borra datos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- EMPLOYEES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employees (
    id              SERIAL PRIMARY KEY,
    person_id       INTEGER NOT NULL UNIQUE
                    REFERENCES person(id) ON DELETE CASCADE,
    employee_code   VARCHAR(30) NOT NULL UNIQUE,
    position        VARCHAR(100),
    department      VARCHAR(100),
    hire_date       DATE NOT NULL,
    termination_date DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    payment_type    VARCHAR(20) NOT NULL DEFAULT 'FIJO',
    pay_frequency   VARCHAR(20) NOT NULL DEFAULT 'MENSUAL',
    hourly_rate     NUMERIC(14,2),
    monthly_hours   NUMERIC(6,2) NOT NULL DEFAULT 160,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employees_status_check
        CHECK (status IN ('ACTIVO', 'INACTIVO', 'BAJA')),
    CONSTRAINT employees_dates_check
        CHECK (termination_date IS NULL OR termination_date >= hire_date),
    CONSTRAINT employees_payment_type_check
        CHECK (payment_type IN ('FIJO', 'POR_HORA')),
    CONSTRAINT employees_pay_frequency_check
        CHECK (pay_frequency IN ('MENSUAL', 'QUINCENAL', 'SEMANAL')),
    CONSTRAINT employees_hourly_rate_check
        CHECK (payment_type <> 'POR_HORA' OR (hourly_rate IS NOT NULL AND hourly_rate > 0)),
    CONSTRAINT employees_monthly_hours_check
        CHECK (monthly_hours > 0)
);

CREATE INDEX IF NOT EXISTS employees_status_idx ON employees (status);

-- ----------------------------------------------------------------------------
-- PAY_PERIODS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pay_periods (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(20) NOT NULL UNIQUE,
    period_type   VARCHAR(20) NOT NULL DEFAULT 'MENSUAL',
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    payment_date  DATE,
    status        VARCHAR(20) NOT NULL DEFAULT 'ABIERTO',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pay_periods_code_check
        CHECK (code ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-Q[1-2]|-W(0[1-9]|[1-4][0-9]|5[0-3]))?$'),
    CONSTRAINT pay_periods_type_check
        CHECK (period_type IN ('MENSUAL', 'QUINCENAL', 'SEMANAL')),
    CONSTRAINT pay_periods_type_code_check
        CHECK (
            (period_type = 'MENSUAL' AND code ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
            OR (period_type = 'QUINCENAL' AND code ~ '^[0-9]{4}-(0[1-9]|1[0-2])-Q[1-2]$')
            OR (period_type = 'SEMANAL' AND code ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$')
        ),
    CONSTRAINT pay_periods_dates_check
        CHECK (end_date >= start_date),
    CONSTRAINT pay_periods_status_check
        CHECK (status IN ('ABIERTO', 'CALCULADO', 'CERRADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS pay_periods_status_idx ON pay_periods (status);

-- ----------------------------------------------------------------------------
-- PAYROLL_CONCEPTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_concepts (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(30) NOT NULL UNIQUE,
    name             VARCHAR(100) NOT NULL,
    concept_type     VARCHAR(20) NOT NULL,
    calculation_type VARCHAR(20) NOT NULL DEFAULT 'FIJO',
    taxable          BOOLEAN NOT NULL DEFAULT TRUE,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_concepts_type_check
        CHECK (concept_type IN ('PERCEPCION', 'DEDUCCION', 'IMPUESTO', 'APORTACION')),
    CONSTRAINT payroll_concepts_calc_check
        CHECK (calculation_type IN ('FIJO', 'PORCENTAJE', 'CANTIDAD'))
);

-- ----------------------------------------------------------------------------
-- PAYROLL_RUNS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_runs (
    id                SERIAL PRIMARY KEY,
    period_id         INTEGER NOT NULL
                      REFERENCES pay_periods(id) ON DELETE RESTRICT,
    run_number        INTEGER NOT NULL DEFAULT 1,
    run_type          VARCHAR(20) NOT NULL DEFAULT 'PRENOMINA',
    status            VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    calculated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    calculated_at     TIMESTAMPTZ,
    closed_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    closed_at         TIMESTAMPTZ,
    total_earnings    NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_deductions  NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_net         NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_runs_number_unique UNIQUE (period_id, run_number),
    CONSTRAINT payroll_runs_type_check
        CHECK (run_type IN ('PRENOMINA', 'DEFINITIVA', 'AJUSTE')),
    CONSTRAINT payroll_runs_status_check
        CHECK (status IN ('BORRADOR', 'CALCULADA', 'CERRADA', 'CANCELADA'))
);

-- Un solo run activo por periodo y tipo; los cancelados no bloquean.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_runs_periodo_tipo_activo
    ON payroll_runs (period_id, run_type)
    WHERE status <> 'CANCELADA';

CREATE INDEX IF NOT EXISTS payroll_runs_status_idx ON payroll_runs (status);

-- ----------------------------------------------------------------------------
-- PAYROLL_RESULTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_results (
    id                SERIAL PRIMARY KEY,
    run_id            INTEGER NOT NULL
                      REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id       INTEGER NOT NULL
                      REFERENCES employees(id) ON DELETE RESTRICT,
    base_salary       NUMERIC(14,2) NOT NULL DEFAULT 0,
    regular_hours     NUMERIC(8,2) NOT NULL DEFAULT 0,
    hourly_rate       NUMERIC(14,2),
    payment_type      VARCHAR(20),
    pay_frequency     VARCHAR(20),
    total_earnings    NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_deductions  NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    status            VARCHAR(20) NOT NULL DEFAULT 'CALCULADO',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_results_unique UNIQUE (run_id, employee_id),
    CONSTRAINT payroll_results_regular_hours_check
        CHECK (regular_hours >= 0),
    CONSTRAINT payroll_results_hourly_rate_check
        CHECK (hourly_rate IS NULL OR hourly_rate > 0),
    CONSTRAINT payroll_results_payment_type_check
        CHECK (payment_type IS NULL OR payment_type IN ('FIJO', 'POR_HORA')),
    CONSTRAINT payroll_results_pay_frequency_check
        CHECK (pay_frequency IS NULL OR pay_frequency IN ('MENSUAL', 'QUINCENAL', 'SEMANAL'))
);

CREATE INDEX IF NOT EXISTS payroll_results_employee_idx
    ON payroll_results (employee_id);

-- ----------------------------------------------------------------------------
-- PAYROLL_LINES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_lines (
    id           SERIAL PRIMARY KEY,
    result_id    INTEGER NOT NULL
                 REFERENCES payroll_results(id) ON DELETE CASCADE,
    concept_id   INTEGER NOT NULL
                 REFERENCES payroll_concepts(id) ON DELETE RESTRICT,
    line_type    VARCHAR(20) NOT NULL,
    quantity     NUMERIC(14,4) NOT NULL DEFAULT 1,
    rate         NUMERIC(14,4) NOT NULL DEFAULT 0,
    amount       NUMERIC(14,2) NOT NULL,
    source_type  VARCHAR(30),
    source_id    INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_lines_type_check
        CHECK (line_type IN ('PERCEPCION', 'DEDUCCION'))
);

CREATE INDEX IF NOT EXISTS payroll_lines_result_idx ON payroll_lines (result_id);
CREATE INDEX IF NOT EXISTS payroll_lines_concept_idx ON payroll_lines (concept_id);

-- ----------------------------------------------------------------------------
-- PAYROLL_PAYMENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_payments (
    id              SERIAL PRIMARY KEY,
    run_id          INTEGER NOT NULL
                    REFERENCES payroll_runs(id) ON DELETE CASCADE,
    result_id       INTEGER NOT NULL UNIQUE
                    REFERENCES payroll_results(id) ON DELETE CASCADE,
    employee_id     INTEGER NOT NULL
                    REFERENCES employees(id) ON DELETE RESTRICT,
    payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    amount          NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    payment_method  VARCHAR(30) NOT NULL DEFAULT 'TRANSFERENCIA',
    reference       VARCHAR(60),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT payroll_payments_status_check
        CHECK (status IN ('PENDIENTE', 'PAGADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS payroll_payments_run_idx
    ON payroll_payments (run_id);

-- ----------------------------------------------------------------------------
-- BONUS_ENTRIES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bonus_entries (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL
                REFERENCES employees(id) ON DELETE CASCADE,
    concept_id  INTEGER NOT NULL
                REFERENCES payroll_concepts(id) ON DELETE RESTRICT,
    period_id   INTEGER NOT NULL
                REFERENCES pay_periods(id) ON DELETE RESTRICT,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    reason      VARCHAR(255),
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at  TIMESTAMPTZ,
    CONSTRAINT bonus_entries_status_check
        CHECK (status IN ('PENDIENTE', 'APROBADO', 'APLICADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS bonus_entries_period_idx
    ON bonus_entries (period_id, status);

-- ----------------------------------------------------------------------------
-- OVERTIME_ENTRIES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS overtime_entries (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL
                    REFERENCES employees(id) ON DELETE CASCADE,
    concept_id      INTEGER NOT NULL
                    REFERENCES payroll_concepts(id) ON DELETE RESTRICT,
    period_id       INTEGER NOT NULL
                    REFERENCES pay_periods(id) ON DELETE RESTRICT,
    work_date       DATE NOT NULL,
    hours           NUMERIC(6,2) NOT NULL CHECK (hours > 0),
    rate_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.50 CHECK (rate_multiplier > 0),
    hourly_rate     NUMERIC(14,2) NOT NULL CHECK (hourly_rate >= 0),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at      TIMESTAMPTZ,
    CONSTRAINT overtime_entries_status_check
        CHECK (status IN ('PENDIENTE', 'APROBADO', 'APLICADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS overtime_entries_period_idx
    ON overtime_entries (period_id, status);

-- ----------------------------------------------------------------------------
-- TIME_ENTRIES (horas normales para empleados con pago POR_HORA)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_entries (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL
                REFERENCES employees(id) ON DELETE CASCADE,
    work_date   DATE NOT NULL,
    hours       NUMERIC(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    hourly_rate NUMERIC(14,2) NOT NULL CHECK (hourly_rate > 0),
    notes       VARCHAR(255),
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMPTZ,
    applied_at  TIMESTAMPTZ,
    CONSTRAINT time_entries_employee_date_unique UNIQUE (employee_id, work_date),
    CONSTRAINT time_entries_status_check
        CHECK (status IN ('PENDIENTE', 'APROBADO', 'APLICADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS time_entries_employee_date_idx
    ON time_entries (employee_id, work_date);
CREATE INDEX IF NOT EXISTS time_entries_status_idx
    ON time_entries (status, work_date);

-- ----------------------------------------------------------------------------
-- EMPLOYEE_COMPENSATIONS (percepciones recurrentes / salario)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employee_compensations (
    id             SERIAL PRIMARY KEY,
    employee_id    INTEGER NOT NULL
                   REFERENCES employees(id) ON DELETE CASCADE,
    concept_id     INTEGER NOT NULL
                   REFERENCES payroll_concepts(id) ON DELETE RESTRICT,
    amount         NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to   DATE,
    status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_compensations_status_check
        CHECK (status IN ('ACTIVA', 'INACTIVA')),
    CONSTRAINT employee_compensations_dates_check
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS employee_compensations_employee_idx
    ON employee_compensations (employee_id, status);

-- ----------------------------------------------------------------------------
-- EMPLOYEE_DEDUCTIONS (deducciones recurrentes)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employee_deductions (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL
                REFERENCES employees(id) ON DELETE CASCADE,
    concept_id  INTEGER NOT NULL
                REFERENCES payroll_concepts(id) ON DELETE RESTRICT,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date    DATE,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_deductions_status_check
        CHECK (status IN ('ACTIVA', 'INACTIVA')),
    CONSTRAINT employee_deductions_dates_check
        CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS employee_deductions_employee_idx
    ON employee_deductions (employee_id, status);

-- ----------------------------------------------------------------------------
-- EMPLOYEE_LOANS y LOAN_INSTALLMENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS employee_loans (
    id                 SERIAL PRIMARY KEY,
    employee_id        INTEGER NOT NULL
                       REFERENCES employees(id) ON DELETE CASCADE,
    concept_id         INTEGER NOT NULL
                       REFERENCES payroll_concepts(id) ON DELETE RESTRICT,
    principal          NUMERIC(14,2) NOT NULL CHECK (principal > 0),
    balance            NUMERIC(14,2) NOT NULL CHECK (balance >= 0),
    installment_amount NUMERIC(14,2) NOT NULL CHECK (installment_amount > 0),
    start_period_id    INTEGER REFERENCES pay_periods(id) ON DELETE RESTRICT,
    status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT employee_loans_status_check
        CHECK (status IN ('ACTIVO', 'PAGADO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS employee_loans_employee_idx
    ON employee_loans (employee_id, status);

CREATE TABLE IF NOT EXISTS loan_installments (
    id                  SERIAL PRIMARY KEY,
    loan_id             INTEGER NOT NULL
                        REFERENCES employee_loans(id) ON DELETE CASCADE,
    period_id           INTEGER NOT NULL
                        REFERENCES pay_periods(id) ON DELETE RESTRICT,
    installment_number  INTEGER NOT NULL CHECK (installment_number > 0),
    amount              NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADA',
    applied_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT loan_installments_unique UNIQUE (loan_id, period_id),
    CONSTRAINT loan_installments_number_unique UNIQUE (loan_id, installment_number),
    CONSTRAINT loan_installments_status_check
        CHECK (status IN ('PROGRAMADA', 'APLICADA', 'CANCELADA'))
);

CREATE INDEX IF NOT EXISTS loan_installments_period_idx
    ON loan_installments (period_id, status);
CREATE INDEX IF NOT EXISTS loan_installments_loan_idx
    ON loan_installments (loan_id, status);

-- ----------------------------------------------------------------------------
-- Catalogo de conceptos demo
-- ----------------------------------------------------------------------------

INSERT INTO payroll_concepts (code, name, concept_type, calculation_type, taxable, active) VALUES
    ('SALARIO_BASE',         'Sueldo base',                'PERCEPCION', 'FIJO',       TRUE,  TRUE),
    ('BONO',                 'Bono',                       'PERCEPCION', 'FIJO',       TRUE,  TRUE),
    ('HORAS_EXTRA',          'Horas extra',                'PERCEPCION', 'CANTIDAD',   TRUE,  TRUE),
    ('PRESTAMO',             'Deduccion por prestamo',     'DEDUCCION',  'FIJO',       FALSE, TRUE),
    ('DEDUCCION_RECURRENTE', 'Deduccion recurrente',       'DEDUCCION',  'FIJO',       FALSE, TRUE),
    ('ISR',                  'Impuesto sobre la renta',    'IMPUESTO',   'PORCENTAJE', FALSE, TRUE),
    ('IMSS',                 'Aportacion IMSS',            'APORTACION', 'PORCENTAJE', FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Periodos demo
-- ----------------------------------------------------------------------------

INSERT INTO pay_periods (code, period_type, start_date, end_date, payment_date, status) VALUES
    ('2026-09', 'MENSUAL', DATE '2026-09-01', DATE '2026-09-30', DATE '2026-09-30', 'CERRADO'),
    ('2026-10', 'MENSUAL', DATE '2026-10-01', DATE '2026-10-31', DATE '2026-10-31', 'ABIERTO'),
    ('2026-11', 'MENSUAL', DATE '2026-11-01', DATE '2026-11-30', DATE '2026-11-30', 'ABIERTO'),
    ('2026-12', 'MENSUAL', DATE '2026-12-01', DATE '2026-12-31', DATE '2026-12-31', 'ABIERTO'),
    ('2027-01', 'MENSUAL', DATE '2027-01-01', DATE '2027-01-31', DATE '2027-01-31', 'ABIERTO')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Empleados demo (personas ficticias, sin datos personales reales)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    registro RECORD;
    persona_id_valor INTEGER;
    empleado_id_valor INTEGER;
    concepto_salario_id INTEGER;
BEGIN
    SELECT id INTO concepto_salario_id
    FROM payroll_concepts
    WHERE code = 'SALARIO_BASE';

    FOR registro IN
        SELECT *
        FROM (VALUES
            ('Empleado Demo Uno',   'demo1@nomina.local', 'DEMO-001', 'Analista',      'Tecnologia',     DATE '2026-01-15', 18000.00::numeric),
            ('Empleado Demo Dos',   'demo2@nomina.local', 'DEMO-002', 'Desarrollador', 'Tecnologia',     DATE '2026-02-01', 22000.00::numeric),
            ('Empleado Demo Tres',  'demo3@nomina.local', 'DEMO-003', 'Auxiliar',      'Administracion', DATE '2026-03-10', 12000.00::numeric),
            ('Empleado Demo Cuatro','demo4@nomina.local', 'DEMO-004', 'Gerente',       'Operaciones',    DATE '2026-01-05', 35000.00::numeric)
        ) AS datos(nombre, correo, codigo, puesto, departamento, ingreso, salario)
    LOOP
        SELECT id INTO persona_id_valor
        FROM person
        WHERE email = registro.correo;

        IF persona_id_valor IS NULL THEN
            INSERT INTO person (name, email, active)
            VALUES (registro.nombre, registro.correo, TRUE)
            RETURNING id INTO persona_id_valor;
        END IF;

        SELECT id INTO empleado_id_valor
        FROM employees
        WHERE employee_code = registro.codigo;

        IF empleado_id_valor IS NULL THEN
            -- DEMO-003 inicia inactivo para poder probar rechazos de nomina.
            INSERT INTO employees
                (person_id, employee_code, position, department, hire_date, status)
            VALUES
                (persona_id_valor, registro.codigo, registro.puesto,
                 registro.departamento, registro.ingreso,
                 CASE WHEN registro.codigo = 'DEMO-003' THEN 'INACTIVO' ELSE 'ACTIVO' END)
            RETURNING id INTO empleado_id_valor;
        END IF;

        INSERT INTO employee_compensations
            (employee_id, concept_id, amount, effective_from, status)
        SELECT empleado_id_valor, concepto_salario_id, registro.salario, registro.ingreso, 'ACTIVA'
        WHERE NOT EXISTS (
            SELECT 1
            FROM employee_compensations ec
            WHERE ec.employee_id = empleado_id_valor
              AND ec.concept_id = concepto_salario_id
              AND ec.effective_from = registro.ingreso
        );
    END LOOP;
END $$;

-- Deduccion recurrente demo para DEMO-002.
INSERT INTO employee_deductions (employee_id, concept_id, amount, start_date, status)
SELECT e.id, c.id, 350.00, DATE '2026-02-01', 'ACTIVA'
FROM employees e
JOIN payroll_concepts c ON c.code = 'DEDUCCION_RECURRENTE'
WHERE e.employee_code = 'DEMO-002'
  AND NOT EXISTS (
      SELECT 1 FROM employee_deductions d
      WHERE d.employee_id = e.id AND d.concept_id = c.id
  );

-- Prestamo demo para DEMO-002 y sus cuatro cuotas programadas.
INSERT INTO employee_loans
    (employee_id, concept_id, principal, balance, installment_amount, start_period_id, status)
SELECT e.id, c.id, 6000.00, 2400.00, 600.00, pp.id, 'ACTIVO'
FROM employees e
JOIN payroll_concepts c ON c.code = 'PRESTAMO'
JOIN pay_periods pp ON pp.code = '2026-10'
WHERE e.employee_code = 'DEMO-002'
  AND NOT EXISTS (
      SELECT 1 FROM employee_loans l
      WHERE l.employee_id = e.id
  );

INSERT INTO loan_installments (loan_id, period_id, installment_number, amount, status)
SELECT l.id,
       pp.id,
       (ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY pp.code))::integer,
       l.installment_amount,
       'PROGRAMADA'
FROM employee_loans l
JOIN pay_periods pp ON pp.code IN ('2026-10', '2026-11', '2026-12', '2027-01')
WHERE l.status = 'ACTIVO'
  AND EXISTS (
      SELECT 1
      FROM employees e
      WHERE e.id = l.employee_id
        AND e.employee_code = 'DEMO-002'
  )
ON CONFLICT (loan_id, period_id) DO NOTHING;

-- Bono y horas extra aprobados para el periodo 2026-10.
INSERT INTO bonus_entries
    (employee_id, concept_id, period_id, amount, reason, status, created_by)
SELECT e.id, c.id, pp.id, 1500.00, 'Bono de productividad', 'APROBADO', u.id
FROM employees e
JOIN payroll_concepts c ON c.code = 'BONO'
JOIN pay_periods pp ON pp.code = '2026-10'
LEFT JOIN users u ON u.id = 1
WHERE e.employee_code = 'DEMO-001'
  AND NOT EXISTS (
      SELECT 1 FROM bonus_entries b
      WHERE b.employee_id = e.id
        AND b.period_id = pp.id
        AND b.reason = 'Bono de productividad'
  );

INSERT INTO overtime_entries
    (employee_id, concept_id, period_id, work_date, hours, rate_multiplier,
     hourly_rate, amount, status, created_by)
SELECT e.id, c.id, pp.id, DATE '2026-10-10', 6.00, 1.50, 120.00,
       6.00 * 1.50 * 120.00, 'APROBADO', u.id
FROM employees e
JOIN payroll_concepts c ON c.code = 'HORAS_EXTRA'
JOIN pay_periods pp ON pp.code = '2026-10'
LEFT JOIN users u ON u.id = 1
WHERE e.employee_code = 'DEMO-002'
  AND NOT EXISTS (
      SELECT 1 FROM overtime_entries o
      WHERE o.employee_id = e.id
        AND o.period_id = pp.id
        AND o.work_date = DATE '2026-10-10'
  );

INSERT INTO overtime_entries
    (employee_id, concept_id, period_id, work_date, hours, rate_multiplier,
     hourly_rate, amount, status, created_by)
SELECT e.id, c.id, pp.id, DATE '2026-10-18', 4.00, 1.50, 200.00,
       4.00 * 1.50 * 200.00, 'APROBADO', u.id
FROM employees e
JOIN payroll_concepts c ON c.code = 'HORAS_EXTRA'
JOIN pay_periods pp ON pp.code = '2026-10'
LEFT JOIN users u ON u.id = 1
WHERE e.employee_code = 'DEMO-004'
  AND NOT EXISTS (
      SELECT 1 FROM overtime_entries o
      WHERE o.employee_id = e.id
        AND o.period_id = pp.id
        AND o.work_date = DATE '2026-10-18'
  );

COMMIT;
