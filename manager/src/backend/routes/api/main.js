'use strict';

const express = require('express');
const pjson   = require('../../../../package.json');

let router = express.Router({
    caseSensitive: true,
    strict:        true,
    mergeParams:   true
});

/**
 * GET /api
 */
router.get('/', (req, res/*, next*/) => {
    let version = pjson.version.split('-').shift().split('.');

    res.status(200).send({
        status:  'Healthy',
        version: {
            major:    parseInt(version.shift(), 10),
            minor:    parseInt(version.shift(), 10),
            revision: parseInt(version.shift(), 10)
        }
    });
});

router.use('/hosts', require('./hosts'));
router.use('/access', require('./access'));

module.exports = router;
