'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');

const Security = require('../server/src/security/Security');
const MethodRegistry = require('../server/src/dispatcher/MethodRegistry');
const { createDispatcherRouter } = require('../server/src/dispatcher/Server');
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
    fallar: {
        subsystem_id: 1,
        subsystem_name: 'Nomina',
        subsystem_active: true,
        class_id: 7,
        class_name: 'Fallos',
        class_active: true,
        method_id: 8,
        method_name: 'romper',
        method_active: true
    },
    desconocida: {
        subsystem_id: 1,
        subsystem_name: 'Nomina',
        subsystem_active: true,
        class_id: 9,
        class_name: 'Oculta',
        class_active: true,
        method_id: 10,
        method_name: 'noExiste',
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
    }

    async getUserSecurityContext(userId) {
        return this.user && this.user.id === userId ? { ...this.user } : null;
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

    async getAllOptionPermissionsForUser() {
        return [];
    }
}

const repository = new FakeRepository();
for (const operation of Object.values(OPS)) {
    repository.operations.set(operationKey(operation), { ...operation });
}

const defaultPermissions = Object.values(OPS).map(operation => ({
    subsystem_id: operation.subsystem_id,
    class_id: operation.class_id,
    method_id: operation.method_id,
    profile_id: 10,
    allowed: true
}));

const registry = new MethodRegistry();
registry.register({
    subsystem: 'Nomina',
    className: 'Empleados',
    method: 'listar',
    validate: params => ({ estado: params.estado || 'ACTIVO' }),
    execute: params => [{ id: 1, nombre: 'Empleado Demo Uno', estado: params.estado }]
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
    execute: params => ({ id: params.empleadoId, nombre: 'Empleado Demo Uno' })
});
registry.register({
    subsystem: 'Nomina',
    className: 'Fallos',
    method: 'romper',
    validate: () => ({}),
    execute: () => {
        throw new Error('fallo interno de prueba');
    }
});
// La operacion "Oculta.noExiste" existe en la base simulada, pero no aqui.

const security = new Security({ repository, methodRegistry: registry });

const app = express();
app.use(express.json());
app.use(session({
    name: 'test.sid',
    secret: 'test-secret-no-usar-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
}));

app.post('/test/login', (req, res, next) => {
    req.session.user = {
        UserID: req.body.userId,
        Name: 'Usuario de prueba',
        Profile: []
    };
    req.session.save(error => {
        if (error) return next(error);
        return res.json({ success: true });
    });
});

app.use('/api', createDispatcherRouter({ security }));

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
    if (error && error.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'JSON invalido' });
    }
    console.error('[Dispatcher.test]', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

let server;
let baseUrl;
let sessionCookie = '';

before(async () => {
    await new Promise((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', error => {
            if (error) return reject(error);
            return resolve();
        });
    });

    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const response = await fetch(`${baseUrl}/test/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 1 })
    });

    const setCookie = response.headers.get('set-cookie');
    assert.ok(setCookie, 'El login de prueba debe establecer una cookie de sesion');
    sessionCookie = setCookie.split(';')[0];
});

after(async () => {
    if (!server) return;
    if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
    }
    await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
    repository.user = {
        id: 1,
        person_id: 1,
        name: 'Usuario de prueba',
        active: true,
        person_active: true
    };
    repository.profiles = [{ id: 10, name: 'admin', active: true }];
    repository.methodPermissions = defaultPermissions.map(row => ({ ...row }));
});

async function dispatcherRequest(body, { withCookie = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (withCookie) {
        headers.Cookie = sessionCookie;
    }

    const response = await fetch(`${baseUrl}/api/dispatcher`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        // La respuesta no era JSON.
    }

    return { status: response.status, data };
}

test('rechaza el Dispatcher sin sesion autenticada', async () => {
    const response = await dispatcherRequest(
        operationRequest(OPS.listar),
        { withCookie: false }
    );

    assert.equal(response.status, 401);
    assert.equal(response.data.success, false);
});

test('ejecuta dos operaciones distintas mediante el mismo endpoint', async () => {
    const listado = await dispatcherRequest(
        operationRequest(OPS.listar, { estado: 'ACTIVO' })
    );
    assert.equal(listado.status, 200);
    assert.equal(listado.data.success, true);
    assert.ok(Array.isArray(listado.data.data));

    const consulta = await dispatcherRequest(
        operationRequest(OPS.consultar, { empleadoId: 1 })
    );
    assert.equal(consulta.status, 200);
    assert.equal(consulta.data.success, true);
    assert.equal(consulta.data.data.id, 1);
});

test('devuelve 403 cuando el usuario no tiene permiso', async () => {
    repository.methodPermissions = repository.methodPermissions.filter(row => (
        row.method_id !== OPS.listar.method_id
    ));

    const response = await dispatcherRequest(operationRequest(OPS.listar));

    assert.equal(response.status, 403);
    assert.equal(response.data.success, false);
    assert.equal(response.data.code, 'FORBIDDEN');
    assert.equal(
        response.data.message,
        'No tienes permiso para ejecutar esta operacion.'
    );
});

test('aplica una revocacion de permisos sin reiniciar el servidor', async () => {
    const first = await dispatcherRequest(operationRequest(OPS.listar));
    assert.equal(first.status, 200);

    repository.methodPermissions = repository.methodPermissions.filter(row => (
        row.method_id !== OPS.listar.method_id
    ));

    const second = await dispatcherRequest(operationRequest(OPS.listar));
    assert.equal(second.status, 403);
});

test('devuelve 400 cuando los parametros no son validos', async () => {
    const response = await dispatcherRequest(
        operationRequest(OPS.consultar, {})
    );

    assert.equal(response.status, 400);
    assert.equal(response.data.success, false);
    assert.equal(response.data.code, 'VALIDATION_ERROR');
});

test('devuelve 400 cuando la solicitud no tiene identificadores validos', async () => {
    const response = await dispatcherRequest({
        subsystemId: 'uno',
        classId: 2,
        methodId: 3,
        params: {}
    });

    assert.equal(response.status, 400);
    assert.equal(response.data.code, 'VALIDATION_ERROR');
});

test('devuelve 404 cuando la operacion no esta registrada en el servidor', async () => {
    const response = await dispatcherRequest(
        operationRequest(OPS.desconocida)
    );

    assert.equal(response.status, 404);
    assert.equal(response.data.code, 'NOT_FOUND');
});

test('oculta el detalle de errores internos', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        const response = await dispatcherRequest(operationRequest(OPS.fallar));
        assert.equal(response.status, 500);
        assert.equal(response.data.success, false);
        assert.equal(response.data.message, 'Error interno del servidor.');
        assert.ok(!JSON.stringify(response.data).includes('fallo interno'));
    } finally {
        console.error = originalConsoleError;
    }
});

test('no expone rutas de administracion de permisos', async () => {
    const response = await fetch(`${baseUrl}/api/permisos`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie
        },
        body: JSON.stringify({ profileId: 10, allowed: true })
    });

    assert.equal(response.status, 404);
});

test('el cuerpo no puede escalar privilegios con userId, profileId o allowed', async () => {
    repository.methodPermissions = repository.methodPermissions.filter(row => (
        row.method_id !== OPS.listar.method_id
    ));

    const response = await dispatcherRequest({
        ...operationRequest(OPS.listar),
        userId: 1,
        profileId: 10,
        allowed: true
    });

    assert.equal(response.status, 403);
});
