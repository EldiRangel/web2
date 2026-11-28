-- ============================================================================
-- Migracion: correos outbox y reportes (Bloques 5 y 6)
-- Tabla de cola de correos para recuperacion de clave y notificaciones
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS mail_outbox (
    id           SERIAL PRIMARY KEY,
    to_email     VARCHAR(255) NOT NULL,
    to_name      VARCHAR(255),
    subject      VARCHAR(255) NOT NULL,
    body_text    TEXT,
    body_html    TEXT,
    template     VARCHAR(100),          -- nombre de plantilla (recuperacion_clave, etc.)
    template_data JSONB,               -- datos para renderizar la plantilla
    status       VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO')),
    intentos     INTEGER NOT NULL DEFAULT 0,
    max_intentos INTEGER NOT NULL DEFAULT 3,
    enviado_en   TIMESTAMPTZ,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mail_outbox_status_idx ON mail_outbox (status);
CREATE INDEX IF NOT EXISTS mail_outbox_created_idx ON mail_outbox (created_at);

COMMIT;
