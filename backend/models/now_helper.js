const db     = require('../db');
const config = require('../lib/config');
const Model  = require('objection').Model;

Model.knex(db);

module.exports = function () {
	if (config.isSqlite()) {
		// eslint-disable-next-line
		return Model.raw("datetime('now','localtime')");
	}
	return Model.raw('NOW()');
};
