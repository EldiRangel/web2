'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const tests = [
    path.join(__dirname, 'Security.test.js'),
    path.join(__dirname, 'Dispatcher.test.js'),
    path.join(__dirname, 'BusinessLayer.test.js')
];

const payrollTest = path.join(__dirname, 'PayrollCalculator.test.js');
const payrollModule = path.join(
    projectRoot,
    'server',
    'src',
    'business',
    'PayrollCalculator.js'
);

if (fs.existsSync(payrollTest) && fs.existsSync(payrollModule)) {
    tests.push(payrollTest);
} else {
    console.warn(
        '[tests] Omitiendo PayrollCalculator.test.js: ' +
        'la capa business no esta disponible.'
    );
}

const result = spawnSync(process.execPath, ['--test', ...tests], {
    cwd: projectRoot,
    stdio: 'inherit'
});

if (result.error) {
    console.error('[tests] No se pudo ejecutar node --test:', result.error.message);
    process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
