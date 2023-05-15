// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;
const now   = require('./now_helper');

Model.knex(db);

class AccessListAuth extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();

		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}
	}

	$beforeUpdate () {
		this.modified_on = now();
	}

	static get name () {
		return 'AccessListAuth';
	}

	static get tableName () {
		return 'access_list_auth';
	}

	static get jsonAttributes () {
		return ['meta'];
	}

	static get relationMappings () {
		return {
			access_list: {
				relation:   Model.HasOneRelation,
				modelClass: require('./access_list'),
				join:       {
					from: 'access_list_auth.access_list_id',
					to:   'access_list.id'
				},
				modify: function (qb) {
					qb.where('access_list.is_deleted', 0);
				}
			}
		};
	}
}

module.exports = AccessListAuth;
