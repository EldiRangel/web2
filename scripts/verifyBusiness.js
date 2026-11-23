'use strict';

/**
 * Diagnostico de la capa de negocio de nomina contra PostgreSQL.
 *
 * Uso:
 *   node scripts/verifyBusiness.js
 *   node scripts/verifyBusiness.js --periodo=2026-11
 *   node scripts/verifyBusiness.js --empleado=1
 *   node scripts/verifyBusiness.js --periodo=2026-11 --calcular
 *
 * Por defecto solo lee datos. Con --calcular ejecuta la prenomina del periodo
 * indicado, que es una operacion de escritura pero repetible mientras el
 * periodo no este cerrado. El cierre definitivo nunca se ejecuta aqui.
 */

require('dotenv').config();

const pool = require('../server/config/database');
const PayrollRepository = require('../server/src/repositories/PayrollRepository');
const Empleados = require('../server/src/business/Empleados');
const Salarios = require('../server/src/business/Salarios');
const Bonos = require('../server/src/business/Bonos');
const HorasExtras = require('../server/src/business/HorasExtras');
const Prestamos = require('../server/src/business/Prestamos');
const Prenomina = require('../server/src/business/Prenomina');
const NominaDefinitiva = require('../server/src/business/NominaDefinitiva');

function parseArgs(argv) {
    const args = {};

    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const [key, value] = arg.slice(2).split('=');
        args[key] = value === undefined ? true : value;
    }

    return args;
}

function describe(value) {
    if (Array.isArray(value)) return `${value.length} registro(s)`;
    if (value === null) return 'sin datos';
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        return keys.length > 0 ? keys.slice(0, 5).join(', ') : 'objeto vacio';
    }
    return String(value);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const repository = new PayrollRepository();
    const empleados = new Empleados(repository);
    const salarios = new Salarios(repository);
    const bonos = new Bonos(repository);
    const horasExtras = new HorasExtras(repository);
    const prestamos = new Prestamos(repository);
    const prenomina = new Prenomina(repository);
    const definitiva = new NominaDefinitiva(repository);

    let failures = 0;
    let executed = 0;

    const run = async (name, operation, { optional = false } = {}) => {
        try {
            const result = await operation();
            executed += 1;
            console.log(`OK    ${name.padEnd(38)} ${describe(result)}`);
            return result;
        } catch (error) {
            const missing = error && (error.status === 404 || error.code === 'NOT_FOUND');

            if (optional && missing) {
                console.log(`VACIO ${name.padEnd(38)} sin datos para el periodo`);
                return null;
            }

            failures += 1;
            console.error(`FALLO ${name.padEnd(38)} ${error.message}`);
            return null;
        }
    };

    try {
        const periodResult = await pool.query(
            `SELECT code
             FROM pay_periods
             WHERE ($1::text IS NULL OR code = $1)
               AND status IN ('ABIERTO', 'CALCULADO')
             ORDER BY code
             LIMIT 1`,
            [args.periodo || null]
        );

        const periodCode = periodResult.rows[0] && periodResult.rows[0].code;

        if (!periodCode) {
            console.error(
                args.periodo
                    ? `No existe un periodo abierto con codigo ${args.periodo}.`
                    : 'No hay periodos abiertos. Ejecuta npm run db:payroll.'
            );
            process.exitCode = 1;
            return;
        }

        console.log(`Periodo: ${periodCode}`);

        const activeEmployees = await run(
            'Empleados.listar',
            () => empleados.listar({ estado: 'ACTIVO', limite: 100 })
        );

        if (!activeEmployees || activeEmployees.length === 0) {
            console.error('No hay empleados activos para verificar.');
            process.exitCode = 1;
            return;
        }

        const requestedId = args.empleado ? Number(args.empleado) : activeEmployees[0].id;
        if (!Number.isSafeInteger(requestedId) || requestedId <= 0) {
            console.error('El argumento --empleado debe ser un entero positivo.');
            process.exitCode = 1;
            return;
        }

        const employee = await run(
            'Empleados.consultar',
            () => empleados.consultar({ empleadoId: requestedId })
        );

        if (!employee) {
            process.exitCode = 1;
            return;
        }

        await run(
            'Salarios.consultar',
            () => salarios.consultar({ empleadoId: employee.id })
        );

        await run(
            'Bonos.listar',
            () => bonos.listar({ empleadoId: employee.id, periodo: periodCode })
        );

        await run(
            'HorasExtras.listar',
            () => horasExtras.listar({ empleadoId: employee.id, periodo: periodCode })
        );

        await run(
            'Prestamos.listar',
            () => prestamos.listar({ empleadoId: employee.id })
        );

        if (args.calcular) {
            const calculation = await run(
                'Prenomina.calcular',
                () => prenomina.calcular({ periodo: periodCode }, {})
            );

            if (calculation) {
                console.log(`      Totales: ${JSON.stringify(calculation.totales)}`);
            }
        } else {
            console.log('OMIT  Prenomina.calcular                     usa --calcular para ejecutar');
        }

        await run(
            'Prenomina.consultar',
            () => prenomina.consultar({ periodo: periodCode }),
            { optional: true }
        );

        await run(
            'NominaDefinitiva.consultar',
            () => definitiva.consultar({ periodo: periodCode }),
            { optional: true }
        );

        console.log(
            'OMIT  NominaDefinitiva.cerrar                operacion irreversible; no se ejecuta en el diagnostico'
        );

        console.log(`\nOperaciones ejecutadas: ${executed}. Fallos: ${failures}.`);
        if (failures > 0) process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main().catch(error => {
    console.error('Error inesperado:', error.message);
    process.exitCode = 1;
});
