module.exports = {
	development: {
		client:     'mysql',
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	},

	production: {
		client:     'mysql',
		migrations: {
			tableName: 'migrations',
			stub:      'lib/migrate_template.js',
			directory: 'migrations'
		}
	}
};
