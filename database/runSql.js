'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../server/config/database');

const requestedFile = process.argv[2];

if (!requestedFile) {
    console.error('Uso: node database/runSql.js <archivo.sql>');
    process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), requestedFile);
const sql = fs.readFileSync(sqlPath, 'utf8');

(async () => {
    const client = await pool.connect();

    try {
        await client.query(sql);
        console.log(`SQL ejecutado correctamente: ${requestedFile}`);
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            // La transaccion pudo no haber iniciado.
        }
        console.error(`Error al ejecutar ${requestedFile}:`, error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
