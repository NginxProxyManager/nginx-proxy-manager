#!/usr/bin/env node

'use strict';

const logger = require('./logger').global;

function appStart () {
    const migrate      = require('./migrate');
    const setup        = require('./setup');
    const app          = require('./app');
    const apiValidator = require('./lib/validator/api');

    return migrate.latest()
        .then(() => {
            return setup();
        })
        .then(() => {
            return apiValidator.loadSchemas;
        })
        .then(() => {
            const server = app.listen(81, () => {
                logger.info('PID ' + process.pid + ' listening on port 81 ...');

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

try {
    appStart();
} catch (err) {
    logger.error(err.message);
    process.exit(1);
}
