const express = require('express');
const router = express.Router();
const PayrollPdfService = require('../src/services/PayrollPdfService');
const MailOutboxService = require('../src/services/MailOutboxService');
const PayrollRepository = require('../src/repositories/PayrollRepository');
const requireSession = require('../middleware/requireSession');

const pdfService = new PayrollPdfService();
const mailService = new MailOutboxService();
const repository = new PayrollRepository();

// ----------------------------------------------------------------------------
// PDF de recibo individual (Bloque 5)
// ----------------------------------------------------------------------------
router.get('/api/payroll/pdf/recibo', requireSession, async (req, res) => {
    try {
        const { periodo, empleadoId } = req.query;
        if (!periodo || !empleadoId) {
            return res.status(400).json({
                success: false,
                message: 'Parametros requeridos: periodo y empleadoId'
            });
        }

        const pdfBuffer = await pdfService.generarReciboPDF({
            periodo,
            empleadoId: Number(empleadoId)
        });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="recibo_${periodo}_${empleadoId}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('[PDF Recibo]', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error al generar el PDF del recibo'
        });
    }
});

// ----------------------------------------------------------------------------
// PDF de reporte de nomina por periodo (Bloque 5)
// ----------------------------------------------------------------------------
router.get('/api/payroll/pdf/reporte', requireSession, async (req, res) => {
    try {
        const { periodo } = req.query;
        if (!periodo) {
            return res.status(400).json({
                success: false,
                message: 'Parametro requerido: periodo'
            });
        }

        const pdfBuffer = await pdfService.generarReporteNominaPDF({ periodo });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="reporte_nomina_${periodo}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('[PDF Reporte]', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error al generar el PDF del reporte'
        });
    }
});

// ----------------------------------------------------------------------------
// Correos outbox (Bloque 6)
// ----------------------------------------------------------------------------
router.get('/api/mail/outbox', requireSession, async (req, res) => {
    try {
        const { estado, limite } = req.query;
        const correos = await mailService.listar({
            estado,
            limite: limite ? Number(limite) : 100
        });
        return res.json({ success: true, data: correos });
    } catch (error) {
        console.error('[Mail Outbox]', error);
        return res.status(500).json({
            success: false,
            message: 'Error al consultar la cola de correos'
        });
    }
});

router.get('/api/mail/outbox/:id', requireSession, async (req, res) => {
    try {
        // TODO: implementar obtener un correo por id con cuerpo completo
        return res.status(501).json({
            success: false,
            message: 'Endpoint no implementado'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error al obtener el correo'
        });
    }
});

// ----------------------------------------------------------------------------
// Conceptos de nomina (Bloque 3)
// ----------------------------------------------------------------------------
router.get('/api/payroll/conceptos', requireSession, async (req, res) => {
    try {
        const { categoria, tipo, active } = req.query;
        const conceptos = await repository.listConcepts({
            categoria,
            tipo,
            active: active !== undefined ? active === 'true' : true
        });
        return res.json({ success: true, data: conceptos });
    } catch (error) {
        console.error('[Conceptos]', error);
        return res.status(500).json({
            success: false,
            message: 'Error al consultar conceptos de nomina'
        });
    }
});

router.get('/api/payroll/aportes-ley', requireSession, async (req, res) => {
    try {
        const aportes = await repository.listAportesLey({ active: true });
        return res.json({ success: true, data: aportes });
    } catch (error) {
        console.error('[Aportes Ley]', error);
        return res.status(500).json({
            success: false,
            message: 'Error al consultar aportes de ley'
        });
    }
});

// ----------------------------------------------------------------------------
// Despidos (Bloque 4)
// ----------------------------------------------------------------------------
router.get('/api/payroll/despidos', requireSession, async (req, res) => {
    try {
        const { employeeId, periodo } = req.query;
        const despidos = await repository.listDespidos({
            employeeId: employeeId ? Number(employeeId) : null,
            periodo
        });
        return res.json({ success: true, data: despidos });
    } catch (error) {
        console.error('[Despidos]', error);
        return res.status(500).json({
            success: false,
            message: 'Error al consultar despidos'
        });
    }
});

router.post('/api/payroll/despidos', requireSession, async (req, res) => {
    try {
        const { employeeId, fechaEfecto, motivo, tipoContrato } = req.body || {};
        if (!employeeId || !fechaEfecto || !motivo) {
            return res.status(400).json({
                success: false,
                message: 'employeeId, fechaEfecto y motivo son obligatorios'
            });
        }

        const despido = await repository.createDespido({
            employeeId: Number(employeeId),
            fechaEfecto,
            motivo,
            tipoContrato: tipoContrato || 'FINALIZADO'
        });

        return res.status(201).json({
            success: true,
            message: 'Despido registrado correctamente',
            data: despido
        });
    } catch (error) {
        console.error('[Crear Despido]', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Error al registrar el despido'
        });
    }
});

module.exports = router;
