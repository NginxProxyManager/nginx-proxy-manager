'use strict';

const migrate_name = 'initial-schema';
const logger       = require('../logger').migrate;

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.up = function (knex/*, Promise*/) {
    logger.info('[' + migrate_name + '] Migrating Up...');

    return knex.schema.createTable('auth', table => {
        table.increments().primary();
        table.dateTime('created_on').notNull();
        table.dateTime('modified_on').notNull();
        table.integer('user_id').notNull().unsigned();
        table.string('type', 30).notNull();
        table.string('secret').notNull();
        table.json('meta').notNull();
        table.integer('is_deleted').notNull().unsigned().defaultTo(0);
    })
        .then(() => {
            logger.info('[' + migrate_name + '] auth Table created');

            return knex.schema.createTable('user', table => {
                table.increments().primary();
                table.dateTime('created_on').notNull();
                table.dateTime('modified_on').notNull();
                table.integer('is_deleted').notNull().unsigned().defaultTo(0);
                table.integer('is_disabled').notNull().unsigned().defaultTo(0);
                table.string('email').notNull();
                table.string('name').notNull();
                table.string('nickname').notNull();
                table.string('avatar').notNull();
                table.json('roles').notNull();
            });
        })
        .then(() => {
            logger.info('[' + migrate_name + '] user Table created');
        });

};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @param   {Promise} Promise
 * @returns {Promise}
 */
exports.down = function (knex, Promise) {
    logger.warn('[' + migrate_name + '] You can\'t migrate down the initial data.');
    return Promise.resolve(true);
};
