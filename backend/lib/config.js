const fs      = require('fs');
const NodeRSA = require('node-rsa');
const logger  = require('../logger').global;

const keysFile         = '/data/keys.json';
const mysqlEngine      = 'mysql2';
const postgresEngine   = 'pg';
const sqliteClientName = 'sqlite3';

let instance = null;

// 1. Load from config file first (not recommended anymore)
// 2. Use config env variables next
const configure = () => {
	const filename = (process.env.NODE_CONFIG_DIR || './config') + '/' + (process.env.NODE_ENV || 'default') + '.json';
	if (fs.existsSync(filename)) {
		let configData;
		try {
			configData = require(filename);
		} catch (_) {
			// do nothing
		}

		if (configData && configData.database) {
			logger.info(`Using configuration from file: ${filename}`);
			instance      = configData;
			instance.keys = getKeys();
			return;
		}
	}

	const envMysqlHost = process.env.DB_MYSQL_HOST || null;
	const envMysqlUser = process.env.DB_MYSQL_USER || null;
	const envMysqlName = process.env.DB_MYSQL_NAME || null;
	if (envMysqlHost && envMysqlUser && envMysqlName) {
		// we have enough mysql creds to go with mysql
		logger.info('Using MySQL configuration');
		instance = {
			database: {
				engine:   mysqlEngine,
				host:     envMysqlHost,
				port:     process.env.DB_MYSQL_PORT || 3306,
				user:     envMysqlUser,
				password: process.env.DB_MYSQL_PASSWORD,
				name:     envMysqlName,
			},
			keys: getKeys(),
		};
		return;
	}

	const envPostgresHost = process.env.DB_POSTGRES_HOST || null;
	const envPostgresUser = process.env.DB_POSTGRES_USER || null;
	const envPostgresName = process.env.DB_POSTGRES_NAME || null;
	if (envPostgresHost && envPostgresUser && envPostgresName) {
		// we have enough postgres creds to go with postgres
		logger.info('Using Postgres configuration');
		instance = {
			database: {
				engine:   postgresEngine,
				host:     envPostgresHost,
				port:     process.env.DB_POSTGRES_PORT || 5432,
				user:     envPostgresUser,
				password: process.env.DB_POSTGRES_PASSWORD,
				name:     envPostgresName,
			},
			keys: getKeys(),
		};
		return;
	}

	const envSqliteFile = process.env.DB_SQLITE_FILE || '/data/database.sqlite';
	logger.info(`Using Sqlite: ${envSqliteFile}`);
	instance = {
		database: {
			engine: 'knex-native',
			knex:   {
				client:     sqliteClientName,
				connection: {
					filename: envSqliteFile
				},
				useNullAsDefault: true
			}
		},
		keys: getKeys(),
	};
};

const getKeys = () => {
	// Get keys from file
	if (!fs.existsSync(keysFile)) {
		generateKeys();
	} else if (process.env.DEBUG) {
		logger.info('Keys file exists OK');
	}
	try {
		return require(keysFile);
	} catch (err) {
		logger.error('Could not read JWT key pair from config file: ' + keysFile, err);
		process.exit(1);
	}
};

const generateKeys = () => {
	logger.info('Creating a new JWT key pair...');
	// Now create the keys and save them in the config.
	const key = new NodeRSA({ b: 2048 });
	key.generateKeyPair();

	const keys = {
		key: key.exportKey('private').toString(),
		pub: key.exportKey('public').toString(),
	};

	// Write keys config
	try {
		fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
	} catch (err) {
		logger.error('Could not write JWT key pair to config file: ' + keysFile + ': ' + err.message);
		process.exit(1);
	}
	logger.info('Wrote JWT key pair to config file: ' + keysFile);
};

module.exports = {

	/**
	 *
	 * @param   {string}  key   ie: 'database' or 'database.engine'
	 * @returns {boolean}
	 */
	has: function(key) {
		instance === null && configure();
		const keys = key.split('.');
		let level  = instance;
		let has    = true;
		keys.forEach((keyItem) =>{
			if (typeof level[keyItem] === 'undefined') {
				has = false;
			} else {
				level = level[keyItem];
			}
		});

		return has;
	},

	/**
	 * Gets a specific key from the top level
	 *
	 * @param {string} key
	 * @returns {*}
	 */
	get: function (key) {
		instance === null && configure();
		if (key && typeof instance[key] !== 'undefined') {
			return instance[key];
		}
		return instance;
	},

	/**
	 * Is this a sqlite configuration?
	 *
	 * @returns {boolean}
	 */
	isSqlite: function () {
		instance === null && configure();
		return instance.database.knex && instance.database.knex.client === sqliteClientName;
	},

	/**
	 * Is this a mysql configuration?
	 *
	 * @returns {boolean}
	 */
	isMysql: function () {
		instance === null && configure();
		return instance.database.engine === mysqlEngine;
	},
	
	/**
		 * Is this a postgres configuration?
		 *
		 * @returns {boolean}
		 */
	isPostgres: function () {
		instance === null && configure();
		return instance.database.engine === postgresEngine;
	},

	/**
	 * Are we running in debug mdoe?
	 *
	 * @returns {boolean}
	 */
	debug: function () {
		return !!process.env.DEBUG;
	},

	/**
	 * Returns a public key
	 *
	 * @returns {string}
	 */
	getPublicKey: function () {
		instance === null && configure();
		return instance.keys.pub;
	},

	/**
	 * Returns a private key
	 *
	 * @returns {string}
	 */
	getPrivateKey: function () {
		instance === null && configure();
		return instance.keys.key;
	},

	/**
	 * @returns {boolean}
	 */
	useLetsencryptStaging: function () {
		return !!process.env.LE_STAGING;
	},

	/**
	 * @returns {string|null}
	 */
	useLetsencryptServer: function () {
		if (process.env.LE_SERVER) {
			return process.env.LE_SERVER;
		}
		return null;
	}
};
