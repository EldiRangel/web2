'use strict';

process.env.NODE_ENV = 'production';

const { start } = require('./app');

start().catch(error => {
    console.error('[Server] No se pudo iniciar en produccion:', error.message);
    process.exit(1);
});
