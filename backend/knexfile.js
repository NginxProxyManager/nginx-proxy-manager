module.exports = {
	development: {
		client:     'mysql2',
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	},

	production: {
		client:     'mysql2',
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	},

	postgres: {
		client:     'pg',
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	}
};
