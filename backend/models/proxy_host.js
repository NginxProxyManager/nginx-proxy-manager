// Objection Docs:
// http://vincit.github.io/objection.js/

const db          = require('../db');
const Model       = require('objection').Model;
const User        = require('./user');
const AccessList  = require('./access_list');
const Certificate = require('./certificate');
const now         = require('./now_helper');

Model.knex(db);

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
