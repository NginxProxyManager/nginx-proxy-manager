// Objection Docs:
// http://vincit.github.io/objection.js/

const db    = require('../db');
const Model = require('objection').Model;

Model.knex(db);

class Setting extends Model {
	$beforeInsert () {
		// Default for meta
		if (typeof this.meta === 'undefined') {
			this.meta = {};
		}
	}

	static get name () {
		return 'Setting';
	}

	static get tableName () {
		return 'setting';
	}

	static get jsonAttributes () {
		return ['meta'];
	}
}

module.exports = Setting;
