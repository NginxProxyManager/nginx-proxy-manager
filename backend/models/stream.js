// Objection Docs:
// http://vincit.github.io/objection.js/

const db      = require('../db');
const helpers = require('../lib/helpers');
const Model   = require('objection').Model;
const User    = require('./user');
const now     = require('./now_helper');

Model.knex(db);

const boolFields = [
	'is_deleted',
	'tcp_forwarding',
	'udp_forwarding',
];

class Stream extends Model {
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

	$parseDatabaseJson(json) {
		json = super.$parseDatabaseJson(json);
		return helpers.convertIntFieldsToBool(json, boolFields);
	}

	$formatDatabaseJson(json) {
		json = helpers.convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(json);
	}

	static get name () {
		return 'Stream';
	}

	static get tableName () {
		return 'stream';
	}

	static get jsonAttributes () {
		return ['meta'];
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
