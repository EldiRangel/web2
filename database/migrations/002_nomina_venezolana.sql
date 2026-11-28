-- ============================================================================
-- Migracion: nomina venezolana (Bloques 3 y 4)
-- Conceptos de ley (SSO, PARO_FORZOSO, FAOV), aportes patronales,
-- prorrateo por dias y despidos
-- Ejecutar DESPUES de database/payroll.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Tabla de conceptos de nomina
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS concepto (
    id           SERIAL PRIMARY KEY,
    codigo       VARCHAR(30) NOT NULL UNIQUE,
    nombre       VARCHAR(150) NOT NULL,
    tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('PERCEPCION', 'DEDUCCION', 'APORTACION_PATRONAL')),
    categoria    VARCHAR(30) NOT NULL CHECK (categoria IN ('LEY', 'OPCIONAL', 'BONO', 'PRESTAMO', 'HORA_EXTRA', 'AJUSTE')),
    unidad       VARCHAR(20) NOT NULL DEFAULT 'MONTO' CHECK (unidad IN ('HORAS', 'DIAS', 'MONTO')),
    calculo      VARCHAR(20) NOT NULL DEFAULT 'FIJO' CHECK (calculo IN ('FIJO', 'PORCENTAJE_SALARIO', 'CANTIDAD')),
    porcentaje   NUMERIC(5,4),          -- para calculo = PORCENTAJE_SALARIO
    tope_base    NUMERIC(14,2),          -- tope maximo de base de calculo
    piso_base    NUMERIC(14,2),           -- piso minimo de base de calculo
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Tabla de tipos de aporte de ley (SSO, PARO_FORZOSO, FAOV, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipo_aporte_ley (
    id            SERIAL PRIMARY KEY,
    concepto_id   INTEGER NOT NULL REFERENCES concepto(id) ON DELETE CASCADE,
    nombre        VARCHAR(100) NOT NULL,
    porcentaje    NUMERIC(5,4) NOT NULL,   -- porcentaje sobre el salario
    tope_salario  NUMERIC(14,2),             -- tope maximo de salario para calcular
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Tabla de despidos (para prorrateo por dias trabajados)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS despido (
    id                SERIAL PRIMARY KEY,
    employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    fecha_efecto      DATE NOT NULL,
    motivo            VARCHAR(50) NOT NULL CHECK (motivo IN ('RENUNCIA', 'DESPIDO_JUSTIFICADO', 'DESPIDO_INJUSTIFICADO', 'FIN_DE_CONTRATO', 'JUBILACION', 'FALLECIMIENTO')),
    tipo_contrato     VARCHAR(30) NOT NULL DEFAULT 'VIGENTE' CHECK (tipo_contrato IN ('VIGENTE', 'SUSPENDIDO', 'FINALIZADO')),
    liquidacion_pagada BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- Campos auxiliares en employees para prorrateo y despido
-- ----------------------------------------------------------------------------
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS fecha_ingreso DATE,
    ADD COLUMN IF NOT EXISTS fecha_cese DATE,
    ADD COLUMN IF NOT EXISTS tipo_pago VARCHAR(20) NOT NULL DEFAULT 'FIJO' CHECK (tipo_pago IN ('FIJO', 'POR_HORA')),
    ADD COLUMN IF NOT EXISTS horas_mensuales NUMERIC(6,2) NOT NULL DEFAULT 160;

-- Sincronizar fecha_ingreso con hire_date si existe
UPDATE employees SET fecha_ingreso = hire_date WHERE fecha_ingreso IS NULL;

-- Hacer fecha_ingreso NOT NULL despues de poblar
ALTER TABLE employees ALTER COLUMN fecha_ingreso SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Semillas: conceptos de ley venezolanos
-- ----------------------------------------------------------------------------
INSERT INTO concepto (codigo, nombre, tipo, categoria, unidad, calculo, porcentaje, tope_base, piso_base, active)
VALUES
    ('SUELDO_BASE',           'Sueldo Base',               'PERCEPCION', 'LEY',       'MONTO', 'FIJO',        NULL, NULL, NULL, TRUE),
    ('HORA_EXTRA',            'Hora Extra',                'PERCEPCION', 'HORA_EXTRA','HORAS', 'CANTIDAD',    NULL, NULL, NULL, TRUE),
    ('BONO',                  'Bono',                      'PERCEPCION', 'BONO',      'MONTO', 'FIJO',        NULL, NULL, NULL, TRUE),
    ('SSO',                   'Seguro Social Obrero',      'DEDUCCION',  'LEY',       'MONTO', 'PORCENTAJE_SALARIO', 0.0400,  NULL, NULL, TRUE),
    ('PARO_FORZOSO',          'Paro Forzoso',              'DEDUCCION',  'LEY',       'MONTO', 'PORCENTAJE_SALARIO', 0.0200,  NULL, NULL, TRUE),
    ('FAOV',                  'Fondo de Ahorro Vivienda',  'DEDUCCION',  'LEY',       'MONTO', 'PORCENTAJE_SALARIO', 0.0200,  NULL, NULL, TRUE),
    ('APORTE_PATRONAL_SSO',   'Aporte Patronal SSO',       'APORTACION_PATRONAL', 'LEY', 'MONTO', 'PORCENTAJE_SALARIO', 0.0900 + 0.0400 + 0.0200 + 0.0100 + 0.0050 + 0.0025 + 0.0050, NULL, NULL, TRUE),
    ('APORTE_PATRONAL_FAOV',  'Aporte Patronal FAOV',      'APORTACION_PATRONAL', 'LEY', 'MONTO', 'PORCENTAJE_SALARIO', 0.0200, NULL, NULL, TRUE),
    ('CUOTA_PRESTAMO',        'Cuota de Prestamo',         'DEDUCCION',  'PRESTAMO',  'MONTO', 'FIJO',        NULL, NULL, NULL, TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Semillas: tipos de aporte de ley
-- ----------------------------------------------------------------------------
INSERT INTO tipo_aporte_ley (concepto_id, nombre, porcentaje, tope_salario, active)
SELECT c.id,
       v.nombre,
       v.porcentaje,
       v.tope_salario::numeric(14,2),
       TRUE
FROM concepto c
CROSS JOIN (VALUES
    ('SSO',                  'Seguro Social Obrero (Empleado)',              0.0400, NULL::numeric),
    ('PARO_FORZOSO',         'Paro Forzoso (Empleado)',                      0.0200, NULL::numeric),
    ('FAOV',                 'Fondo de Ahorro Vivienda (Empleado)',          0.0200, NULL::numeric),
    ('APORTE_PATRONAL_SSO',  'Aporte Patronal SSO + Inces + Vacaciones + etc', 0.1625, NULL::numeric),
    ('APORTE_PATRONAL_FAOV', 'Aporte Patronal FAOV',                         0.0200, NULL::numeric)
) AS v(codigo, nombre, porcentaje, tope_salario)
WHERE c.codigo = v.codigo
ON CONFLICT DO NOTHING;

COMMIT;
