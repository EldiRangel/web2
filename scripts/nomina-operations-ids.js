'use strict';

const path = require('path');
const root = process.cwd();
const pool = require(path.join(root, 'server', 'config', 'database'));

(async () => {
    try {
        const rows = await pool.query(`
            SELECT s.id AS subsystem_id, s.name AS subsystem,
                   c.id AS class_id, c.name AS clase,
                   m.id AS method_id, m.name AS metodo
            FROM method m
            INNER JOIN "class" c ON c.id = m.class_id
            INNER JOIN subsystem s ON s.id = c.subsystem_id
            WHERE s.name = 'Nomina'
            ORDER BY s.id, c.id, m.id
        `);
        console.table(rows.rows);
    } catch (error) {
        console.error('ERROR', error.code || error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
