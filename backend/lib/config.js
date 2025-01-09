const fs = require('fs');
const NodeRSA = require('node-rsa');
const logger = require('../logger').global;

const keysFile = '/data/npmplus/keys.json';

let instance = null;

// 1. Load from config file first (not recommended anymore)
// 2. Use config env variables next
const configure = () => {
	const filename = (process.env.NODE_CONFIG_DIR || '/data/npmplus') + '/' + (process.env.NODE_ENV || 'default') + '.json';
	if (fs.existsSync(filename)) {
		let configData;
		try {
			configData = require(filename);
		} catch {
			// do nothing
		}

		if (configData && configData.database) {
			logger.info(`Using configuration from file: ${filename}`);
			instance = configData;
			instance.keys = getKeys();
			return;
		}
	}

	const envMysqlHost = process.env.DB_MYSQL_HOST || null;
	const envMysqlUser = process.env.DB_MYSQL_USER || null;
	const envMysqlName = process.env.DB_MYSQL_NAME || null;
	const envMysqlTls = process.env.DB_MYSQL_TLS || null;
	const envMysqlCa = process.env.DB_MYSQL_CA || '/etc/ssl/certs/ca-certificates.crt';
	if (envMysqlHost && envMysqlUser && envMysqlName) {
		// we have enough mysql creds to go with mysql
		logger.info('Using MySQL configuration');
		instance = {
			database: {
				engine: 'mysql2',
				host: envMysqlHost,
				port: process.env.DB_MYSQL_PORT || 3306,
				user: envMysqlUser,
				password: process.env.DB_MYSQL_PASSWORD,
				name: envMysqlName,
				ssl: envMysqlTls ? { ca: fs.readFileSync(envMysqlCa) } : false,
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
				engine: 'pg',
				host: envPostgresHost,
				port: process.env.DB_POSTGRES_PORT || 5432,
				user: envPostgresUser,
				password: process.env.DB_POSTGRES_PASSWORD,
				name: envPostgresName,
			},
			keys: getKeys(),
		};
		return;
	}

	logger.info('Using Sqlite: /data/npmplus/database.sqlite');
	instance = {
		database: {
			engine: 'knex-native',
			knex: {
				client: 'better-sqlite3',
				connection: {
					filename: '/data/npmplus/database.sqlite',
				},
				useNullAsDefault: true,
			},
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
	has: function (key) {
		instance === null && configure();
		const keys = key.split('.');
		let level = instance;
		let has = true;
		keys.forEach((keyItem) => {
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
		return instance.database.knex && instance.database.knex.client === 'better-sqlite3';
	},

	/**
	 * Is this a mysql configuration?
	 *
	 * @returns {boolean}
	 */
	isMysql: function () {
		instance === null && configure();
		return instance.database.engine === 'mysql2';
	},

	/**
	 * Is this a postgres configuration?
	 *
	 * @returns {boolean}
	 */
	isPostgres: function () {
		instance === null && configure();
		return instance.database.engine === 'pg';
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
};
