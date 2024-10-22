
// Objection Docs:
// http://vincit.github.io/objection.js/

const db          = require('../db');
const helpers     = require('../lib/helpers');
const Model       = require('objection').Model;
const User        = require('./user');
const Certificate = require('./certificate');
const now         = require('./now_helper');

Model.knex(db);

const boolFields = [
	'is_deleted',
	'enabled',
	'preserve_path',
	'ssl_forced',
	'block_exploits',
	'hsts_enabled',
	'hsts_subdomains',
	'http2_support',
];

class RedirectionHost extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();

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
				}
			}
		};
	}
}

module.exports = RedirectionHost;
