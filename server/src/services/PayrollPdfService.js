'use strict';

const PDFDocument = require('pdfkit');
const PayrollRepository = require('../repositories/PayrollRepository');

/**
 * Servicio de generacion de PDF de recibos de pago y reportes de nomina.
 * Utiliza pdfkit para generar documentos PDF en memoria.
 */
class PayrollPdfService {
    constructor({ repository = new PayrollRepository() } = {}) {
        this.repository = repository;
    }

    /**
     * Genera el PDF de un recibo de pago individual para un empleado.
     *
     * @param {Object} params
     * @param {string} params.periodo - codigo del periodo (YYYY-MM)
     * @param {number} params.empleadoId - ID del empleado
     * @returns {Promise<Buffer>} buffer del PDF generado
     */
    async generarReciboPDF({ periodo, empleadoId }) {
        // Obtener la prenomina calculada para el periodo
        const prenomina = await this.repository.getPrenomina(periodo);

        const empleado = prenomina.resultados.find(
            r => r.empleadoId === empleadoId
        );

        if (!empleado) {
            throw new Error(
                `No se encontro recibo para el empleado ${empleadoId} en el periodo ${periodo}`
            );
        }

        const doc = new PDFDocument({
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 60, right: 60 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));

        // ================= CABECERA =================
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a3a5c').text('SISTEMA DE NOMINA', { align: 'center' });
        doc.fontSize(14).font('Helvetica').fillColor('#555555').text('Recibo de Pago', { align: 'center' });
        doc.moveDown();

        // Linea separadora
        doc.strokeColor('#1a3a5c').lineWidth(2).moveTo(60, doc.y).lineTo(540, doc.y).stroke();
        doc.moveDown();

        // ================= DATOS DEL RECIBO =================
        const datos = [
            ['Periodo:', periodo],
            ['Run #:', String(prenomina.run.numero)],
            ['Estado:', prenomina.run.estado],
            ['Empleado:', `${empleado.codigo} - ${empleado.nombre}`],
            ['Salario Base:', formatoMoneda(empleado.salarioBase)],
            ['Fecha Calculo:', prenomina.run.calculadaEn || '—'],
            ['Fecha Cierre:', prenomina.run.cerradaEn || '—']
        ];

        const inicioY = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        datos.forEach(([etiqueta, valor], i) => {
            const y = inicioY + i * 20;
            doc.text(etiqueta, 60, y, { width: 120, align: 'left', continued: true });
            doc.font('Helvetica').text(valor, 180, y, { align: 'left' });
            doc.font('Helvetica-Bold');
        });
        doc.font('Helvetica');

        doc.moveDown(2);

        // ================= TABLA DE CONCEPTOS =================
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a3a5c').text('Detalle de Conceptos', { underline: true });
        doc.moveDown();

        const tablaInicio = doc.y;
        const colX = [60, 200, 320, 400, 480];
        const colW = [140, 80, 80, 80, 80];

        // Cabecera de tabla
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
        doc.rect(60, tablaInicio, 480, 20).fill('#1a3a5c');
        const headers = ['Concepto', 'Tipo', 'Cantidad', 'Tarifa', 'Importe'];
        headers.forEach((h, i) => {
            doc.text(h, colX[i] + 5, tablaInicio + 5, { width: colW[i] - 10, align: i === 0 ? 'left' : 'right' });
        });

        doc.moveDown(0.5);

        // Filas de conceptos
        let filaY = tablaInicio + 25;
        let esPar = false;

        for (const linea of (empleado.lineas || [])) {
            const fillColor = esPar ? '#f3f4f6' : '#ffffff';
            doc.rect(60, filaY, 480, 18).fill(fillColor);

            const tipoLabel = linea.tipo === 'PERCEPCION' ? 'Percepcion' : 'Deduccion';
            const tipoColor = linea.tipo === 'PERCEPCION' ? '#1a8a3a' : '#c0392b';

            doc.font('Helvetica').fontSize(8.5).fillColor('#000000');
            doc.text(linea.concepto, colX[0] + 5, filaY + 3, { width: colW[0] - 10, align: 'left' });
            doc.font('Helvetica-Bold').fillColor(tipoColor).text(tipoLabel, colX[1] + 5, filaY + 3, { width: colW[1] - 10, align: 'right' });
            doc.font('Helvetica').fillColor('#000000').text(linea.cantidad || 1, colX[2] + 5, filaY + 3, { width: colW[2] - 10, align: 'right' });
            doc.text(formatoMoneda(linea.tarifa), colX[3] + 5, filaY + 3, { width: colW[3] - 10, align: 'right' });
            doc.text(formatoMoneda(linea.importe), colX[4] + 5, filaY + 3, { width: colW[4] - 10, align: 'right' });

            filaY += 18;
            esPar = !esPar;
        }

        doc.moveDown(0.5);

        // ================= TOTALES =================
        doc.strokeColor('#1a3a5c').lineWidth(1).moveTo(60, filaY).lineTo(540, filaY).stroke();
        doc.moveDown(0.3);

        const totales = [
            ['Percepciones', formatoMoneda(empleado.percepciones)],
            ['Deducciones', formatoMoneda(empleado.deducciones)],
            ['NETO A PAGAR', formatoMoneda(empleado.neto)]
        ];

        totales.forEach(([etiqueta, valor], i) => {
            const esNeto = i === 2;
            doc.font(esNeto ? 'Helvetica-Bold' : 'Helvetica').fontSize(esNeto ? 11 : 9);
            doc.fillColor(esNeto ? '#1a3a5c' : '#000000');
            if (esNeto) {
                doc.rect(60, doc.y, 480, 20).fill('#e8eef5');
            }
            doc.text(etiqueta, 60, doc.y + 2, { width: 300, align: 'right' });
            doc.text(valor, 460, doc.y + 2, { align: 'right' });
            doc.moveDown(0.4);
        });

        doc.moveDown(1);

        // ================= PIE DE PAGINA =================
        const paginaActual = doc.page;
        doc.fontSize(8).font('Helvetica').fillColor('#777777');
        doc.text(
            'Sistema de Nomina - Recibo generado automaticamente. Documento valido como comprobante de pago.',
            60,
            doc.page.height - 70,
            { width: 480, align: 'center' }
        );
        doc.text(
            `Pagina ${paginaActual}`,
            60,
            doc.page.height - 55,
            { width: 480, align: 'center' }
        );

        doc.end();

        return new Promise((resolve, reject) => {
            const buffers = [];
            doc.on('data', b => buffers.push(b));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
        });
    }

    /**
     * Genera un reporte resumen de nomina por periodo en PDF.
     */
    async generarReporteNominaPDF({ periodo }) {
        const prenomina = await this.repository.getPrenomina(periodo);

        const doc = new PDFDocument({
            size: 'LETTER',
            margins: { top: 50, bottom: 50, left: 60, right: 60 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));

        doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a3a5c').text('SISTEMA DE NOMINA', { align: 'center' });
        doc.fontSize(14).font('Helvetica').fillColor('#555555').text('Reporte de Nomina por Periodo', { align: 'center' });
        doc.moveDown();

        doc.strokeColor('#1a3a5c').lineWidth(2).moveTo(60, doc.y).lineTo(540, doc.y).stroke();
        doc.moveDown();

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(`Periodo: ${periodo}`, 60, doc.y);
        doc.text(`Run #: ${prenomina.run.numero}`, 60, doc.y + 15);
        doc.text(`Estado: ${prenomina.run.estado}`, 60, doc.y + 30);
        doc.text(`Moneda: ${prenomina.moneda}`, 60, doc.y + 45);
        doc.moveDown(1);

        // Tabla resumen por empleado
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a3a5c').text('Resumen por Empleado', { underline: true });
        doc.moveDown();

        const tablaInicio = doc.y;
        const colX = [60, 180, 300, 400, 480];
        const headers = ['Empleado', 'Salario Base', 'Percepciones', 'Deducciones', 'Neto'];

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
        doc.rect(60, tablaInicio, 480, 20).fill('#1a3a5c');
        headers.forEach((h, i) => {
            doc.text(h, colX[i] + 5, tablaInicio + 5, { width: 100, align: i === 0 ? 'left' : 'right' });
        });

        let filaY = tablaInicio + 25;
        let esPar = false;

        for (const emp of prenomina.resultados) {
            const fillColor = esPar ? '#f3f4f6' : '#ffffff';
            doc.rect(60, filaY, 480, 18).fill(fillColor);

            doc.font('Helvetica').fontSize(8.5).fillColor('#000000');
            doc.text(`${emp.codigo} - ${emp.nombre}`, colX[0] + 5, filaY + 3, { width: 120, align: 'left' });
            doc.text(formatoMoneda(emp.salarioBase), colX[1] + 5, filaY + 3, { width: 80, align: 'right' });
            doc.text(formatoMoneda(emp.percepciones), colX[2] + 5, filaY + 3, { width: 80, align: 'right' });
            doc.text(formatoMoneda(emp.deducciones), colX[3] + 5, filaY + 3, { width: 80, align: 'right' });
            doc.text(formatoMoneda(emp.neto), colX[4] + 5, filaY + 3, { width: 80, align: 'right' });

            filaY += 18;
            esPar = !esPar;
        }

        // Totales
        doc.moveDown(0.5);
        doc.strokeColor('#1a3a5c').lineWidth(1).moveTo(60, filaY).lineTo(540, filaY).stroke();
        doc.moveDown(0.3);

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a3a5c');
        doc.text('TOTALES', 60, filaY + 5, { width: 120, align: 'right' });
        doc.text(formatoMoneda(prenomina.totales.percepciones), colX[2] + 5, filaY + 5, { width: 80, align: 'right' });
        doc.text(formatoMoneda(prenomina.totales.deducciones), colX[3] + 5, filaY + 5, { width: 80, align: 'right' });
        doc.text(formatoMoneda(prenomina.totales.neto), colX[4] + 5, filaY + 5, { width: 80, align: 'right' });

        doc.end();

        return new Promise((resolve, reject) => {
            const buffers = [];
            doc.on('data', b => buffers.push(b));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
        });
    }
}

function formatoMoneda(valor) {
    return Number(valor || 0).toLocaleString('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

module.exports = PayrollPdfService;
