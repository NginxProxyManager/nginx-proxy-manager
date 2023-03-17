// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;
const User  = require('./user');
const now   = require('./now_helper');

Model.knex(db);

class Certificate extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();

		// Default for expires_on
		if (typeof this.expires_on === 'undefined') {
			this.expires_on = now();
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
		this.modified_on = now();

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
				}
			}
		};
	}
}

module.exports = Certificate;
