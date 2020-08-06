// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;
const now   = require('./now_helper');

Model.knex(db);

class UserPermission extends Model {
	$beforeInsert () {
		this.created_on  = now();
		this.modified_on = now();
	}

	$beforeUpdate () {
		this.modified_on = now();
	}

	static get name () {
		return 'UserPermission';
	}

	static get tableName () {
		return 'user_permission';
	}
}

module.exports = UserPermission;
