const pool = require('../server/config/database');
(async () => {
    await pool.query("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = 1");
    console.log('Intentos fallidos reseteados para userId=1');
    await pool.end();
})();
