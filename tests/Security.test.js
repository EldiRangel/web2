'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const Security = require('../server/src/security/Security');
const SecurityRepository = require('../server/src/repositories/SecurityRepository');
const MethodRegistry = require('../server/src/dispatcher/MethodRegistry');
const {
    buildPermissionMethodKey,
    buildPermissionOptionKey
} = require('../server/src/security/permissionKeys');
const { ValidationError } = require('../server/src/errors/AppError');

const OPS = {
    listar: {
        subsystem_id: 1,
        subsystem_name: 'Nomina',
        subsystem_active: true,
        class_id: 2,
        class_name: 'Empleados',
        class_active: true,
        method_id: 3,
        method_name: 'listar',
        method_active: true
    },
    consultar: {
        subsystem_id: 1,
        subsystem_name: 'Nomina',
        subsystem_active: true,
        class_id: 2,
        class_name: 'Empleados',
        class_active: true,
        method_id: 4,
        method_name: 'consultar',
        method_active: true
    },
    prenomina: {
        subsystem_id: 1,
        subsystem_name: 'Nomina',
        subsystem_active: true,
        class_id: 5,
        class_name: 'Prenomina',
        class_active: true,
        method_id: 6,
        method_name: 'calcular',
        method_active: true
    }
};

function operationKey(op) {
    return `${op.subsystem_id}_${op.class_id}_${op.method_id}`;
}

function operationRequest(op, params = {}) {
    return {
        subsystemId: op.subsystem_id,
        classId: op.class_id,
        methodId: op.method_id,
        params
    };
}

function statusIs(status, code = null) {
    return error => {
        assert.equal(error.status, status);
        if (code) {
            assert.equal(error.code, code);
        }
        return true;
    };
}

class FakeRepository {
    constructor() {
        this.user = {
            id: 1,
            person_id: 1,
            name: 'Usuario de prueba',
            active: true,
            person_active: true
        };
        this.profiles = [{ id: 10, name: 'admin', active: true }];
        this.operations = new Map();
        this.methodPermissions = [];
        this.optionPermissions = [];
    }

    async getUserSecurityContext(userId) {
        if (!this.user || this.user.id !== userId) {
            return null;
        }
        return { ...this.user };
    }

    async getActiveProfilesByUserId() {
        return this.profiles
            .filter(profile => profile.active !== false)
            .map(profile => ({ ...profile }));
    }

    async getOperation(subsystemId, classId, methodId) {
        return this.operations.get(`${subsystemId}_${classId}_${methodId}`) || null;
    }

    async getMethodPermissionsForUser(_userId, subsystemId, classId, methodId) {
        return this.methodPermissions.filter(row => (
            row.subsystem_id === subsystemId &&
            row.class_id === classId &&
            row.method_id === methodId
        ));
    }

    async getAllMethodPermissionsForUser() {
        return this.methodPermissions;
    }

    async getOptionPermissionsForUser(_userId, subsystemId) {
        return this.optionPermissions.filter(row => row.subsystem_id === subsystemId);
    }

    async getAllOptionPermissionsForUser() {
        return this.optionPermissions;
    }
}

function createHarness(overrides = {}) {
    const repository = new FakeRepository();

    if (overrides.user !== undefined) {
        repository.user = overrides.user;
    }
    if (overrides.profiles !== undefined) {
        repository.profiles = overrides.profiles;
    }

    for (const operation of Object.values(OPS)) {
        const row = { ...operation };
        repository.operations.set(operationKey(row), row);
    }

    if (overrides.methodPermissions) {
        repository.methodPermissions = overrides.methodPermissions;
    }
    if (overrides.optionPermissions) {
        repository.optionPermissions = overrides.optionPermissions;
    }

    const registry = new MethodRegistry();

    registry.register({
        subsystem: 'Nomina',
        className: 'Empleados',
        method: 'listar',
        validate: params => ({ estado: params.estado || 'ACTIVO' }),
        execute: (params, context) => ({
            operacion: 'Empleados.listar',
            params,
            userId: context.userId
        })
    });

    registry.register({
        subsystem: 'Nomina',
        className: 'Empleados',
        method: 'consultar',
        validate: params => {
            if (!Number.isSafeInteger(params.empleadoId) || params.empleadoId <= 0) {
                throw new ValidationError('El campo empleadoId es obligatorio.');
            }
            return { empleadoId: params.empleadoId };
        },
        execute: params => ({ operacion: 'Empleados.consultar', params })
    });

    registry.register({
        subsystem: 'Nomina',
        className: 'Prenomina',
        method: 'calcular',
        validate: params => {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(params.periodo || '')) {
                throw new ValidationError('El periodo debe tener formato YYYY-MM.');
            }
            return { periodo: params.periodo };
        },
        execute: params => ({ operacion: 'Prenomina.calcular', params })
    });

    const security = new Security({ repository, methodRegistry: registry });
    return { repository, registry, security };
}

function grant(repository, op, profileId, allowed = true) {
    repository.methodPermissions.push({
        subsystem_id: op.subsystem_id,
        class_id: op.class_id,
        method_id: op.method_id,
        profile_id: profileId,
        allowed
    });
}

function setOperation(repository, op, overrides) {
    const row = { ...op, ...overrides };
    repository.operations.set(operationKey(op), row);
    return row;
}

test('los mapas son instancias de Map y validan claves y valores', () => {
    const { security } = createHarness();
    const methodKey = buildPermissionMethodKey(1, 2, 3, 10);
    const optionKey = buildPermissionOptionKey(1, 7, 10);

    assert.ok(security.permissionMethodMap instanceof Map);
    assert.ok(security.permissionOptionMap instanceof Map);

    assert.equal(security.getPermissionMethod(methodKey), false);
    assert.equal(security.getPermissionOption(optionKey), false);

    security.addPermissionMethod(methodKey, true);
    security.addPermissionOption(optionKey, false);

    assert.equal(security.getPermissionMethod(methodKey), true);
    assert.equal(security.getPermissionOption(optionKey), false);

    assert.throws(
        () => security.addPermissionMethod(methodKey, false),
        error => error.code === 'DUPLICATE_PERMISSION'
    );
    assert.throws(
        () => security.addPermissionOption(optionKey, true),
        error => error.code === 'DUPLICATE_PERMISSION'
    );

    security.setPermissionMethod(methodKey, false);
    assert.equal(security.getPermissionMethod(methodKey), false);

    assert.throws(
        () => security.setPermissionMethod(methodKey, 'true'),
        error => error.code === 'VALIDATION_ERROR'
    );
    assert.throws(
        () => security.addPermissionOption('1_7', true),
        error => error.code === 'VALIDATION_ERROR'
    );
    assert.equal(security.getPermissionMethod('clave-invalida'), false);
    assert.equal(security.getPermissionOption('1_7_0'), false);
});

test('autoriza a un usuario con concesion explicita y llena el mapa', async () => {
    const { security, repository } = createHarness();
    grant(repository, OPS.listar, 10, true);

    const result = await security.execMethod(
        operationRequest(OPS.listar, { estado: 'ACTIVO' }),
        { userId: 1 }
    );

    assert.equal(result.operacion, 'Empleados.listar');
    assert.equal(result.userId, 1);
    assert.equal(
        security.getPermissionMethod(buildPermissionMethodKey(1, 2, 3, 10)),
        true
    );
});

test('deniega por defecto cuando no existe permiso', async () => {
    const { security } = createHarness();

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403, 'FORBIDDEN')
    );
});

test('aplica denegacion prevalente entre varios perfiles', async () => {
    const { security, repository } = createHarness({
        profiles: [
            { id: 10, name: 'admin', active: true },
            { id: 20, name: 'viewer', active: true }
        ]
    });

    grant(repository, OPS.listar, 10, true);
    grant(repository, OPS.listar, 20, false);

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );

    assert.equal(
        security.getPermissionMethod(buildPermissionMethodKey(1, 2, 3, 10)),
        true
    );
    assert.equal(
        security.getPermissionMethod(buildPermissionMethodKey(1, 2, 3, 20)),
        false
    );
});

test('permite si un perfil concede y otro no tiene fila', async () => {
    const { security, repository } = createHarness({
        profiles: [
            { id: 10, name: 'admin', active: true },
            { id: 20, name: 'viewer', active: true }
        ]
    });

    grant(repository, OPS.listar, 10, true);

    const result = await security.execMethod(operationRequest(OPS.listar), { userId: 1 });
    assert.equal(result.operacion, 'Empleados.listar');
});

test('rechaza usuarios y personas inactivas', async () => {
    const inactiveUser = createHarness({
        user: { id: 1, person_id: 1, name: 'Inactivo', active: false, person_active: true }
    });
    grant(inactiveUser.repository, OPS.listar, 10, true);

    await assert.rejects(
        () => inactiveUser.security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );

    const inactivePerson = createHarness({
        user: { id: 1, person_id: 1, name: 'Inactivo', active: true, person_active: false }
    });
    grant(inactivePerson.repository, OPS.listar, 10, true);

    await assert.rejects(
        () => inactivePerson.security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );
});

test('rechaza un usuario sin persona activa vinculada', async () => {
    const { security, repository } = createHarness({
        user: {
            id: 1,
            person_id: null,
            name: 'Sin persona',
            active: true,
            person_active: null
        }
    });
    grant(repository, OPS.listar, 10, true);

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );
});

test('rechaza usuarios sin perfiles activos', async () => {
    const { security, repository } = createHarness({
        profiles: [{ id: 10, name: 'admin', active: false }]
    });
    grant(repository, OPS.listar, 10, true);

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );
});

test('rechaza metodos inexistentes, inactivos y combinaciones invalidas', async () => {
    const missing = createHarness();
    grant(missing.repository, OPS.consultar, 10, true);
    missing.repository.operations.delete(operationKey(OPS.consultar));

    await assert.rejects(
        () => missing.security.execMethod(operationRequest(OPS.consultar, { empleadoId: 1 }), { userId: 1 }),
        statusIs(404, 'NOT_FOUND')
    );

    const inactive = createHarness();
    grant(inactive.repository, OPS.listar, 10, true);
    setOperation(inactive.repository, OPS.listar, { method_active: false });

    await assert.rejects(
        () => inactive.security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );

    const invalidCombination = createHarness();
    grant(invalidCombination.repository, OPS.consultar, 10, true);
    setOperation(invalidCombination.repository, OPS.consultar, { class_id: 99 });

    await assert.rejects(
        () => invalidCombination.security.execMethod(
            operationRequest(OPS.consultar, { empleadoId: 1 }),
            { userId: 1 }
        ),
        statusIs(404, 'NOT_FOUND')
    );
});

test('rechaza solicitudes sin sesion o con contexto invalido', async () => {
    const { security } = createHarness();

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), null),
        statusIs(401, 'UNAUTHORIZED')
    );
    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), {}),
        statusIs(401, 'UNAUTHORIZED')
    );
    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 0 }),
        statusIs(401, 'UNAUTHORIZED')
    );
});

test('rechaza metodos que no estan registrados en el servidor', async () => {
    const { security, repository } = createHarness();
    grant(repository, OPS.listar, 10, true);
    setOperation(repository, OPS.listar, { method_name: 'noRegistrado' });

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(404, 'NOT_FOUND')
    );
});

test('la revocacion en PostgreSQL se aplica en la siguiente ejecucion', async () => {
    const { security, repository } = createHarness();
    grant(repository, OPS.listar, 10, true);

    await security.execMethod(operationRequest(OPS.listar), { userId: 1 });

    repository.methodPermissions = [];

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );
    assert.equal(
        security.getPermissionMethod(buildPermissionMethodKey(1, 2, 3, 10)),
        false
    );
});

test('un mapa local obsoleto no puede saltarse la revalidacion en base de datos', async () => {
    const { security, repository } = createHarness();
    grant(repository, OPS.listar, 10, true);

    await security.execMethod(operationRequest(OPS.listar), { userId: 1 });
    repository.methodPermissions = [];

    // Simula una modificacion indebida del mapa en memoria.
    security.setPermissionMethod(buildPermissionMethodKey(1, 2, 3, 10), true);

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.listar), { userId: 1 }),
        statusIs(403)
    );
    assert.equal(
        security.getPermissionMethod(buildPermissionMethodKey(1, 2, 3, 10)),
        false
    );
});

test('permite ejecutar dos operaciones distintas con el mismo Security', async () => {
    const { security, repository } = createHarness();
    grant(repository, OPS.listar, 10, true);
    grant(repository, OPS.consultar, 10, true);

    const listado = await security.execMethod(operationRequest(OPS.listar), { userId: 1 });
    const consulta = await security.execMethod(
        operationRequest(OPS.consultar, { empleadoId: 1 }),
        { userId: 1 }
    );

    assert.equal(listado.operacion, 'Empleados.listar');
    assert.equal(consulta.operacion, 'Empleados.consultar');
});

test('rechaza parametros invalidos despues de autorizar', async () => {
    const { security, repository } = createHarness();
    grant(repository, OPS.consultar, 10, true);

    await assert.rejects(
        () => security.execMethod(operationRequest(OPS.consultar, {}), { userId: 1 }),
        statusIs(400, 'VALIDATION_ERROR')
    );
    await assert.rejects(
        () => security.execMethod(
            { ...operationRequest(OPS.consultar), params: [] },
            { userId: 1 }
        ),
        statusIs(400, 'VALIDATION_ERROR')
    );
});

test('ignora identidad y perfiles enviados por el cliente', async () => {
    const { security } = createHarness();
    const methodKey = buildPermissionMethodKey(1, 2, 3, 10);

    // El mapa local dice true, pero PostgreSQL no tiene ninguna concesion.
    security.setPermissionMethod(methodKey, true);

    const request = {
        ...operationRequest(OPS.listar),
        userId: 999,
        profileId: 10,
        profiles: [{ id: 10, name: 'admin' }]
    };

    await assert.rejects(
        () => security.execMethod(request, {
            userId: 1,
            profiles: [{ id: 10, name: 'admin' }]
        }),
        statusIs(403)
    );
});

test('refreshUserPermissions carga y elimina permisos de opciones', async () => {
    const { security, repository } = createHarness();
    const key = buildPermissionOptionKey(1, 7, 10);

    repository.optionPermissions = [{
        subsystem_id: 1,
        option_id: 7,
        profile_id: 10,
        allowed: true
    }];

    const loaded = await security.refreshUserPermissions(1);
    assert.equal(loaded.optionPermissions, 1);
    assert.equal(security.getPermissionOption(key), true);

    repository.optionPermissions = [];
    await security.refreshUserPermissions(1);
    assert.equal(security.getPermissionOption(key), false);
});

test('el repositorio usa consultas parametrizadas y filtra registros activos', async () => {
    const calls = [];
    const fakeDb = {
        async query(sql, params) {
            calls.push({ sql, params });
            return { rows: [] };
        }
    };

    const repository = new SecurityRepository({ db: fakeDb });

    await repository.getMethodPermissionsForUser(1, 2, 3, 4);
    await repository.getOperation(1, 2, 3);

    assert.deepEqual(calls[0].params, [1, 2, 3, 4]);
    assert.match(calls[0].sql, /up\.active = TRUE/);
    assert.match(calls[0].sql, /p\.active = TRUE/);
    assert.match(calls[0].sql, /u\.active = TRUE/);
    assert.match(calls[0].sql, /\$1/);
    assert.match(calls[0].sql, /\$4/);

    assert.deepEqual(calls[1].params, [1, 2, 3]);
    assert.match(calls[1].sql, /INNER JOIN "class"/);
});

test('el repositorio oculta el detalle de errores de PostgreSQL', async () => {
    const failingDb = {
        async query() {
            throw new Error('relation users does not exist');
        }
    };

    const repository = new SecurityRepository({ db: failingDb });

    await assert.rejects(
        () => repository.getUserSecurityContext(1),
        error => {
            assert.equal(error.status, 500);
            assert.equal(error.code, 'DATABASE_ERROR');
            assert.equal(error.message, 'Error interno del servidor.');
            assert.ok(error.cause instanceof Error);
            return true;
        }
    );
});
