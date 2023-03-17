const db     = require('../db');
const config = require('config');
const Model  = require('objection').Model;

Model.knex(db);

module.exports = function () {
	if (config.database.knex && config.database.knex.client === 'sqlite3') {
		// eslint-disable-next-line
		return Model.raw("datetime('now','localtime')");
	}
	return Model.raw('NOW()');
};
