-- ============================================================================
-- Migracion incremental del modelo de seguridad
--
-- Se ejecuta DESPUES de database/schema.sql. No elimina ni renombra las
-- tablas del login:
--   users        -> entidad "user" existente
--   profiles     -> entidad "profile" existente
--   user_profiles-> entidad "user_profile" existente
--
-- Se agrega person y se vincula uno-a-uno con users. El resto de entidades
-- del diagrama se crea con sus nombres originales. Al final se crean vistas
-- de compatibilidad "user", profile y user_profile (no duplican datos).
-- El archivo es idempotente.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. person y extensiones de las tablas existentes
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS person (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    email      VARCHAR(150) UNIQUE,
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS person_id INTEGER,
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_person_id_fkey'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_person_id_fkey
            FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_person_id_key'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_person_id_key UNIQUE (person_id);
    END IF;
END $$;

-- Crea una persona por cada usuario existente y las vincula sin borrar datos.
DO $$
DECLARE
    user_row RECORD;
    person_id_value INTEGER;
BEGIN
    FOR user_row IN
        SELECT id, name, email
        FROM users
        WHERE person_id IS NULL
        ORDER BY id
    LOOP
        SELECT id INTO person_id_value
        FROM person
        WHERE email = user_row.email
        LIMIT 1;

        IF person_id_value IS NULL THEN
            INSERT INTO person (name, email, active)
            VALUES (user_row.name, user_row.email, TRUE)
            RETURNING id INTO person_id_value;
        END IF;

        UPDATE users
        SET person_id = person_id_value
        WHERE id = user_row.id;
    END LOOP;
END $$;

-- Evita perfiles duplicados y acelera las consultas por perfil.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_name_ci_unique
    ON profiles (LOWER(name));

CREATE INDEX IF NOT EXISTS user_profiles_profile_id_idx
    ON user_profiles (profile_id);

INSERT INTO profiles (name, description, active) VALUES
    ('admin',  'Acceso total al sistema', TRUE),
    ('editor', 'Puede crear y editar contenido', TRUE),
    ('viewer', 'Solo puede consultar informacion', TRUE)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Catalogo de subsistemas, clases, metodos y opciones
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subsystem (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT subsystem_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS "class" (
    id           SERIAL PRIMARY KEY,
    subsystem_id INTEGER NOT NULL REFERENCES subsystem(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT class_subsystem_name_key UNIQUE (subsystem_id, name),
    CONSTRAINT class_id_subsystem_key UNIQUE (id, subsystem_id)
);

CREATE TABLE IF NOT EXISTS method (
    id          SERIAL PRIMARY KEY,
    class_id    INTEGER NOT NULL REFERENCES "class"(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT method_class_name_key UNIQUE (class_id, name),
    CONSTRAINT method_id_class_key UNIQUE (id, class_id)
);

CREATE TABLE IF NOT EXISTS "option" (
    id           SERIAL PRIMARY KEY,
    subsystem_id INTEGER NOT NULL REFERENCES subsystem(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT option_subsystem_name_key UNIQUE (subsystem_id, name),
    CONSTRAINT option_id_subsystem_key UNIQUE (id, subsystem_id)
);

-- ----------------------------------------------------------------------------
-- 3. Permisos explicitos permitidos/denegados
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permission_method (
    subsystem_id INTEGER NOT NULL,
    class_id     INTEGER NOT NULL,
    method_id    INTEGER NOT NULL,
    profile_id   INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    allowed      BOOLEAN NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT permission_method_pkey
        PRIMARY KEY (subsystem_id, class_id, method_id, profile_id),
    CONSTRAINT permission_method_class_fkey
        FOREIGN KEY (class_id, subsystem_id)
        REFERENCES "class" (id, subsystem_id)
        ON DELETE CASCADE,
    CONSTRAINT permission_method_method_fkey
        FOREIGN KEY (method_id, class_id)
        REFERENCES method (id, class_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS permission_option (
    subsystem_id INTEGER NOT NULL,
    option_id    INTEGER NOT NULL,
    profile_id   INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    allowed      BOOLEAN NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT permission_option_pkey
        PRIMARY KEY (subsystem_id, option_id, profile_id),
    CONSTRAINT permission_option_option_fkey
        FOREIGN KEY (option_id, subsystem_id)
        REFERENCES "option" (id, subsystem_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS permission_method_profile_id_idx
    ON permission_method (profile_id);

CREATE INDEX IF NOT EXISTS permission_option_profile_id_idx
    ON permission_option (profile_id);

-- ----------------------------------------------------------------------------
-- 4. Vistas de compatibilidad con los nombres del diagrama
--    Son alias de solo lectura; las tablas canonicas siguen siendo las del
--    login para no duplicar datos ni romper el codigo existente.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW "user" AS
SELECT id, person_id, name, email, active, created_at
FROM users;

CREATE OR REPLACE VIEW profile AS
SELECT id, name, description, active
FROM profiles;

CREATE OR REPLACE VIEW user_profile AS
SELECT user_id, profile_id, active
FROM user_profiles;

COMMENT ON VIEW "user" IS
    'Vista de compatibilidad sobre users. No almacena datos ni contrasenas.';
COMMENT ON VIEW profile IS
    'Vista de compatibilidad sobre profiles.';
COMMENT ON VIEW user_profile IS
    'Vista de compatibilidad sobre user_profiles.';

-- ----------------------------------------------------------------------------
-- 5. Catalogo de demostracion del subsistema Nomina
-- ----------------------------------------------------------------------------

INSERT INTO subsystem (name, description)
VALUES ('Nomina', 'Operaciones de empleados y nomina')
ON CONFLICT (name) DO NOTHING;

INSERT INTO "class" (subsystem_id, name, description)
SELECT s.id, catalog.name, catalog.description
FROM subsystem s
CROSS JOIN (VALUES
    ('Empleados',        'Gestion y consulta de empleados'),
    ('Salarios',         'Consulta de salarios'),
    ('Bonos',            'Consulta de bonos'),
    ('HorasExtras',      'Consulta de horas extras'),
    ('Prestamos',        'Consulta de prestamos'),
    ('Prenomina',        'Calculo y consulta de prenomina'),
    ('NominaDefinitiva', 'Consulta y cierre de nomina definitiva')
) AS catalog(name, description)
WHERE s.name = 'Nomina'
ON CONFLICT (subsystem_id, name) DO NOTHING;

INSERT INTO method (class_id, name, description)
SELECT c.id, catalog.method_name, catalog.description
FROM "class" c
INNER JOIN subsystem s ON s.id = c.subsystem_id AND s.name = 'Nomina'
INNER JOIN (VALUES
    ('Empleados',        'listar',    'Lista empleados'),
    ('Empleados',        'consultar', 'Consulta un empleado'),
    ('Salarios',         'consultar', 'Consulta el salario de un empleado'),
    ('Bonos',            'listar',    'Lista bonos'),
    ('HorasExtras',      'listar',    'Lista horas extras'),
    ('Prestamos',        'listar',    'Lista prestamos'),
    ('Prenomina',        'calcular',  'Calcula la prenomina de un periodo'),
    ('Prenomina',        'consultar', 'Consulta la prenomina calculada'),
    ('NominaDefinitiva', 'consultar', 'Consulta el estado de la nomina definitiva'),
    ('NominaDefinitiva', 'cerrar',    'Cierra la nomina definitiva de un periodo')
) AS catalog(class_name, method_name, description)
    ON catalog.class_name = c.name
ON CONFLICT (class_id, name) DO NOTHING;

INSERT INTO "option" (subsystem_id, name, description)
SELECT s.id, catalog.name, catalog.description
FROM subsystem s
CROSS JOIN (VALUES
    ('empleados',         'Opcion de empleados'),
    ('salarios',          'Opcion de salarios'),
    ('bonos',             'Opcion de bonos'),
    ('horas_extras',      'Opcion de horas extras'),
    ('prestamos',         'Opcion de prestamos'),
    ('prenomina',         'Opcion de prenomina'),
    ('nomina_definitiva', 'Opcion de nomina definitiva')
) AS catalog(name, description)
WHERE s.name = 'Nomina'
ON CONFLICT (subsystem_id, name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Permisos de demostracion (no sobrescriben cambios administrativos)
--    admin  -> todos los metodos y opciones
--    editor -> operaciones de consulta y calculo (no cierre definitivo)
--    viewer -> solo consultas
-- ----------------------------------------------------------------------------

INSERT INTO permission_method
    (subsystem_id, class_id, method_id, profile_id, allowed)
SELECT c.subsystem_id, c.id, m.id, p.id, TRUE
FROM "class" c
INNER JOIN method m    ON m.class_id = c.id
INNER JOIN subsystem s ON s.id = c.subsystem_id AND s.name = 'Nomina'
INNER JOIN profiles p  ON p.name = 'admin'
ON CONFLICT (subsystem_id, class_id, method_id, profile_id) DO NOTHING;

WITH grants(class_name, method_name, allowed) AS (
    VALUES
        ('Empleados',        'listar',    TRUE),
        ('Empleados',        'consultar', TRUE),
        ('Salarios',         'consultar', TRUE),
        ('Bonos',            'listar',    TRUE),
        ('HorasExtras',      'listar',    TRUE),
        ('Prestamos',        'listar',    TRUE),
        ('Prenomina',        'calcular',  TRUE),
        ('Prenomina',        'consultar', TRUE),
        ('NominaDefinitiva', 'consultar', TRUE)
)
INSERT INTO permission_method
    (subsystem_id, class_id, method_id, profile_id, allowed)
SELECT c.subsystem_id, c.id, m.id, p.id, g.allowed
FROM "class" c
INNER JOIN method m    ON m.class_id = c.id
INNER JOIN subsystem s ON s.id = c.subsystem_id AND s.name = 'Nomina'
INNER JOIN profiles p  ON p.name = 'editor'
INNER JOIN grants g    ON g.class_name = c.name AND g.method_name = m.name
ON CONFLICT (subsystem_id, class_id, method_id, profile_id) DO NOTHING;

WITH grants(class_name, method_name, allowed) AS (
    VALUES
        ('Empleados',        'listar',    TRUE),
        ('Empleados',        'consultar', TRUE),
        ('Salarios',         'consultar', TRUE),
        ('Prenomina',        'consultar', TRUE),
        ('NominaDefinitiva', 'consultar', TRUE)
)
INSERT INTO permission_method
    (subsystem_id, class_id, method_id, profile_id, allowed)
SELECT c.subsystem_id, c.id, m.id, p.id, g.allowed
FROM "class" c
INNER JOIN method m    ON m.class_id = c.id
INNER JOIN subsystem s ON s.id = c.subsystem_id AND s.name = 'Nomina'
INNER JOIN profiles p  ON p.name = 'viewer'
INNER JOIN grants g    ON g.class_name = c.name AND g.method_name = m.name
ON CONFLICT (subsystem_id, class_id, method_id, profile_id) DO NOTHING;

INSERT INTO permission_option
    (subsystem_id, option_id, profile_id, allowed)
SELECT o.subsystem_id, o.id, p.id, TRUE
FROM "option" o
INNER JOIN subsystem s ON s.id = o.subsystem_id AND s.name = 'Nomina'
INNER JOIN profiles p  ON p.name = 'admin'
ON CONFLICT (subsystem_id, option_id, profile_id) DO NOTHING;

INSERT INTO permission_option
    (subsystem_id, option_id, profile_id, allowed)
SELECT o.subsystem_id, o.id, p.id, TRUE
FROM "option" o
INNER JOIN subsystem s ON s.id = o.subsystem_id AND s.name = 'Nomina'
INNER JOIN profiles p  ON p.name = 'editor'
ON CONFLICT (subsystem_id, option_id, profile_id) DO NOTHING;

WITH grants(option_name, allowed) AS (
    VALUES
        ('empleados',         TRUE),
        ('salarios',          TRUE),
        ('prenomina',         TRUE),
        ('nomina_definitiva', TRUE)
)
INSERT INTO permission_option
    (subsystem_id, option_id, profile_id, allowed)
SELECT o.subsystem_id, o.id, p.id, g.allowed
FROM "option" o
INNER JOIN subsystem s ON s.id = o.subsystem_id AND s.name = 'Nomina'
INNER JOIN profiles p  ON p.name = 'viewer'
INNER JOIN grants g    ON g.option_name = o.name
ON CONFLICT (subsystem_id, option_id, profile_id) DO NOTHING;

COMMIT;
