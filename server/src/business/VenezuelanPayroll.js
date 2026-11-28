'use strict';

const { ConflictError } = require('../errors/AppError');

/**
 * Calculadora de nomina venezolana (Ley del Trabajo, LOTTT).
 *
 * Calcula deducciones de ley sobre el salario base:
 *   - SSO (Seguro Social Obrero): 4% del empleado
 *   - Paro Forzoso: 2% del empleado
 *   - FAOV (Fondo de Ahorro Vivienda): 2% del empleado
 *   - Aportes patronales (informativos, no se deducen al empleado)
 *
 * Soporte para prorrateo por dias trabajados (Bloque 4):
 *   - Si el empleado tiene fecha de cese dentro del periodo, se prorratea
 *     el salario base por dias trabajados.
 */
class VenezuelanPayroll {
    constructor(repository) {
        this.repository = repository;
    }

    /**
     * Obtiene los conceptos de ley activos para aplicar en una nomina.
     */
    async getConceptosLey() {
        const conceptos = await this.repository.listConcepts({
            categoria: 'LEY',
            active: true
        });
        return conceptos;
    }

    /**
     * Obtiene los aportes de ley configurados (SSO, PARO_FORZOSO, FAOV, etc.)
     */
    async getAportesLey() {
        return this.repository.listAportesLey({ active: true });
    }

    /**
     * Calcula las deducciones de ley para un empleado en un periodo.
     *
     * @param {Object} params
     * @param {number} params.empleadoId
     * @param {number} params.salarioBase - salario base mensual del empleado
     * @param {number} params.diasTrabajados - dias trabajados en el periodo (para prorrateo)
     * @param {number} params.diasPeriodo - total de dias en el periodo
     * @returns {Object} { deducciones: Array, aportesPatronales: Array, totalDeducciones: number }
     */
    async calcularDeduccionesLey({ empleadoId, salarioBase, diasTrabajados, diasPeriodo }) {
        const aportes = await this.getAportesLey();

        // Prorrateo por dias trabajados (Bloque 4)
        let salarioBaseProrrateado = salarioBase;
        if (diasTrabajados && diasPeriodo && diasTrabajados < diasPeriodo) {
            salarioBaseProrrateado = Math.round(
                (salarioBase * diasTrabajados) / diasPeriodo * 100
            ) / 100;
        }

        const deducciones = [];
        let totalDeducciones = 0;

        for (const aporte of aportes) {
            // Solo calcular los que son deduccion al empleado (tipo DEDUCCION en concepto)
            // Los aportes patronales son informativos
            const concepto = await this.repository.getConceptByCode(aporte.codigo);
            if (!concepto || !concepto.active) continue;

            // Saltar aportes patronales (no se descuentan al empleado)
            if (concepto.tipo === 'APORTACION_PATRONAL') continue;

            let monto = 0;
            if (concepto.calculo === 'PORCENTAJE_SALARIO' && aporte.porcentaje) {
                // Aplicar tope salarial si existe
                let base = salarioBaseProrrateado;
                if (aporte.topeSalario && base > aporte.topeSalario) {
                    base = aporte.topeSalario;
                }
                if (concepto.pisoBase && base < concepto.pisoBase) {
                    base = concepto.pisoBase;
                }
                monto = Math.round(base * aporte.porcentaje * 100) / 100;
            } else if (concepto.calculo === 'FIJO') {
                monto = Math.round(salarioBaseProrrateado * 100) / 100;
            }

            if (monto > 0) {
                deducciones.push({
                    conceptoId: concepto.id,
                    codigoConcepto: concepto.codigo,
                    concepto: concepto.nombre,
                    tipo: 'DEDUCCION',
                    cantidad: 1,
                    tarifa: monto,
                    importe: monto,
                    origenTipo: 'LEY',
                    origenId: aporte.id
                });
                totalDeducciones += monto;
            }
        }

        totalDeducciones = Math.round(totalDeducciones * 100) / 100;

        return {
            empleadoId,
            salarioBase: salarioBaseProrrateado,
            salarioBaseOriginal: salarioBase,
            diasTrabajados,
            diasPeriodo,
            deducciones,
            totalDeducciones
        };
    }

    /**
     * Calcula los aportes patronales (costo del empleador, informativo).
     * No se descuentan del empleado.
     */
    async calcularAportesPatronales({ salarioBase, diasTrabajados, diasPeriodo }) {
        const aportes = await this.getAportesLey();

        let salarioBaseProrrateado = salarioBase;
        if (diasTrabajados && diasPeriodo && diasTrabajados < diasPeriodo) {
            salarioBaseProrrateado = Math.round(
                (salarioBase * diasTrabajados) / diasPeriodo * 100
            ) / 100;
        }

        const aportesPatronales = [];
        let totalAportesPatronales = 0;

        for (const aporte of aportes) {
            const concepto = await this.repository.getConceptByCode(aporte.codigo);
            if (!concepto || !concepto.active) continue;

            // Solo aportes patronales
            if (concepto.tipo !== 'APORTACION_PATRONAL') continue;

            let monto = 0;
            if (aporte.porcentaje) {
                let base = salarioBaseProrrateado;
                if (aporte.topeSalario && base > aporte.topeSalario) {
                    base = aporte.topeSalario;
                }
                monto = Math.round(base * aporte.porcentaje * 100) / 100;
            }

            if (monto > 0) {
                aportesPatronales.push({
                    conceptoId: concepto.id,
                    codigoConcepto: concepto.codigo,
                    concepto: concepto.nombre,
                    tipo: 'APORTACION_PATRONAL',
                    cantidad: 1,
                    tarifa: monto,
                    importe: monto,
                    origenTipo: 'APORTE_PATRONAL',
                    origenId: aporte.id
                });
                totalAportesPatronales += monto;
            }
        }

        totalAportesPatronales = Math.round(totalAportesPatronales * 100) / 100;

        return {
            salarioBase: salarioBaseProrrateado,
            aportesPatronales,
            totalAportesPatronales
        };
    }

    /**
     * Verifica si un empleado tiene un despido registrado y calcula
     * los dias trabajados en el periodo para prorrateo.
     */
    async getDiasTrabajadosPeriodo({ empleadoId, periodoStart, periodoEnd }) {
        const despido = await this.repository.getDespidoByEmployee(empleadoId);

        if (!despido) {
            // Sin despido: trabajar todos los dias del periodo
            const start = new Date(periodoStart);
            const end = new Date(periodoEnd);
            const diasPeriodo = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
            return { diasTrabajados: diasPeriodo, diasPeriodo, despido: null };
        }

        const fechaCese = new Date(despido.fecha_efecto);
        const start = new Date(periodoStart);
        const end = new Date(periodoEnd);
        const diasPeriodo = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

        // Si el despido es antes del periodo, no hay dias trabajados
        if (fechaCese < start) {
            return { diasTrabajados: 0, diasPeriodo, despido };
        }

        // Si el despido es dentro del periodo, contar dias hasta el cese
        const finPeriodo = fechaCese > end ? end : fechaCese;
        const diasTrabajados = Math.round((finPeriodo - start) / (1000 * 60 * 60 * 24)) + 1;

        return { diasTrabajados: Math.max(0, diasTrabajados), diasPeriodo, despido };
    }
}

module.exports = VenezuelanPayroll;
