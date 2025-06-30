// Objection Docs:
// http://vincit.github.io/objection.js/

const db          = require('../db');
const helpers     = require('../lib/helpers');
const Model       = require('objection').Model;
const User        = require('./user');
const AccessList  = require('./access_list');
const Certificate = require('./certificate');
const now         = require('./now_helper');

Model.knex(db);

const boolFields = [
	'is_deleted',
	'ssl_forced',
	'caching_enabled',
	'block_exploits',
	'allow_websocket_upgrade',
	'http2_support',
	'enabled',
	'hsts_enabled',
	'hsts_subdomains',
];

class ProxyHost extends Model {
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
		return 'ProxyHost';
	}

	static get tableName () {
		return 'proxy_host';
	}

	static get jsonAttributes () {
		return ['domain_names', 'meta', 'locations'];
	}

	static get relationMappings () {
		return {
			owner: {
				relation:   Model.HasOneRelation,
				modelClass: User,
				join:       {
					from: 'proxy_host.owner_user_id',
					to:   'user.id'
				},
				modify: function (qb) {
					qb.where('user.is_deleted', 0);
				}
			},
			access_list: {
				relation:   Model.HasOneRelation,
				modelClass: AccessList,
				join:       {
					from: 'proxy_host.access_list_id',
					to:   'access_list.id'
				},
				modify: function (qb) {
					qb.where('access_list.is_deleted', 0);
				}
			},
			certificate: {
				relation:   Model.HasOneRelation,
				modelClass: Certificate,
				join:       {
					from: 'proxy_host.certificate_id',
					to:   'certificate.id'
				},
				modify: function (qb) {
					qb.where('certificate.is_deleted', 0);
				}
			}
		};
	}
}

module.exports = ProxyHost;
