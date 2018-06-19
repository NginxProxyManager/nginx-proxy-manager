#!/usr/bin/env node

'use strict';

const config       = require('config');
const app          = require('./app');
const logger       = require('./logger').global;
const migrate      = require('./migrate');
const setup        = require('./setup');
const apiValidator = require('./lib/validator/api');

let port = process.env.PORT || 81;

if (config.has('port')) {
    port = config.get('port');
}

function appStart () {
    return migrate.latest()
        .then(() => {
            return setup();
        })
        .then(() => {
            return apiValidator.loadSchemas;
        })
        .then(() => {
            const server = app.listen(port, () => {
                logger.info('PID ' + process.pid + ' listening on port ' + port + ' ...');

                process.on('SIGTERM', () => {
                    logger.info('PID ' + process.pid + ' received SIGTERM');
                    server.close(() => {
                        logger.info('Stopping.');
                        process.exit(0);
                    });
                });
            });
        })
        .catch(err => {
            logger.error(err.message);
            setTimeout(appStart, 1000);
        });
}

appStart();
