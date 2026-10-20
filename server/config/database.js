const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '31379406',
    database: process.env.DB_NAME     || 'login_session_db'
});

pool.on('error', (err) => {
    console.error('[PostgreSQL] Error inesperado en el pool:', err);
});

module.exports = pool;
//el database s se encarga de configurar la conexion a la d utilizando la libreria pg
// y cargando las las variasbles de el archivo.env
