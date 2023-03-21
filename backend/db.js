const config = require('./lib/config');

if (!config.has('database')) {
	throw new Error('Database config does not exist! Please read the instructions: https://nginxproxymanager.com/setup/');
}

function generateDbConfig() {
	const cfg = config.get('database');
	if (cfg.engine === 'knex-native') {
		return cfg.knex;
	}
	return {
		client:     cfg.engine,
		connection: {
			host:     cfg.host,
			user:     cfg.user,
			password: cfg.password,
			database: cfg.name,
			port:     cfg.port
		},
		migrations: {
			tableName: 'migrations'
		}
	};
}

module.exports = require('knex')(generateDbConfig());
