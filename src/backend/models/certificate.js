// Objection Docs:
// http://vincit.github.io/objection.js/

'use strict';

const db    = require('../db');
const Model = require('objection').Model;
const User  = require('./user');

Model.knex(db);

class Certificate extends Model {
    $beforeInsert () {
        this.created_on  = Model.raw('NOW()');
        this.modified_on = Model.raw('NOW()');

        if (typeof this.expires_on === 'undefined') {
            this.expires_on = Model.raw('NOW()');
        }
    }

    $beforeUpdate () {
        this.modified_on = Model.raw('NOW()');
    }

    static get name () {
        return 'Certificate';
    }

    static get tableName () {
        return 'certificate';
    }

    static get jsonAttributes () {
        return ['domain_names', 'meta'];
    }

    static get relationMappings () {
        return {
            owner: {
                relation:   Model.HasOneRelation,
                modelClass: User,
                join:       {
                    from: 'certificate.owner_user_id',
                    to:   'user.id'
                },
                modify:     function (qb) {
                    qb.where('user.is_deleted', 0);
                    qb.omit(['id', 'created_on', 'modified_on', 'is_deleted', 'email', 'roles']);
                }
            }
        };
    }
}

module.exports = Certificate;
