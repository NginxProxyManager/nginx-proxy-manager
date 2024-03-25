const config = require('./lib/config');

if (!config.has('database')) {
	throw new Error('Database config does not exist! Please read the instructions: https://github.com/ZoeyVid/NPMplus');
}

function generateDbConfig() {
	const cfg = config.get('database');
	if (cfg.engine === 'knex-native') {
		return cfg.knex;
	}
	return {
		client: cfg.engine,
		connection: {
			host: cfg.host,
			user: cfg.user,
			password: cfg.password,
			database: cfg.name,
			port: cfg.port,
			ssl: cfg.tls,
		},
		migrations: {
			tableName: 'migrations',
		},
	};
}

module.exports = require('knex')(generateDbConfig());
