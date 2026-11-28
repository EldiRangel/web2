-- ============================================================================
-- Migracion: seguridad avanzada (bloqueo por intentos, recuperacion de clave,
-- refresh tokens JWT)
-- Ejecutar DESPUES de database/security.sql
-- ============================================================================

BEGIN;

-- Tabla de intentos de login (para bloqueo por fuerza bruta)
CREATE TABLE IF NOT EXISTS login_attempts (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(150) NOT NULL,
    ip          INET NOT NULL,
    success     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, created_at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx    ON login_attempts (ip, created_at);

-- Tabla de tokens de recuperacion de contrasena
CREATE TABLE IF NOT EXISTS password_recovery (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        VARCHAR(255) NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_recovery_user_idx ON password_recovery (user_id);
CREATE INDEX IF NOT EXISTS password_recovery_token_idx ON password_recovery (token);

-- Tabla de refresh tokens JWT
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        VARCHAR(512) NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_token_idx ON refresh_tokens (token);

-- Campos auxiliares en users para bloqueo y recuperacion
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_reset_token  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

COMMIT;
