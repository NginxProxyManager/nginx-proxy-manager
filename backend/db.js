const config = require('./lib/config');

if (!config.has('database')) {
	throw new Error('Database config does not exist! Please read the instructions: https://nginxproxymanager.com/setup/');
}

function generateDbConfig() {
	const cfg = config.get('database');
	if (cfg.engine === 'knex-native') {
		return cfg.knex;
	}
	const connection = {
		host:     cfg.host,
		user:     cfg.user,
		password: cfg.password,
		database: cfg.name,
		port:     cfg.port
	};

	// Add PostgreSQL-specific options
	if (cfg.engine === 'pg') {
		if (cfg.schema) {
			connection.schema = cfg.schema;
		}
		if (cfg.sslMode) {
			connection.ssl = cfg.sslMode === 'require' ? true :
							cfg.sslMode === 'prefer' ? { rejectUnauthorized: false } :
							cfg.sslMode === 'disable' ? false :
							cfg.sslMode === 'allow' ? { rejectUnauthorized: false } : false;
		}
	}

	return {
		client:     cfg.engine,
		connection: connection,
		migrations: {
			tableName: 'migrations'
		}
	};
}

module.exports = require('knex')(generateDbConfig());
