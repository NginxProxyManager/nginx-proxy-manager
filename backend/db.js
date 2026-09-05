import knex from "knex";
import {configGet, configHas} from "./lib/config.js";

let instance = null;

const generateDbConfig = () => {
	if (!configHas("database")) {
		throw new Error(
			"Database config does not exist. See https://github.com/Lorwell/nginx-proxy-manager/blob/dev/docs/src/setup/index.md",
		);
	}

	const cfg = configGet("database");

	if (cfg.engine === "knex-native") {
		return cfg.knex;
	}

	return {
		client: cfg.engine,
		connection: {
			host: cfg.host,
			user: cfg.user,
			password: cfg.password,
			database: cfg.name,
			port:     cfg.port,
			...(cfg.ssl ? { ssl: cfg.ssl } : {})
		},
		migrations: {
			tableName: "migrations",
		},
	};
};

const getInstance = () => {
	if (!instance) {
		instance = knex(generateDbConfig());
	}
	return instance;
}

export default getInstance;
