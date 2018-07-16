// Objection Docs:
// http://vincit.github.io/objection.js/

'use strict';

const db    = require('../db');
const Model = require('objection').Model;

Model.knex(db);

class AuditLog extends Model {
    $beforeInsert () {
        this.created_on  = Model.raw('NOW()');
        this.modified_on = Model.raw('NOW()');
    }

    $beforeUpdate () {
        this.modified_on = Model.raw('NOW()');
    }

    static get name () {
        return 'AuditLog';
    }

    static get tableName () {
        return 'audit_log';
    }
}

module.exports = AuditLog;
