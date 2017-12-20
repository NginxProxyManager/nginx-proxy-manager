'use strict';

const express     = require('express');
const bodyParser  = require('body-parser');
const compression = require('compression');
const logger      = require('./logger');

/**
 * App
 */
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(compression());

/**
 * General Logging, BEFORE routes
 */
app.disable('x-powered-by');
app.enable('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
app.enable('strict routing');

// pretty print JSON when not live
if (process.env.NODE_ENV !== 'production') {
    app.set('json spaces', 2);
}

// General security/cache related headers + server header
app.use(function (req, res, next) {
    res.set({
        'Strict-Transport-Security': 'includeSubDomains; max-age=631138519; preload',
        'X-XSS-Protection':          '0',
        'X-Content-Type-Options':    'nosniff',
        'X-Frame-Options':           'DENY',
        'Cache-Control':             'no-cache, no-store, max-age=0, must-revalidate',
        Pragma:                      'no-cache',
        Expires:                     0
    });
    next();
});

/**
 * Routes
 */
app.use('/css',    express.static('dist/css'));
app.use('/fonts',  express.static('dist/fonts'));
app.use('/images', express.static('dist/images'));
app.use('/js',     express.static('dist/js'));
app.use('/api',    require('./routes/api/main'));
app.use('/',       require('./routes/main'));

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    let payload = {
        error: {
            code:    err.status,
            message: err.public ? err.message : 'Internal Error'
        }
    };

    if (process.env.NODE_ENV === 'development') {
        payload.debug = {
            stack:    typeof err.stack !== 'undefined' && err.stack ? err.stack.split('\n') : null,
            previous: err.previous
        };
    }

    // Not every error is worth logging - but this is good for now until it gets annoying.
    if (!err.public && typeof err.stack !== 'undefined' && err.stack) {
        logger.warn(err.stack);
    }

    res.status(err.status || 500).send(payload);
});

module.exports = app;
