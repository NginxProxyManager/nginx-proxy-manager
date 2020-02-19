// Objection Docs:
// http://vincit.github.io/objection.js/

const bcrypt = require('bcrypt');
const db     = require('../db');
const Model  = require('objection').Model;
const User   = require('./user');

Model.knex(db);

function encryptPassword () {
	/* jshint -W040 */
	let _this = this;

	if (_this.type === 'password' && _this.secret) {
		return bcrypt.hash(_this.secret, 13)
			.then(function (hash) {
				_this.secret = hash;
			});
	}

	return null;
}

class Auth extends Model {
	$beforeInsert (queryContext) {
		this.created_on  = Model.raw('NOW()');
		this.modified_on = Model.raw('NOW()');

		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}

		return encryptPassword.apply(this, queryContext);
	}

	$beforeUpdate (queryContext) {
		this.modified_on = Model.raw('NOW()');
		return encryptPassword.apply(this, queryContext);
	}

	/**
	 * Verify a plain password against the encrypted password
	 *
	 * @param {String} password
	 * @returns {Promise}
	 */
	verifyPassword (password) {
		return bcrypt.compare(password, this.secret);
	}

	static get name () {
		return 'Auth';
	}

	static get tableName () {
		return 'auth';
	}

	static get jsonAttributes () {
		return ['meta'];
	}

	static get relationMappings () {
		return {
			user: {
				relation:   Model.HasOneRelation,
				modelClass: User,
				join:       {
					from: 'auth.user_id',
					to:   'user.id'
				},
				filter: {
					is_deleted: 0
				},
				modify: function (qb) {
					qb.omit(['is_deleted']);
				}
			}
		};
	}
}

module.exports = Auth;
