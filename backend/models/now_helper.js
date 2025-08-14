const db     = require('../db');
const config = require('../lib/config');
const Model  = require('objection').Model;

Model.knex(db);

module.exports = function () {
	// Return consistent datetime format for all database types
	if (config.isSqlite()) {
		// SQLite: Return ISO format
		return Model.raw("datetime('now')");
	} else if (config.isPostgres()) {
		// PostgreSQL: Return ISO format
		return Model.raw("NOW()");
	} else {
		// MySQL: Return ISO format
		return Model.raw("NOW()");
	}
};
