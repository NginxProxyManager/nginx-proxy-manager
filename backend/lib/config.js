import { existsSync, readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { global as logger } from "../logger.js";

const keysFile = "/data/npmplus/keys.json";
const sqliteEngine = "better-sqlite3";
const mysqlEngine = "mysql2";
const postgresEngine = "pg";

let instance = null;

const configure = () => {
	const toBool = (v) => /^(1|true|yes|on)$/i.test((v || "").trim());

	const envMysqlHost = process.env.DB_MYSQL_HOST || null;
	const envMysqlUser = process.env.DB_MYSQL_USER || null;
	const envMysqlName = process.env.DB_MYSQL_NAME || null;
	const envMysqlSSL = toBool(process.env.DB_MYSQL_SSL);
	const envMysqlSSLRejectUnauthorized =
		process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED === undefined
			? true
			: toBool(process.env.DB_MYSQL_SSL_REJECT_UNAUTHORIZED);
	const envMysqlSSLVerifyIdentity =
		process.env.DB_MYSQL_SSL_VERIFY_IDENTITY === undefined
			? true
			: toBool(process.env.DB_MYSQL_SSL_VERIFY_IDENTITY);
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
				name: envMysqlName,
				ssl: envMysqlSSL
					? { rejectUnauthorized: envMysqlSSLRejectUnauthorized, verifyIdentity: envMysqlSSLVerifyIdentity }
					: false,
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

	const envSqliteFile = "/data/npmplus/database.sqlite";

	logger.info(`Using Sqlite: ${envSqliteFile}`);
	instance = {
		database: {
			engine: "knex-native",
			knex: {
				client: sqliteEngine,
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
	logger.info("Checking for keys file:", keysFile);
	if (!existsSync(keysFile)) {
		generateKeys();
	} else {
		logger.info("Keys file exists OK");
	}
	try {
		// Load this json keysFile synchronously and return the json object
		const rawData = readFileSync(keysFile, "utf8");
		return JSON.parse(rawData);
	} catch (err) {
		logger.error(`Could not read JWT key pair from config file: ${keysFile}`, err);
		process.exit(1);
	}
};

const generateKeys = () => {
	logger.info("Creating a new JWT key pair...");

	// Now create the keys and save them in the config.
	const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		publicKeyEncoding: {
			type: "spki",
			format: "pem",
		},
		privateKeyEncoding: {
			type: "pkcs8",
			format: "pem",
		},
	});

	// Write keys config
	try {
		writeFileSync(keysFile, JSON.stringify({ key: privateKey, pub: publicKey }, null, 2));
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
	return instance.database.knex && instance.database.knex.client === sqliteEngine;
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
 * Are we running in CI?
 *
 * @returns {boolean}
 */
const isCI = () => process.env.CI === "true" && process.env.DEBUG === "true";

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

export { isCI, configHas, configGet, isSqlite, isMysql, isPostgres, getPrivateKey, getPublicKey };
