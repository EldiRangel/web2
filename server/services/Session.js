const bcrypt    = require('bcrypt');
const userModel = require('../models/userModel');
const crypto    = require('crypto');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES     = 15;

const Session = {

    async ListProfiles() {
        const rows = await userModel.listProfiles();
        return {
            success: true,
            profiles: rows.map(p => ({
                id:          p.id,
                name:        p.name,
                description: p.description
            }))
        };
    },

 
    async Register({ name, email, password, profiles }) {
        if (!name || !email || !password) {
            return { success: false, message: 'Nombre, email y contrasena son obligatorios' };
        }
        if (typeof name !== 'string' || name.trim().length < 2) {
            return { success: false, message: 'El nombre debe tener al menos 2 caracteres' };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { success: false, message: 'El email no tiene un formato valido' };
        }

        if (password.length < 6) {
            return { success: false, message: 'La contrasena debe tener al menos 6 caracteres' };
        }

        
        if (!Array.isArray(profiles) || profiles.length === 0) {
            return {
                success: false,
                message: 'Debes seleccionar al menos un perfil.'
            };
        }

       
        const perfilesValidos = await userModel.findProfilesByNames(profiles);
        if (perfilesValidos.length !== profiles.length) {
            const encontrados = perfilesValidos.map(p => p.name);
            const noEncontrados = profiles.filter(p => !encontrados.includes(p));
            return {
                success: false,
                message: `Perfiles invalidos: ${noEncontrados.join(', ')}`,
                validProfiles: encontrados
            };
        }
       
        const existing = await userModel.findByEmail(email);
        if (existing) {
            return { success: false, message: 'El email ya esta registrado' };
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await userModel.createUser({
            name:  name.trim(),
            email: email.toLowerCase().trim(),
            passwordHash
        });

        await userModel.attachProfiles(newUser.id, profiles);

        const profileRows = await userModel.getProfilesByUserId(newUser.id);

        return {
            success: true,
            message: 'Usuario registrado correctamente',
            user: {
                UserID: newUser.id,
                Name:   newUser.name,
                Profile: profileRows.map(p => ({
                    id:          p.id,
                    name:        p.name,
                    description: p.description
                }))
            }
        };
    },

    async Authenticate(userName, password) {
        if (!userName || !password) {
            return { success: false, message: 'Usuario y contrasena son obligatorios' };
        }

        const user = await userModel.findByEmail(userName);
        if (!user || user.active !== true) {
            return { success: false, message: 'Credenciales invalidas' };
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return { success: false, message: 'Credenciales invalidas' };
        }

        const profiles = await userModel.getProfilesByUserId(user.id);

        return {
            success: true,
            user: {
                UserID: user.id,
                Name:   user.name,
                Profile: profiles.map(p => ({
                    id:          p.id,
                    name:        p.name,
                    description: p.description
                }))
            }
        };
    },

    CreateSession(req, sessionObject) {
        return new Promise((resolve, reject) => {
            req.session.regenerate((err) => {
                if (err) return reject(err);

                req.session.user = {
                    UserID:  sessionObject.UserID,
                    Name:    sessionObject.Name,
                    Profile: Array.isArray(sessionObject.Profile) ? sessionObject.Profile : []
                };

                // (Re)generar token CSRF para la nueva sesion
                req.session.csrfToken = crypto.randomBytes(32).toString('hex');

                req.session.save((err2) => {
                    if (err2) return reject(err2);
                    resolve({ success: true, message: 'Sesion creada correctamente' });
                });
            });
        });
    },

    CloseSession(req, res) {
        return new Promise((resolve, reject) => {
            if (!req.session) {
                return resolve({ success: true, message: 'No habia sesion activa' });
            }
            req.session.destroy((err) => {
                if (err) return reject(err);
                res.clearCookie(process.env.SESSION_COOKIE_NAME || 'sid', { path: '/' });
                resolve({ success: true, message: 'Sesion cerrada correctamente' });
            });
        });
    },

    GetSession(req) {
        if (!req.session || !req.session.user) return null;
        const { UserID, Name, Profile } = req.session.user;
        return {
            UserID,
            Name,
            Profile: Array.isArray(Profile) ? Profile : []
        };
    },

    // ------------------------------------------------------------------
    // Usuario (auxiliares para JWT y bloqueo)
    // ------------------------------------------------------------------
    async FindUserByEmail(email) {
        return userModel.findByEmail(email);
    },

    async FindUserById(pool, id) {
        return userModel.findById(id);
    },

    async GetProfilesByUserId(userId) {
        return userModel.getProfilesByUserId(userId);
    },

    // ------------------------------------------------------------------
    // Bloqueo por intentos fallidos
    // ------------------------------------------------------------------
    async IsUserLocked(pool, userId) {
        const row = await pool.query(
            `SELECT locked_until FROM users WHERE id = $1`,
            [userId]
        );
        if (!row.rows[0]) return false;
        const lockedUntil = row.rows[0].locked_until;
        return lockedUntil && new Date(lockedUntil) > new Date();
    },

    async RecordLoginAttempt(pool, email, ip, success) {
        try {
            await pool.query(
                `INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)`,
                [email, ip, success]
            );
        } catch (err) {
            console.error('[Session.RecordLoginAttempt]', err);
        }
    },

    async IncrementFailedAttempts(pool, userId) {
        const row = await pool.query(
            `SELECT failed_login_attempts FROM users WHERE id = $1`,
            [userId]
        );
        const current = row.rows[0] ? row.rows[0].failed_login_attempts : 0;
        const next = current + 1;

        if (next >= MAX_FAILED_ATTEMPTS) {
            const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
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

    async ResetFailedAttempts(pool, userId) {
        await pool.query(
            `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
            [userId]
        );
    },

    // ------------------------------------------------------------------
    // Refresh tokens JWT
    // ------------------------------------------------------------------
    async SaveRefreshToken(pool, userId, token, ttl) {
        const ms = this._parseTtlMs(ttl) || 7 * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + ms);
        await pool.query(
            `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
            [userId, token, expiresAt]
        );
    },

    async FindRefreshToken(pool, token) {
        const result = await pool.query(
            `SELECT id, user_id, token, expires_at, revoked FROM refresh_tokens WHERE token = $1`,
            [token]
        );
        return result.rows[0] || null;
    },

    async RevokeRefreshToken(pool, token) {
        await pool.query(
            `UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1`,
            [token]
        );
    },

    async RevokeAllRefreshTokens(pool, userId) {
        await pool.query(
            `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`,
            [userId]
        );
    },

    _parseTtlMs(ttl) {
        if (!ttl) return null;
        const match = String(ttl).match(/^(\d+)(m|h|d)$/);
        if (!match) return null;
        const value = parseInt(match[1], 10);
        const unit = match[2];
        if (unit === 'm') return value * 60 * 1000;
        if (unit === 'h') return value * 60 * 60 * 1000;
        if (unit === 'd') return value * 24 * 60 * 60 * 1000;
        return null;
    },

    // ------------------------------------------------------------------
    // Recuperacion de contrasena
    // ------------------------------------------------------------------
    async SavePasswordRecovery(pool, userId, token, expiresAt) {
        await pool.query(
            `INSERT INTO password_recovery (user_id, token, expires_at) VALUES ($1, $2, $3)`,
            [userId, token, expiresAt]
        );
    },

    async VerifyPasswordRecovery(pool, token) {
        const result = await pool.query(
            `SELECT id, user_id, expires_at, used FROM password_recovery WHERE token = $1`,
            [token]
        );
        const row = result.rows[0];
        if (!row || row.used) return false;
        if (new Date(row.expires_at) < new Date()) return false;
        return true;
    },

    async ResetPasswordWithToken(pool, token, password) {
        const result = await pool.query(
            `SELECT id, user_id, expires_at, used FROM password_recovery WHERE token = $1`,
            [token]
        );
        const row = result.rows[0];
        if (!row || row.used) {
            return { success: false, message: 'Token invalido o ya utilizado.' };
        }
        if (new Date(row.expires_at) < new Date()) {
            return { success: false, message: 'Token expirado.' };
        }

        const passwordHash = await bcrypt.hash(password, 10);

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

        return { success: true, userId: row.user_id };
    }

};

module.exports = Session;


