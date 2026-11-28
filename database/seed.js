require('dotenv').config();
const bcrypt = require('bcrypt');
const pool   = require('../server/config/database');

(async () => {
    try {
        const passwordPlano = 'password123';
        const hash = await bcrypt.hash(passwordPlano, 10);

        const usuarios = [
            { name: 'Ana Torres',   email: 'ana@example.com',   perfiles: ['admin','editor'] },
            { name: 'Bruno Lopez',  email: 'bruno@example.com', perfiles: ['editor'] },
            { name: 'Carla Mendez', email: 'carla@example.com', perfiles: ['viewer'] }
        ];

        for (const u of usuarios) {
            
            const personResult = await pool.query(
                `INSERT INTO person (name, email, active)
                 VALUES ($1, $2, TRUE)
                 ON CONFLICT (email) DO UPDATE
                 SET name = EXCLUDED.name, active = TRUE
                 RETURNING id`,
                [u.name, u.email]
            );

            const res = await pool.query(
                `INSERT INTO users (name, email, password, person_id, active)
                 VALUES ($1, $2, $3, $4, TRUE)
                 ON CONFLICT (email) DO UPDATE
                 SET name      = EXCLUDED.name,
                     password  = EXCLUDED.password,
                     person_id = EXCLUDED.person_id,
                     active    = TRUE
                 RETURNING id`,
                [u.name, u.email, hash, personResult.rows[0].id]
            );
            const userId = res.rows[0].id;

            await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [userId]);
            for (const pname of u.perfiles) {
                await pool.query(
                    `INSERT INTO user_profiles (user_id, profile_id, active)
                     SELECT $1, id, TRUE FROM profiles WHERE name = $2 AND active = TRUE
                     ON CONFLICT (user_id, profile_id)
                     DO UPDATE SET active = TRUE`,
                    [userId, pname]
                );
            }
        }

        console.log('Seed completado. Password demo:', passwordPlano);
    } catch (err) {
        console.error('Error en seed:', err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
