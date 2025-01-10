// Objection Docs:
// http://vincit.github.io/objection.js/

const db      = require('../db');
const helpers = require('../lib/helpers');
const Model   = require('objection').Model;
const now     = require('./now_helper');

Model.knex(db);

const boolFields = [
	'is_deleted',
];

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

	$parseDatabaseJson(json) {
		json = super.$parseDatabaseJson(json);
		return helpers.convertIntFieldsToBool(json, boolFields);
	}

	$formatDatabaseJson(json) {
		json = helpers.convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(json);
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
		const ProxyHost       = require('./proxy_host');
		const DeadHost        = require('./dead_host');
		const User            = require('./user');
		const RedirectionHost = require('./redirection_host');

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
			},
			proxy_hosts: {
				relation:   Model.HasManyRelation,
				modelClass: ProxyHost,
				join:       {
					from: 'certificate.id',
					to:   'proxy_host.certificate_id'
				},
				modify: function (qb) {
					qb.where('proxy_host.is_deleted', 0);
				}
			},
			dead_hosts: {
				relation:   Model.HasManyRelation,
				modelClass: DeadHost,
				join:       {
					from: 'certificate.id',
					to:   'dead_host.certificate_id'
				},
				modify: function (qb) {
					qb.where('dead_host.is_deleted', 0);
				}
			},
			redirection_hosts: {
				relation:   Model.HasManyRelation,
				modelClass: RedirectionHost,
				join:       {
					from: 'certificate.id',
					to:   'redirection_host.certificate_id'
				},
				modify: function (qb) {
					qb.where('redirection_host.is_deleted', 0);
				}
			}
		};
	}
}

module.exports = Certificate;
