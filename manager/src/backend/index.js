#!/usr/bin/env node

'use strict';

const app          = require('./app');
const logger       = require('./logger');
const apiValidator = require('./lib/validator/api');
const internalSsl  = require('./internal/ssl');

let port = process.env.PORT || 81;

apiValidator.loadSchemas
    .then(() => {

        internalSsl.initTimer();

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
    .catch((err) => {
        logger.error(err);
        process.exit(1);
    });
