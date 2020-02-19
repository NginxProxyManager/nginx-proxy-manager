// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;
const User  = require('./user');

Model.knex(db);

class Stream extends Model {
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
					qb.omit(['id', 'created_on', 'modified_on', 'is_deleted', 'email', 'roles']);
				}
			}
		};
	}
}

module.exports = Stream;
