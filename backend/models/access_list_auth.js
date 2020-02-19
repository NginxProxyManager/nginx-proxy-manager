// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;

Model.knex(db);

class AccessListAuth extends Model {
	$beforeInsert () {
		this.created_on  = Model.raw('NOW()');
		this.modified_on = Model.raw('NOW()');

		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}
	}

	$beforeUpdate () {
		this.modified_on = Model.raw('NOW()');
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
					qb.omit(['created_on', 'modified_on', 'is_deleted', 'access_list_id']);
				}
			}
		};
	}
}

module.exports = AccessListAuth;
