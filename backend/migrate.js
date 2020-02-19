const db     = require('./db');
const logger = require('./logger').migrate;

module.exports = {
	latest: function () {
		return db.migrate.currentVersion()
			.then((version) => {
				logger.info('Current database version:', version);
				return db.migrate.latest({
					tableName: 'migrations',
					directory: 'migrations'
				});
			});
	}
};
