const pool = require('../config/database');

const userModel = {
    async findByEmail(email) {
        const result = await pool.query(
            `SELECT id, person_id, name, email, password, active, created_at
             FROM users
             WHERE email = $1`,
            [email]
        );
        return result.rows[0] || null;
    },

    async findById(id) {
        const result = await pool.query(
            `SELECT id, person_id, name, email, active, created_at
             FROM users
             WHERE id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async getProfilesByUserId(userId) {
        const result = await pool.query(
            `SELECT p.id, p.name, p.description
             FROM profiles p
             INNER JOIN user_profiles up ON up.profile_id = p.id
             WHERE up.user_id = $1
               AND up.active = TRUE
               AND p.active = TRUE
             ORDER BY p.id`,
            [userId]
        );
        return result.rows;
    },

  
    async listProfiles() {
        const result = await pool.query(
            `SELECT id, name, description
             FROM profiles
             WHERE active = TRUE
             ORDER BY id`
        );
        return result.rows;
    },

    
    async findProfilesByNames(names = []) {
        if (!names.length) return [];
        const result = await pool.query(
            `SELECT id, name, description
             FROM profiles
             WHERE name = ANY($1::text[])
               AND active = TRUE
             ORDER BY id`,
            [names]
        );
        return result.rows;
    },

    async createUser({ name, email, passwordHash }) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // person guarda la identidad natural; users conserva las
            // credenciales del login existente.
            const personResult = await client.query(
                `INSERT INTO person (name, email, active)
                 VALUES ($1, $2, TRUE)
                 RETURNING id`,
                [name, email]
            );

            const userResult = await client.query(
                `INSERT INTO users (name, email, password, person_id, active)
                 VALUES ($1, $2, $3, $4, TRUE)
                 RETURNING id, person_id, name, email, active, created_at`,
                [name, email, passwordHash, personResult.rows[0].id]
            );

            await client.query('COMMIT');
            return userResult.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    async attachProfiles(userId, profileNames = []) {
        if (!profileNames.length) return;
        await pool.query(
            `INSERT INTO user_profiles (user_id, profile_id, active)
             SELECT $1, id, TRUE
             FROM profiles
             WHERE name = ANY($2::text[])
               AND active = TRUE
             ON CONFLICT (user_id, profile_id)
             DO UPDATE SET active = TRUE`,
            [userId, profileNames]
        );
    }
};

module.exports = userModel;
