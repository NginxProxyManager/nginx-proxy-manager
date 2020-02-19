// Objection Docs:
// http://vincit.github.io/objection.js/

const db             = require('../db');
const Model          = require('objection').Model;
const UserPermission = require('./user_permission');

Model.knex(db);

class User extends Model {
	$beforeInsert () {
		this.created_on  = Model.raw('NOW()');
		this.modified_on = Model.raw('NOW()');

		// Default for roles
		if (typeof this.roles === 'undefined') {
			this.roles = [];
		}
	}

	$beforeUpdate () {
		this.modified_on = Model.raw('NOW()');
	}

	static get name () {
		return 'User';
	}

	static get tableName () {
		return 'user';
	}

	static get jsonAttributes () {
		return ['roles'];
	}

	static get relationMappings () {
		return {
			permissions: {
				relation:   Model.HasOneRelation,
				modelClass: UserPermission,
				join:       {
					from: 'user.id',
					to:   'user_permission.user_id'
				},
				modify: function (qb) {
					qb.omit(['id', 'created_on', 'modified_on', 'user_id']);
				}
			}
		};
	}

}

module.exports = User;
