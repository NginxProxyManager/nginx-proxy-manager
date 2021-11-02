#!/usr/bin/env node

const logger = require('./logger').global;

async function appStart () {
	// Create config file db settings if environment variables have been set
	await createDbConfigFromEnvironment();

	const migrate             = require('./migrate');
	const setup               = require('./setup');
	const app                 = require('./app');
	const apiValidator        = require('./lib/validator/api');
	const internalCertificate = require('./internal/certificate');
	const internalIpRanges    = require('./internal/ip_ranges');

	return migrate.latest()
		.then(setup)
		.then(() => {
			return apiValidator.loadSchemas;
		})
		.then(internalIpRanges.fetch)
		.then(() => {

			internalCertificate.initTimer();
			internalIpRanges.initTimer();

			const server = app.listen(3000, () => {
				logger.info('Backend PID ' + process.pid + ' listening on port 3000 ...');

				process.on('SIGTERM', () => {
					logger.info('PID ' + process.pid + ' received SIGTERM');
					server.close(() => {
						logger.info('Stopping.');
						process.exit(0);
					});
				});
			});
		})
		.catch((err) => {
			logger.error(err.message);
			setTimeout(appStart, 1000);
		});
}

async function createDbConfigFromEnvironment() {
	return new Promise((resolve, reject) => {
		const envMysqlHost = process.env.DB_MYSQL_HOST || null;
		const envMysqlPort = process.env.DB_MYSQL_PORT || null;
		const envMysqlUser = process.env.DB_MYSQL_USER || null;
		const envMysqlName = process.env.DB_MYSQL_NAME || null;
		let envSqliteFile  = process.env.DB_SQLITE_FILE || null;

		const fs       = require('fs');
		const filename = (process.env.NODE_CONFIG_DIR || './config') + '/' + (process.env.NODE_ENV || 'default') + '.json';
		let configData = {};

		try {
			configData = require(filename);
		} catch (err) {
			// do nothing
		}

		if (configData.database && configData.database.engine && !configData.database.fromEnv) {
			logger.info('Manual db configuration already exists, skipping config creation from environment variables');
			resolve();
			return;
		}

		if ((!envMysqlHost || !envMysqlPort || !envMysqlUser || !envMysqlName) && !envSqliteFile){
			envSqliteFile = '/data/database.sqlite';
			logger.info(`No valid environment variables for database provided, using default SQLite file '${envSqliteFile}'`);
		}

		if (envMysqlHost && envMysqlPort && envMysqlUser && envMysqlName) {
			const newConfig = {
				fromEnv:  true,
				engine:   'mysql',
				host:     envMysqlHost,
				port:     envMysqlPort,
				user:     envMysqlUser,
				password: process.env.DB_MYSQL_PASSWORD,
				name:     envMysqlName,
			};

			if (JSON.stringify(configData.database) === JSON.stringify(newConfig)) {
				// Config is unchanged, skip overwrite
				resolve();
				return;
			}

			logger.info('Generating MySQL knex configuration from environment variables');
			configData.database = newConfig;

		} else {
			const newConfig = {
				fromEnv: true,
				engine:  'knex-native',
				knex:    {
					client:     'sqlite3',
					connection: {
						filename: envSqliteFile
					},
					useNullAsDefault: true
				}
			};
			if (JSON.stringify(configData.database) === JSON.stringify(newConfig)) {
				// Config is unchanged, skip overwrite
				resolve();
				return;
			}

			logger.info('Generating SQLite knex configuration');
			configData.database = newConfig;
		}

		// Write config
		fs.writeFile(filename, JSON.stringify(configData, null, 2), (err) => {
			if (err) {
				logger.error('Could not write db config to config file: ' + filename);
				reject(err);
			} else {
				logger.debug('Wrote db configuration to config file: ' + filename);
				resolve();
			}
		});
	});
}

try {
	appStart();
} catch (err) {
	logger.error(err.message, err);
	process.exit(1);
}

