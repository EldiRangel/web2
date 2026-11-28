'use strict';

const pool = require('../../config/database');

/**
 * Servicio de cola de correos salientes (outbox).
 *
 * Los correos no se envian directamente por SMTP en este modulo; se insertan
 * en la tabla mail_outbox con estado PENDIENTE. Un proceso separado (o el
 * mismo servidor en produccion) puede leer la cola y enviarlos via SMTP.
 *
 * En entorno de desarrollo, el token de recuperacion se devuelve en la
 * respuesta HTTP para pruebas; en produccion se inserta en mail_outbox.
 */
class MailOutboxService {
    async encolar({ toEmail, toName, subject, bodyText, bodyHtml, template, templateData }) {
        const result = await pool.query(
            `INSERT INTO mail_outbox
                 (to_email, to_name, subject, body_text, body_html, template, template_data, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'PENDIENTE')
             RETURNING id, to_email, subject, status, created_at`,
            [
                toEmail,
                toName || null,
                subject,
                bodyText || null,
                bodyHtml || null,
                template || null,
                templateData ? JSON.stringify(templateData) : null
            ]
        );
        return result.rows[0];
    }

    async listar({ estado = null, limite = 100 } = {}) {
        const conditions = [];
        const params = [];

        if (estado) {
            params.push(estado);
            conditions.push(`status = $${params.length}`);
        }

        const where = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        const result = await pool.query(
            `SELECT id, to_email, to_name, subject, template, status, intentos,
                    enviado_en, error, created_at
             FROM mail_outbox
             ${where}
             ORDER BY created_at DESC
             LIMIT $${params.length + 1}`,
            [...params, Math.max(1, Math.min(Number(limite) || 100, 500))]
        );

        return result.rows.map(row => ({
            id: row.id,
            toEmail: row.to_email,
            toName: row.to_name,
            subject: row.subject,
            template: row.template,
            status: row.status,
            intentos: row.intentos,
            enviadoEn: row.enviado_en,
            error: row.error,
            createdAt: row.created_at
        }));
    }

    async marcarEnviado(id) {
        await pool.query(
            `UPDATE mail_outbox
             SET status = 'ENVIADO', enviado_en = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id]
        );
    }

    async marcarFallido(id, errorMensaje) {
        await pool.query(
            `UPDATE mail_outbox
             SET status = 'FALLIDO',
                 intentos = intentos + 1,
                 error = $2
             WHERE id = $1`,
            [id, errorMensaje]
        );
    }

    /**
     * Crea una entrada de recuperacion de clave en el outbox.
     * Devuelve el token para desarrollo (para pruebas sin SMTP).
     */
    async crearRecuperacionClave({ toEmail, toName, token, expiresAt }) {
        const bodyText = `
Hola ${toName || 'Usuario'},

Has solicitado la recuperacion de tu contrasena en el Sistema de Nomina.

Token de recuperacion: ${token}
Valido hasta: ${expiresAt}

Si no solicitaste este cambio, ignora este mensaje.

--- Sistema de Nomina
        `;

        const bodyHtml = `
<h2>Recuperacion de Contrasena</h2>
<p>Hola <strong>${toName || 'Usuario'}</strong>,</p>
<p>Has solicitado la recuperacion de tu contrasena en el Sistema de Nomina.</p>
<p><strong>Token de recuperacion:</strong> <code>${token}</code></p>
<p><strong>Valido hasta:</strong> ${expiresAt}</p>
<p>Si no solicitaste este cambio, ignora este mensaje.</p>
<hr>
<p><small>Sistema de Nomina</small></p>
        `;

        return this.encolar({
            toEmail,
            toName,
            subject: 'Recuperacion de contrasena - Sistema de Nomina',
            bodyText,
            bodyHtml,
            template: 'recuperacion_clave',
            templateData: { token, expiresAt, toName }
        });
    }
}

module.exports = MailOutboxService;
