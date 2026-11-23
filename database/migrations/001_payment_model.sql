-- ============================================================================
-- Migracion 001 - modelo de pago fijo / por hora y frecuencias
--
-- Se aplica sobre una base que ya tiene database/payroll.sql.
-- Es idempotente: se puede ejecutar varias veces sin duplicar columnas,
-- tablas, indices ni restricciones.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- EMPLEADOS: forma de pago, frecuencia, tarifa y jornada mensual de referencia
-- ----------------------------------------------------------------------------

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS payment_type  VARCHAR(20) NOT NULL DEFAULT 'FIJO',
    ADD COLUMN IF NOT EXISTS pay_frequency VARCHAR(20) NOT NULL DEFAULT 'MENSUAL',
    ADD COLUMN IF NOT EXISTS hourly_rate   NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS monthly_hours NUMERIC(6,2) NOT NULL DEFAULT 160;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_payment_type_check'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_payment_type_check
            CHECK (payment_type IN ('FIJO', 'POR_HORA'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_pay_frequency_check'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_pay_frequency_check
            CHECK (pay_frequency IN ('MENSUAL', 'QUINCENAL', 'SEMANAL'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_hourly_rate_check'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_hourly_rate_check
            CHECK (payment_type <> 'POR_HORA' OR (hourly_rate IS NOT NULL AND hourly_rate > 0));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_monthly_hours_check'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_monthly_hours_check
            CHECK (monthly_hours > 0);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PERIODOS: codigos mensuales, quincenales (Q1/Q2) y semanales ISO (Wnn)
-- ----------------------------------------------------------------------------

ALTER TABLE pay_periods
    ALTER COLUMN code TYPE VARCHAR(20);

ALTER TABLE pay_periods
    DROP CONSTRAINT IF EXISTS pay_periods_code_check;
ALTER TABLE pay_periods
    DROP CONSTRAINT IF EXISTS pay_periods_type_check;
ALTER TABLE pay_periods
    DROP CONSTRAINT IF EXISTS pay_periods_type_code_check;

ALTER TABLE pay_periods
    ADD CONSTRAINT pay_periods_code_check
    CHECK (code ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-Q[1-2]|-W(0[1-9]|[1-4][0-9]|5[0-3]))?$');

ALTER TABLE pay_periods
    ADD CONSTRAINT pay_periods_type_check
    CHECK (period_type IN ('MENSUAL', 'QUINCENAL', 'SEMANAL'));

ALTER TABLE pay_periods
    ADD CONSTRAINT pay_periods_type_code_check
    CHECK (
        (period_type = 'MENSUAL' AND code ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
        OR (period_type = 'QUINCENAL' AND code ~ '^[0-9]{4}-(0[1-9]|1[0-2])-Q[1-2]$')
        OR (period_type = 'SEMANAL' AND code ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$')
    );

-- ----------------------------------------------------------------------------
-- RESULTADOS: snapshot de la forma de pago usada en el calculo
-- ----------------------------------------------------------------------------

ALTER TABLE payroll_results
    ADD COLUMN IF NOT EXISTS regular_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hourly_rate   NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS payment_type  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS pay_frequency VARCHAR(20);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_results_regular_hours_check'
    ) THEN
        ALTER TABLE payroll_results
            ADD CONSTRAINT payroll_results_regular_hours_check
            CHECK (regular_hours >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_results_hourly_rate_check'
    ) THEN
        ALTER TABLE payroll_results
            ADD CONSTRAINT payroll_results_hourly_rate_check
            CHECK (hourly_rate IS NULL OR hourly_rate > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_results_payment_type_check'
    ) THEN
        ALTER TABLE payroll_results
            ADD CONSTRAINT payroll_results_payment_type_check
            CHECK (payment_type IS NULL OR payment_type IN ('FIJO', 'POR_HORA'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payroll_results_pay_frequency_check'
    ) THEN
        ALTER TABLE payroll_results
            ADD CONSTRAINT payroll_results_pay_frequency_check
            CHECK (pay_frequency IS NULL OR pay_frequency IN ('MENSUAL', 'QUINCENAL', 'SEMANAL'));
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- HORAS NORMALES: solo aplican a empleados POR_HORA
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

COMMIT;
