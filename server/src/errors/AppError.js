'use strict';

/**
 * Error base de la aplicacion.
 * `status` se usa para responder al cliente; `code` permite identificar el
 * tipo de fallo sin exponer detalles internos.
 */
class AppError extends Error {
    constructor(message, { status = 500, code = 'INTERNAL_ERROR', details = null, cause = null } = {}) {
        super(message);
        this.name = new.target.name;
        this.status = status;
        this.code = code;
        this.details = details;
        if (cause) this.cause = cause;
        if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Solicitud invalida.', details = null) {
        super(message, { status: 400, code: 'VALIDATION_ERROR', details });
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'No hay una sesion activa. Inicia sesion primero.') {
        super(message, { status: 401, code: 'UNAUTHORIZED' });
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'No tienes permiso para ejecutar esta operacion.') {
        super(message, { status: 403, code: 'FORBIDDEN' });
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Operacion no encontrada.') {
        super(message, { status: 404, code: 'NOT_FOUND' });
    }
}

class ConflictError extends AppError {
    constructor(message = 'La operacion no puede completarse en el estado actual.') {
        super(message, { status: 409, code: 'CONFLICT' });
    }
}

class DuplicatePermissionError extends AppError {
    constructor(message = 'La clave de permiso ya existe.') {
        super(message, { status: 409, code: 'DUPLICATE_PERMISSION' });
    }
}

class DatabaseError extends AppError {
    constructor(cause = null) {
        super('Error interno del servidor.', {
            status: 500,
            code: 'DATABASE_ERROR',
            cause
        });
    }
}

module.exports = {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    DuplicatePermissionError,
    DatabaseError
};
