const db      = require('../db');
const helpers = require('../lib/helpers');
const Model   = require('objection').Model;
const User    = require('./user');
const now     = require('./now_helper');

Model.knex(db);

const boolFields = [
	'is_deleted',
];

class Upstream extends Model {
	$beforeInsert() {
		this.created_on  = now();
		this.modified_on = now();

		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}

		if (typeof this.servers === 'undefined') {
			this.servers = [];
		}
	}

	$beforeUpdate() {
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

	static get name() {
		return 'Upstream';
	}

	static get tableName() {
		return 'upstream';
	}

	static get jsonAttributes() {
		return ['servers', 'meta'];
	}

	static get relationMappings() {
		return {
			owner: {
				relation:   Model.HasOneRelation,
				modelClass: User,
				join:       {
					from: 'upstream.owner_user_id',
					to:   'user.id'
				},
				modify: function (qb) {
					qb.where('user.is_deleted', 0);
				}
			}
		};
	}
}

module.exports = Upstream;
