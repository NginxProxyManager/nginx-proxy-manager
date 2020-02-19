// Objection Docs:
// http://vincit.github.io/objection.js/

const db          = require('../db');
const Model       = require('objection').Model;
const User        = require('./user');
const Certificate = require('./certificate');

Model.knex(db);

class RedirectionHost extends Model {
	$beforeInsert () {
		this.created_on  = Model.raw('NOW()');
		this.modified_on = Model.raw('NOW()');

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
		return 'RedirectionHost';
	}

	static get tableName () {
		return 'redirection_host';
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
					from: 'redirection_host.owner_user_id',
					to:   'user.id'
				},
				modify: function (qb) {
					qb.where('user.is_deleted', 0);
					qb.omit(['id', 'created_on', 'modified_on', 'is_deleted', 'email', 'roles']);
				}
			},
			certificate: {
				relation:   Model.HasOneRelation,
				modelClass: Certificate,
				join:       {
					from: 'redirection_host.certificate_id',
					to:   'certificate.id'
				},
				modify: function (qb) {
					qb.where('certificate.is_deleted', 0);
					qb.omit(['id', 'created_on', 'modified_on', 'is_deleted']);
				}
			}
		};
	}
}

module.exports = RedirectionHost;
