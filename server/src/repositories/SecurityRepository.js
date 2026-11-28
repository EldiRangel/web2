'use strict';

const pool = require('../../config/database');
const { DatabaseError } = require('../errors/AppError');
const {
    normalizePositiveInteger,
    validatePermissionValue
} = require('../security/permissionKeys');

class SecurityRepository {
    constructor({ db = pool } = {}) {
        this.db = db;
    }

    async _query(sql, params) {
        try {
            return await this.db.query(sql, params);
        } catch (error) {
            
            throw new DatabaseError(error);
        }
    }

    async getUserSecurityContext(userId) {
        const id = normalizePositiveInteger(userId, 'userId');
        const result = await this._query(
            `SELECT u.id,
                    u.person_id,
                    u.name,
                    u.email,
                    u.active,
                    p.id     AS person_id_joined,
                    p.active AS person_active
             FROM users u
             LEFT JOIN person p ON p.id = u.person_id
             WHERE u.id = $1`,
            [id]
        );

        return result.rows[0] || null;
    }

    async getActiveProfilesByUserId(userId) {
        const id = normalizePositiveInteger(userId, 'userId');
        const result = await this._query(
            `SELECT p.id, p.name, p.description, p.active
             FROM user_profiles up
             INNER JOIN profiles p ON p.id = up.profile_id
             INNER JOIN users u    ON u.id = up.user_id
             WHERE up.user_id = $1
               AND up.active = TRUE
               AND p.active = TRUE
               AND u.active = TRUE
             ORDER BY p.id`,
            [id]
        );

        return result.rows;
    }

    async getOperation(subsystemId, classId, methodId) {
        const sId = normalizePositiveInteger(subsystemId, 'subsystemId');
        const cId = normalizePositiveInteger(classId, 'classId');
        const mId = normalizePositiveInteger(methodId, 'methodId');

        const result = await this._query(
            `SELECT s.id     AS subsystem_id,
                    s.name   AS subsystem_name,
                    s.active AS subsystem_active,
                    c.id     AS class_id,
                    c.name   AS class_name,
                    c.active AS class_active,
                    m.id     AS method_id,
                    m.name   AS method_name,
                    m.active AS method_active
             FROM subsystem s
             INNER JOIN "class" c ON c.subsystem_id = s.id AND c.id = $2
             INNER JOIN method  m ON m.class_id = c.id AND m.id = $3
             WHERE s.id = $1`,
            [sId, cId, mId]
        );

        return result.rows[0] || null;
    }

    async getMethodPermissionsForUser(userId, subsystemId, classId, methodId) {
        const uId = normalizePositiveInteger(userId, 'userId');
        const sId = normalizePositiveInteger(subsystemId, 'subsystemId');
        const cId = normalizePositiveInteger(classId, 'classId');
        const mId = normalizePositiveInteger(methodId, 'methodId');

        const result = await this._query(
            `SELECT pm.profile_id, pm.allowed
             FROM permission_method pm
             INNER JOIN user_profiles up ON up.profile_id = pm.profile_id
             INNER JOIN profiles p       ON p.id = pm.profile_id
             INNER JOIN users u          ON u.id = up.user_id
             WHERE up.user_id = $1
               AND up.active = TRUE
               AND p.active = TRUE
               AND u.active = TRUE
               AND pm.subsystem_id = $2
               AND pm.class_id = $3
               AND pm.method_id = $4
             ORDER BY pm.profile_id`,
            [uId, sId, cId, mId]
        );

        return result.rows;
    }

    async getAllMethodPermissionsForUser(userId) {
        const uId = normalizePositiveInteger(userId, 'userId');
        const result = await this._query(
            `SELECT pm.subsystem_id,
                    pm.class_id,
                    pm.method_id,
                    pm.profile_id,
                    pm.allowed
             FROM permission_method pm
             INNER JOIN user_profiles up ON up.profile_id = pm.profile_id
             INNER JOIN profiles p       ON p.id = pm.profile_id
             INNER JOIN users u          ON u.id = up.user_id
             INNER JOIN subsystem s      ON s.id = pm.subsystem_id
             INNER JOIN "class" c        ON c.id = pm.class_id AND c.subsystem_id = pm.subsystem_id
             INNER JOIN method m         ON m.id = pm.method_id AND m.class_id = pm.class_id
             WHERE up.user_id = $1
               AND up.active = TRUE
               AND p.active = TRUE
               AND u.active = TRUE
               AND s.active = TRUE
               AND c.active = TRUE
               AND m.active = TRUE
             ORDER BY pm.subsystem_id, pm.class_id, pm.method_id, pm.profile_id`,
            [uId]
        );

        return result.rows;
    }

    async getOptionPermissionsForUser(userId, subsystemId) {
        const uId = normalizePositiveInteger(userId, 'userId');
        const sId = normalizePositiveInteger(subsystemId, 'subsystemId');

        const result = await this._query(
            `SELECT po.option_id, po.profile_id, po.allowed
             FROM permission_option po
             INNER JOIN user_profiles up ON up.profile_id = po.profile_id
             INNER JOIN profiles p       ON p.id = po.profile_id
             INNER JOIN users u          ON u.id = up.user_id
             INNER JOIN subsystem s      ON s.id = po.subsystem_id
             INNER JOIN "option" o       ON o.id = po.option_id AND o.subsystem_id = po.subsystem_id
             WHERE up.user_id = $1
               AND up.active = TRUE
               AND p.active = TRUE
               AND u.active = TRUE
               AND s.active = TRUE
               AND o.active = TRUE
               AND po.subsystem_id = $2
             ORDER BY po.profile_id, po.option_id`,
            [uId, sId]
        );

        return result.rows;
    }

    async getAllOptionPermissionsForUser(userId) {
        const uId = normalizePositiveInteger(userId, 'userId');
        const result = await this._query(
            `SELECT po.subsystem_id,
                    po.option_id,
                    po.profile_id,
                    po.allowed
             FROM permission_option po
             INNER JOIN user_profiles up ON up.profile_id = po.profile_id
             INNER JOIN profiles p       ON p.id = po.profile_id
             INNER JOIN users u          ON u.id = up.user_id
             INNER JOIN subsystem s      ON s.id = po.subsystem_id
             INNER JOIN "option" o       ON o.id = po.option_id AND o.subsystem_id = po.subsystem_id
             WHERE up.user_id = $1
               AND up.active = TRUE
               AND p.active = TRUE
               AND u.active = TRUE
               AND s.active = TRUE
               AND o.active = TRUE
             ORDER BY po.subsystem_id, po.option_id, po.profile_id`,
            [uId]
        );

        return result.rows;
    }

    /**
     * Operaciones de administracion para codigo de confianza (scripts o un
     * futuro panel administrativo). No estan expuestas por HTTP.
     */
    async upsertMethodPermission({ subsystemId, classId, methodId, profileId, allowed }) {
        const params = [
            normalizePositiveInteger(subsystemId, 'subsystemId'),
            normalizePositiveInteger(classId, 'classId'),
            normalizePositiveInteger(methodId, 'methodId'),
            normalizePositiveInteger(profileId, 'profileId'),
            validatePermissionValue(allowed)
        ];

        const result = await this._query(
            `INSERT INTO permission_method
                 (subsystem_id, class_id, method_id, profile_id, allowed, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (subsystem_id, class_id, method_id, profile_id)
             DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = CURRENT_TIMESTAMP
             RETURNING subsystem_id, class_id, method_id, profile_id, allowed, updated_at`,
            params
        );

        return result.rows[0];
    }

    async upsertOptionPermission({ subsystemId, optionId, profileId, allowed }) {
        const params = [
            normalizePositiveInteger(subsystemId, 'subsystemId'),
            normalizePositiveInteger(optionId, 'optionId'),
            normalizePositiveInteger(profileId, 'profileId'),
            validatePermissionValue(allowed)
        ];

        const result = await this._query(
            `INSERT INTO permission_option
                 (subsystem_id, option_id, profile_id, allowed, updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (subsystem_id, option_id, profile_id)
             DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = CURRENT_TIMESTAMP
             RETURNING subsystem_id, option_id, profile_id, allowed, updated_at`,
            params
        );

        return result.rows[0];
    }

    async deleteMethodPermission({ subsystemId, classId, methodId, profileId }) {
        const result = await this._query(
            `DELETE FROM permission_method
             WHERE subsystem_id = $1
               AND class_id = $2
               AND method_id = $3
               AND profile_id = $4`,
            [
                normalizePositiveInteger(subsystemId, 'subsystemId'),
                normalizePositiveInteger(classId, 'classId'),
                normalizePositiveInteger(methodId, 'methodId'),
                normalizePositiveInteger(profileId, 'profileId')
            ]
        );

        return result.rowCount > 0;
    }

    async deleteOptionPermission({ subsystemId, optionId, profileId }) {
        const result = await this._query(
            `DELETE FROM permission_option
             WHERE subsystem_id = $1
               AND option_id = $2
               AND profile_id = $3`,
            [
                normalizePositiveInteger(subsystemId, 'subsystemId'),
                normalizePositiveInteger(optionId, 'optionId'),
                normalizePositiveInteger(profileId, 'profileId')
            ]
        );

        return result.rowCount > 0;
    }
}

module.exports = SecurityRepository;
