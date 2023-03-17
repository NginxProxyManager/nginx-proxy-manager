// Objection Docs:
// http://vincit.github.io/objection.js/

const db             = require('../db');
const Model          = require('objection').Model;
const UserPermission = require('./user_permission');
const now            = require('./now_helper');

Model.knex(db);

class User extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();

		// Default for roles
		if (typeof this.roles === 'undefined') {
			this.roles = [];
		}
	}

	$beforeUpdate () {
		this.modified_on = now();
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
				}
			}
		};
	}

}

module.exports = User;
