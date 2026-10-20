'use strict';

const PayrollRepository = require('../repositories/PayrollRepository');

class NominaDefinitiva {
    constructor(repository = new PayrollRepository()) {
        this.repository = repository;
    }

    async consultar({ periodo }) {
        return this.repository.getNominaStatus(periodo);
    }

    /**
     * Cerrar es una operacion con estado: exige una prenomina calculada y
     * solo puede ejecutarse una vez por periodo.
     */
    async cerrar({ periodo }, context = {}) {
        return this.repository.closeNomina(
            periodo,
            context && context.userId ? context.userId : null
        );
    }
}

module.exports = NominaDefinitiva;
