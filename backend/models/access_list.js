// Objection Docs:
// http://vincit.github.io/objection.js/

const db               = require('../db');
const Model            = require('objection').Model;
const User             = require('./user');
const AccessListAuth   = require('./access_list_auth');
const AccessListClient = require('./access_list_client');
const now              = require('./now_helper');

Model.knex(db);

class AccessList extends Model {
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
		return 'AccessList';
	}

	static get tableName () {
		return 'access_list';
	}

	static get jsonAttributes () {
		return ['meta'];
	}

	static get relationMappings () {
		const ProxyHost = require('./proxy_host');

		return {
			owner: {
				relation:   Model.HasOneRelation,
				modelClass: User,
				join:       {
					from: 'access_list.owner_user_id',
					to:   'user.id'
				},
				modify: function (qb) {
					qb.where('user.is_deleted', 0);
				}
			},
			items: {
				relation:   Model.HasManyRelation,
				modelClass: AccessListAuth,
				join:       {
					from: 'access_list.id',
					to:   'access_list_auth.access_list_id'
				}
			},
			clients: {
				relation:   Model.HasManyRelation,
				modelClass: AccessListClient,
				join:       {
					from: 'access_list.id',
					to:   'access_list_client.access_list_id'
				}
			},
			proxy_hosts: {
				relation:   Model.HasManyRelation,
				modelClass: ProxyHost,
				join:       {
					from: 'access_list.id',
					to:   'proxy_host.access_list_id'
				},
				modify: function (qb) {
					qb.where('proxy_host.is_deleted', 0);
				}
			}
		};
	}
}

module.exports = AccessList;
