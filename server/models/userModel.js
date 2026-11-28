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
    },

    // ------------------------------------------------------------------
    // Refresh tokens JWT
    // ------------------------------------------------------------------
    async saveRefreshToken(userId, token, expiresAt) {
        await pool.query(
            `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
            [userId, token, expiresAt]
        );
    },

    async findRefreshToken(token) {
        const result = await pool.query(
            `SELECT id, user_id, token, expires_at, revoked FROM refresh_tokens WHERE token = $1`,
            [token]
        );
        return result.rows[0] || null;
    },

    async revokeRefreshToken(token) {
        await pool.query(
            `UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1`,
            [token]
        );
    },

    async revokeAllRefreshTokens(userId) {
        await pool.query(
            `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`,
            [userId]
        );
    },

    // ------------------------------------------------------------------
    // Recuperacion de contrasena
    // ------------------------------------------------------------------
    async savePasswordRecovery(userId, token, expiresAt) {
        await pool.query(
            `INSERT INTO password_recovery (user_id, token, expires_at) VALUES ($1, $2, $3)`,
            [userId, token, expiresAt]
        );
    },

    async verifyPasswordRecovery(token) {
        const result = await pool.query(
            `SELECT id, user_id, expires_at, used FROM password_recovery WHERE token = $1`,
            [token]
        );
        return result.rows[0] || null;
    },

    async resetPasswordWithToken(token, passwordHash) {
        const result = await pool.query(
            `SELECT id, user_id, expires_at, used FROM password_recovery WHERE token = $1`,
            [token]
        );
        const row = result.rows[0];
        if (!row || row.used) return null;
        if (new Date(row.expires_at) < new Date()) return null;

        await pool.query('BEGIN');
        try {
            await pool.query(
                `UPDATE users SET password = $1 WHERE id = $2`,
                [passwordHash, row.user_id]
            );
            await pool.query(
                `UPDATE password_recovery SET used = TRUE WHERE id = $1`,
                [row.id]
            );
            await pool.query('COMMIT');
        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

        return row.user_id;
    },

    // ------------------------------------------------------------------
    // Intento de login (bloqueo por fuerza bruta)
    // ------------------------------------------------------------------
    async recordLoginAttempt(email, ip, success) {
        try {
            await pool.query(
                `INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)`,
                [email, ip, success]
            );
        } catch (err) {
            console.error('[userModel.recordLoginAttempt]', err);
        }
    },

    async incrementFailedAttempts(userId) {
        const row = await pool.query(
            `SELECT failed_login_attempts FROM users WHERE id = $1`,
            [userId]
        );
        const current = row.rows[0] ? row.rows[0].failed_login_attempts : 0;
        const next = current + 1;

        if (next >= 5) {
            const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            await pool.query(
                `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
                [next, lockedUntil, userId]
            );
        } else {
            await pool.query(
                `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
                [next, userId]
            );
        }
    },

    async resetFailedAttempts(userId) {
        await pool.query(
            `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
            [userId]
        );
    },

    async isUserLocked(userId) {
        const row = await pool.query(
            `SELECT locked_until FROM users WHERE id = $1`,
            [userId]
        );
        if (!row.rows[0]) return false;
        const lockedUntil = row.rows[0].locked_until;
        return lockedUntil && new Date(lockedUntil) > new Date();
    }
};

module.exports = userModel;
