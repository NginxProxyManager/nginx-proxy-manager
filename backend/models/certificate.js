// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;
const User  = require('./user');

Model.knex(db);

class Certificate extends Model {
	$beforeInsert () {
		this.created_on  = Model.raw('NOW()');
		this.modified_on = Model.raw('NOW()');

		// Default for expires_on
		if (typeof this.expires_on === 'undefined') {
			this.expires_on = Model.raw('NOW()');
		}

		// Default for domain_names
		if (typeof this.domain_names === 'undefined') {
			this.domain_names = [];
		}

		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}

		this.domain_names.sort();
	}

	$beforeUpdate () {
		this.modified_on = Model.raw('NOW()');

		// Sort domain_names
		if (typeof this.domain_names !== 'undefined') {
			this.domain_names.sort();
		}
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
				modify: function (qb) {
					qb.where('user.is_deleted', 0);
					qb.omit(['id', 'created_on', 'modified_on', 'is_deleted', 'email', 'roles']);
				}
			}
		};
	}
}

module.exports = Certificate;
