'use strict';

const SecurityRepository = require('../repositories/SecurityRepository');
const PermissionMethodMap = require('./PermissionMethodMap');
const PermissionOptionMap = require('./PermissionOptionMap');
const {
    buildPermissionMethodKey,
    buildPermissionOptionKey,
    isValidPermissionMethodKey,
    isValidPermissionOptionKey,
    normalizePositiveInteger,
    validatePermissionValue
} = require('./permissionKeys');
const {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError
} = require('../errors/AppError');

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

/**
 * Motor de autorizacion del sistema.
 *
 * Politica de multiples perfiles:
 *   - Denegacion por defecto: sin una concesion explicita no se autoriza.
 *   - Denegacion prevalente: si cualquier perfil activo del usuario tiene
 *     allowed = false para la combinacion, la operacion se rechaza aunque
 *     otro perfil la conceda.
 *   - Basta una concesion explicita (allowed = true) de un perfil activo
 *     para autorizar, siempre que no exista una denegacion explicita.
 *   - La ausencia de fila no concede ni deniega: simplemente no suma.
 *
 * Vigencia de los mapas:
 *   - Los mapas son una vista en memoria que se actualiza en cada ejecucion.
 *   - La decision de autorizacion SIEMPRE se toma con los datos leidos de
 *     PostgreSQL en esa misma solicitud, por lo que una revocacion se aplica
 *     de inmediato aunque el mapa tuviera un valor anterior.
 */
class Security {
    constructor({ repository = new SecurityRepository(), methodRegistry = null } = {}) {
        this.repository = repository;
        this.methodRegistry = methodRegistry;
        this.permissionMethodMap = new PermissionMethodMap();
        this.permissionOptionMap = new PermissionOptionMap();
    }

    getPermissionMethod(key) {
        if (!isValidPermissionMethodKey(key)) {
            return false;
        }
        return this.permissionMethodMap.get(key) === true;
    }

    getPermissionOption(key) {
        if (!isValidPermissionOptionKey(key)) {
            return false;
        }
        return this.permissionOptionMap.get(key) === true;
    }

    addPermissionMethod(key, value) {
        this.permissionMethodMap.add(key, value);
        return this;
    }

    addPermissionOption(key, value) {
        this.permissionOptionMap.add(key, value);
        return this;
    }

    setPermissionMethod(key, value) {
        this.permissionMethodMap.set(key, value);
        return this;
    }

    setPermissionOption(key, value) {
        this.permissionOptionMap.set(key, value);
        return this;
    }

    /**
     * Recarga todos los permisos vigentes de un usuario. Se puede invocar
     * despues de un cambio administrativo, aunque execMethod no depende de
     * esta llamada porque revalida contra PostgreSQL.
     */
    async refreshUserPermissions(userId) {
        const id = normalizePositiveInteger(userId, 'userId');
        const user = await this.repository.getUserSecurityContext(id);
        this._assertActiveUser(user);

        const profiles = await this._getActiveProfiles(id);
        const profileIds = new Set(profiles.map(profile => profile.id));

        for (const profileId of profileIds) {
            this.permissionMethodMap.removeProfile(profileId);
            this.permissionOptionMap.removeProfile(profileId);
        }

        const [methodRows, optionRows] = await Promise.all([
            this.repository.getAllMethodPermissionsForUser(id),
            this.repository.getAllOptionPermissionsForUser(id)
        ]);

        let methodCount = 0;
        for (const row of methodRows || []) {
            const profileId = normalizePositiveInteger(row.profile_id, 'profileId');
            if (!profileIds.has(profileId)) {
                continue;
            }

            const key = buildPermissionMethodKey(
                row.subsystem_id,
                row.class_id,
                row.method_id,
                profileId
            );
            this.setPermissionMethod(key, validatePermissionValue(row.allowed));
            methodCount += 1;
        }

        let optionCount = 0;
        for (const row of optionRows || []) {
            const profileId = normalizePositiveInteger(row.profile_id, 'profileId');
            if (!profileIds.has(profileId)) {
                continue;
            }

            const key = buildPermissionOptionKey(
                row.subsystem_id,
                row.option_id,
                profileId
            );
            this.setPermissionOption(key, validatePermissionValue(row.allowed));
            optionCount += 1;
        }

        return {
            userId: id,
            profiles: profiles.map(profile => ({ id: profile.id, name: profile.name })),
            methodPermissions: methodCount,
            optionPermissions: optionCount
        };
    }

    /**
     * Valida, autoriza y ejecuta una operacion de negocio.
     *
     * `context` lo construye el servidor a partir de la sesion de Express
     * Session. El cliente no puede aportar un userId o un perfil confiable.
     */
    async execMethod(json, context) {
        const request = this._validateRequest(json);
        const userId = this._validateContext(context);

        const user = await this.repository.getUserSecurityContext(userId);
        this._assertActiveUser(user);

        const profiles = await this._getActiveProfiles(userId);
        const operation = await this._getOperation(request);

        const permissionRows = await this.repository.getMethodPermissionsForUser(
            userId,
            request.subsystemId,
            request.classId,
            request.methodId
        );

        const decisions = this._applyMethodPermissions(profiles, request, permissionRows || []);
        const explicitlyDenied = [...decisions.values()].some(value => value === false);
        const explicitlyGranted = [...decisions.values()].some(value => value === true);

        if (explicitlyDenied || !explicitlyGranted) {
            throw new ForbiddenError('No tienes permiso para ejecutar esta operacion.');
        }

        const handler = this._resolveHandler(operation);

        let params;
        try {
            params = handler.validate ? handler.validate(request.params) : request.params;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new ValidationError('Los parametros de la operacion no son validos.');
        }

        if (params === undefined || params === null) {
            params = {};
        }

        const executionContext = Object.freeze({
            userId,
            name: user.name,
            profiles: Object.freeze(
                profiles.map(profile => Object.freeze({
                    id: profile.id,
                    name: profile.name
                }))
            ),
            operation: Object.freeze({
                subsystemId: operation.subsystem_id,
                subsystem: operation.subsystem_name,
                classId: operation.class_id,
                className: operation.class_name,
                methodId: operation.method_id,
                method: operation.method_name
            }),
            security: this
        });

        return handler.execute(params, executionContext);
    }

    _validateRequest(json) {
        if (!isPlainObject(json)) {
            throw new ValidationError('La solicitud debe ser un objeto JSON.');
        }

        if (json.params !== undefined && !isPlainObject(json.params)) {
            throw new ValidationError('El campo "params" debe ser un objeto JSON.');
        }

        return {
            subsystemId: normalizePositiveInteger(json.subsystemId, 'subsystemId'),
            classId: normalizePositiveInteger(json.classId, 'classId'),
            methodId: normalizePositiveInteger(json.methodId, 'methodId'),
            params: json.params || {}
        };
    }

    _validateContext(context) {
        if (!isPlainObject(context)) {
            throw new UnauthorizedError();
        }

        const rawUserId = context.userId !== undefined ? context.userId : context.UserID;

        try {
            return normalizePositiveInteger(rawUserId, 'userId');
        } catch (error) {
            throw new UnauthorizedError('La sesion no contiene un usuario valido.');
        }
    }

    _assertActiveUser(user) {
        if (!user) {
            throw new UnauthorizedError('La sesion ya no corresponde a un usuario valido.');
        }

        if (user.active !== true) {
            throw new ForbiddenError('El usuario esta inactivo.');
        }

        if (user.person_id == null || user.person_active !== true) {
            throw new ForbiddenError('La persona asociada al usuario no esta activa.');
        }
    }

    async _getActiveProfiles(userId) {
        const rows = await this.repository.getActiveProfilesByUserId(userId);
        const unique = new Map();

        for (const row of rows || []) {
            if (!row || row.active === false) {
                continue;
            }

            const id = normalizePositiveInteger(row.id, 'profileId');
            unique.set(id, {
                id,
                name: row.name,
                description: row.description
            });
        }

        const profiles = [...unique.values()];
        if (profiles.length === 0) {
            throw new ForbiddenError('El usuario no tiene perfiles activos.');
        }

        return profiles;
    }

    async _getOperation({ subsystemId, classId, methodId }) {
        const operation = await this.repository.getOperation(subsystemId, classId, methodId);

        if (!operation) {
            throw new NotFoundError('La operacion solicitada no existe.');
        }

        if (
            operation.subsystem_active !== true ||
            operation.class_active !== true ||
            operation.method_active !== true
        ) {
            throw new ForbiddenError('La operacion esta inactiva.');
        }

        if (
            Number(operation.subsystem_id) !== subsystemId ||
            Number(operation.class_id) !== classId ||
            Number(operation.method_id) !== methodId
        ) {
            throw new NotFoundError('La combinacion de subsistema, clase y metodo no es valida.');
        }

        return operation;
    }

    _applyMethodPermissions(profiles, request, rows) {
        const profileIds = new Set(profiles.map(profile => profile.id));
        const decisions = new Map();

        for (const row of rows) {
            const profileId = normalizePositiveInteger(row.profile_id, 'profileId');
            if (!profileIds.has(profileId)) {
                continue;
            }

            const allowed = validatePermissionValue(row.allowed);
            if (decisions.has(profileId)) {
                // Ante filas contradictorias (no deberian existir por la PK),
                // la denegacion prevalece.
                decisions.set(profileId, decisions.get(profileId) && allowed);
            } else {
                decisions.set(profileId, allowed);
            }
        }

        for (const profileId of profileIds) {
            const key = buildPermissionMethodKey(
                request.subsystemId,
                request.classId,
                request.methodId,
                profileId
            );

            if (decisions.has(profileId)) {
                this.permissionMethodMap.set(key, decisions.get(profileId));
            } else {
                // Limpia cualquier valor previo: no debe sobrevivir una
                // concesion que ya no existe en PostgreSQL.
                this.permissionMethodMap.delete(key);
            }
        }

        return decisions;
    }

    _resolveHandler(operation) {
        if (!this.methodRegistry || typeof this.methodRegistry.resolve !== 'function') {
            throw new NotFoundError('La operacion no esta registrada en el servidor.');
        }

        const handler = this.methodRegistry.resolve(
            operation.subsystem_name,
            operation.class_name,
            operation.method_name
        );

        if (!handler || typeof handler.execute !== 'function') {
            throw new NotFoundError('La operacion no esta registrada en el servidor.');
        }

        return handler;
    }
}

module.exports = Security;
