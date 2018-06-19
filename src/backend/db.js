'use strict';

let config = require('config');

if (!config.has('database')) {
    throw new Error('Database config does not exist! Read the README for instructions.');
}

let knex = require('knex')({
    client:     config.database.engine,
    connection: {
        host:     config.database.host,
        user:     config.database.user,
        password: config.database.password,
        database: config.database.name,
        port:     config.database.port
    },
    migrations: {
        tableName: 'migrations'
    }
});

module.exports = knex;
