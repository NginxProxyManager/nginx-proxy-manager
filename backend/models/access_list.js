// Objection Docs:
// http://vincit.github.io/objection.js/

const db             = require('../db');
const Model          = require('objection').Model;
const User           = require('./user');
const AccessListAuth = require('./access_list_auth');

Model.knex(db);

class AccessList extends Model {
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
					qb.omit(['id', 'created_on', 'modified_on', 'is_deleted', 'email', 'roles']);
				}
			},
			items: {
				relation:   Model.HasManyRelation,
				modelClass: AccessListAuth,
				join:       {
					from: 'access_list.id',
					to:   'access_list_auth.access_list_id'
				},
				modify: function (qb) {
					qb.omit(['id', 'created_on', 'modified_on', 'access_list_id', 'meta']);
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
					qb.omit(['is_deleted', 'meta']);
				}
			}
		};
	}
}

module.exports = AccessList;
