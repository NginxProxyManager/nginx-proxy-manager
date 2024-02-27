// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;
const User  = require('./user');
const now   = require('./now_helper');

Model.knex(db);

class Stream extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();

		// Default for forwarding_hosts
		if (typeof this.forwarding_hosts === 'undefined') {
			this.forwarding_hosts = [];
		}
		
		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}
	}

	$beforeUpdate () {
		this.modified_on = now();

		// Sort domain_names
		if (typeof this.forwarding_hosts !== 'undefined') {
			this.forwarding_hosts.sort();
		}
	}

	static get name () {
		return 'Stream';
	}

	static get tableName () {
		return 'stream';
	}

	static get jsonAttributes () {
		return ['forwarding_hosts', 'meta'];
	}

	static get relationMappings () {
		return {
			owner: {
				relation:   Model.HasOneRelation,
				modelClass: User,
				join:       {
					from: 'stream.owner_user_id',
					to:   'user.id'
				},
				modify: function (qb) {
					qb.where('user.is_deleted', 0);
				}
			}
		};
	}
}

module.exports = Stream;
