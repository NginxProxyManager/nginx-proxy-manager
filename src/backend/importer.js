'use strict';

const fs     = require('fs');
const logger = require('./logger').import;
const utils  = require('./lib/utils');

module.exports = function () {
    return new Promise((resolve, reject) => {
        if (fs.existsSync('/config') && !fs.existsSync('/config/v2-imported')) {

            logger.info('Beginning import from V1 ...');

            // Setup
            const batchflow = require('batchflow');
            const db        = require('diskdb');
            module.exports  = db.connect('/config', ['hosts', 'access']);

            // Create a fake access object
            const Access = require('./lib/access');
            let access   = new Access(null);
            resolve(access.load(true)
                .then(access => {



                    // Import access lists first
                    let lists = db.access.find();
                    lists.map(list => {
                        logger.warn('List:', list);

                    });

                })
            );

            /*
                        let hosts = db.hosts.find();
                        hosts.map(host => {
                            logger.warn('Host:', host);
                        });
            */

            // Looks like we need to import from version 1
            // There are numerous parts to this import:
            //
            // 1. The letsencrypt certificates, the need to be added to the database and files renamed
            // 2. The access lists from the previous datastore
            // 3. The Hosts from the previous datastore

            // get all hosts:
            // resolve(db.hosts.find());

            // get specific host:
            // existing_host = db.hosts.findOne({incoming_port: payload.incoming_port});

            // remove host:
            // db.hosts.remove({hostname: payload.hostname});

            // get all access:
            // resolve(db.access.find());

            resolve();

        } else {
            resolve();
        }
    });
};
