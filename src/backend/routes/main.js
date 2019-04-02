'use strict';

const express = require('express');
const fs      = require('fs');
const PACKAGE = require('../../../package.json');
const path    = require('path')

const router = express.Router({
    caseSensitive: true,
    strict:        true,
    mergeParams:   true
});

/**
 * GET /login
 */
router.get('/login', function (req, res, next) {
    res.render('login', {
        version: PACKAGE.version
    });
});

/**
 * GET .*
 */
router.get(/(.*)/, function (req, res, next) {
    req.params.page = req.params['0'];
    if (req.params.page === '/') {
        res.render('index', {
            version: PACKAGE.version
        });
    } else {
        var p = path.normalize('dist' + req.params.page)
        if (p.startsWith('dist')) { // Allow access to ressources under 'dist' directory only.
            fs.readFile(p, 'utf8', function (err, data) {
                if (err) {
                    res.render('index', {
                        version: PACKAGE.version
                    });
                } else {
                    res.contentType('text/html').end(data);
                }
            });
        } else {
            res.render('index', {
                version: PACKAGE.version
            });
        }
    }
});

module.exports = router;
