CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(150) UNIQUE NOT NULL,
    password   VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, profile_id)
);

CREATE TABLE IF NOT EXISTS "session" (
    "sid"    VARCHAR NOT NULL COLLATE "default",
    "sess"   JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
)
WITH (OIDS=FALSE);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
        ALTER TABLE "session"
        ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
        NOT DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

INSERT INTO profiles (name, description) VALUES
    ('admin',  'Acceso total al sistema'),
    ('editor', 'Puede crear y editar contenido'),
    ('viewer', 'Solo puede consultar informacion')
ON CONFLICT DO NOTHING;
