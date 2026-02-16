import fs from "node:fs";
import NodeRSA from "node-rsa";
import { global as logger } from "../logger.js";

const keysFile         = '/data/keys.json';
const mysqlEngine      = 'mysql2';
const postgresEngine   = 'pg';
const sqliteClientName = 'better-sqlite3';

let instance = null;

// 1. Load from config file first (not recommended anymore)
// 2. Use config env variables next
const configure = () => {
	const filename = `${process.env.NODE_CONFIG_DIR || "./config"}/${process.env.NODE_ENV || "default"}.json`;
	if (fs.existsSync(filename)) {
		let configData;
		try {
			// Load this json  synchronously
			const rawData = fs.readFileSync(filename);
			configData = JSON.parse(rawData);
		} catch (_) {
			// do nothing
		}

		if (configData?.database) {
			logger.info(`Using configuration from file: ${filename}`);

			// Migrate those who have "mysql" engine to "mysql2"
			if (configData.database.engine === "mysql") {
				configData.database.engine = mysqlEngine;
			}

			instance = configData;
			instance.keys = getKeys();
			return;
		}
	}

	const toBool = (v) => /^(1|true|yes|on)$/i.test((v || '').trim());

	const envMysqlHost                  = process.env.DB_MYSQL_HOST || null;
	const envMysqlUser                  = process.env.DB_MYSQL_USER || null;
	const envMysqlName                  = process.env.DB_MYSQL_NAME || null;
	const envMysqlSSL                   = toBool(process.env.DB_MYSQL_SSL);
	const envMysqlSSLRejectUnauthorized	= process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED === undefined ? true : toBool(process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED);
	const envMysqlSSLVerifyIdentity		= process.env.DB_MYSQL_SSL_VERIFY_IDENTITY === undefined ? true : toBool(process.env.DB_MYSQL_SSL_VERIFY_IDENTITY);
	if (envMysqlHost && envMysqlUser && envMysqlName) {
		// we have enough mysql creds to go with mysql
		logger.info("Using MySQL configuration");
		instance = {
			database: {
				engine: mysqlEngine,
				host: envMysqlHost,
				port: process.env.DB_MYSQL_PORT || 3306,
				user: envMysqlUser,
				password: process.env.DB_MYSQL_PASSWORD,
				name:     envMysqlName,
				ssl:      envMysqlSSL ? { rejectUnauthorized: envMysqlSSLRejectUnauthorized, verifyIdentity: envMysqlSSLVerifyIdentity } : false,
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
		logger.info("Using Postgres configuration");
		instance = {
			database: {
				engine: postgresEngine,
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

	const envSqliteFile = process.env.DB_SQLITE_FILE || "/data/database.sqlite";

	logger.info(`Using Sqlite: ${envSqliteFile}`);
	instance = {
		database: {
			engine: "knex-native",
			knex: {
				client: sqliteClientName,
				connection: {
					filename: envSqliteFile,
				},
				useNullAsDefault: true,
			},
		},
		keys: getKeys(),
	};
};

const getKeys = () => {
	// Get keys from file
	if (isDebugMode()) {
		logger.debug("Checking for keys file:", keysFile);
	}
	if (!fs.existsSync(keysFile)) {
		generateKeys();
	} else if (process.env.DEBUG) {
		logger.info("Keys file exists OK");
	}
	try {
		// Load this json keysFile synchronously and return the json object
		const rawData = fs.readFileSync(keysFile);
		return JSON.parse(rawData);
	} catch (err) {
		logger.error(`Could not read JWT key pair from config file: ${keysFile}`, err);
		process.exit(1);
	}
};

const generateKeys = () => {
	logger.info("Creating a new JWT key pair...");
	// Now create the keys and save them in the config.
	const key = new NodeRSA({ b: 2048 });
	key.generateKeyPair();

	const keys = {
		key: key.exportKey("private").toString(),
		pub: key.exportKey("public").toString(),
	};

	// Write keys config
	try {
		fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
	} catch (err) {
		logger.error(`Could not write JWT key pair to config file: ${keysFile}: ${err.message}`);
		process.exit(1);
	}
	logger.info(`Wrote JWT key pair to config file: ${keysFile}`);
};

/**
 *
 * @param   {string}  key   ie: 'database' or 'database.engine'
 * @returns {boolean}
 */
const configHas = (key) => {
	instance === null && configure();
	const keys = key.split(".");
	let level = instance;
	let has = true;
	keys.forEach((keyItem) => {
		if (typeof level[keyItem] === "undefined") {
			has = false;
		} else {
			level = level[keyItem];
		}
	});

	return has;
};

/**
 * Gets a specific key from the top level
 *
 * @param {string} key
 * @returns {*}
 */
const configGet = (key) => {
	instance === null && configure();
	if (key && typeof instance[key] !== "undefined") {
		return instance[key];
	}
	return instance;
};

/**
 * Is this a sqlite configuration?
 *
 * @returns {boolean}
 */
const isSqlite = () => {
	instance === null && configure();
	return instance.database.knex && instance.database.knex.client === sqliteClientName;
};

/**
 * Is this a mysql configuration?
 *
 * @returns {boolean}
 */
const isMysql = () => {
	instance === null && configure();
	return instance.database.engine === mysqlEngine;
};

/**
 * Is this a postgres configuration?
 *
 * @returns {boolean}
 */
const isPostgres = () => {
	instance === null && configure();
	return instance.database.engine === postgresEngine;
};

/**
 * Are we running in debug mdoe?
 *
 * @returns {boolean}
 */
const isDebugMode = () => !!process.env.DEBUG;

/**
 * Are we running in CI?
 *
 * @returns {boolean}
 */
const isCI = () => process.env.CI === 'true' && process.env.DEBUG === 'true';

/**
 * Returns a public key
 *
 * @returns {string}
 */
const getPublicKey = () => {
	instance === null && configure();
	return instance.keys.pub;
};

/**
 * Returns a private key
 *
 * @returns {string}
 */
const getPrivateKey = () => {
	instance === null && configure();
	return instance.keys.key;
};

/**
 * @returns {boolean}
 */
const useLetsencryptStaging = () => !!process.env.LE_STAGING;

/**
 * @returns {string|null}
 */
const useLetsencryptServer = () => {
	if (process.env.LE_SERVER) {
		return process.env.LE_SERVER;
	}
	return null;
};

export { isCI, configHas, configGet, isSqlite, isMysql, isPostgres, isDebugMode, getPrivateKey, getPublicKey, useLetsencryptStaging, useLetsencryptServer };
