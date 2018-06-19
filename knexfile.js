module.exports = {
    development: {
        client:     'mysql',
        migrations: {
            tableName: 'migrations',
            stub:      'src/backend/lib/migrate_template.js',
            directory: 'src/backend/migrations'
        }
    },

    production: {
        client:     'mysql',
        migrations: {
            tableName: 'migrations',
            stub:      'src/backend/lib/migrate_template.js',
            directory: 'src/backend/migrations'
        }
    }
};
