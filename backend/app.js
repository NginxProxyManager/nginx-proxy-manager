const express     = require('express');
const bodyParser  = require('body-parser');
const fileUpload  = require('express-fileupload');
const compression = require('compression');
const log         = require('./logger').express;

/**
 * App
 */
const app = express();
app.use(fileUpload());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Gzip
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

// CORS for everything
app.use(require('./lib/express/cors'));

// General security/cache related headers + server header
app.use(function (req, res, next) {
	let x_frame_options = 'DENY';

	if (typeof process.env.X_FRAME_OPTIONS !== 'undefined' && process.env.X_FRAME_OPTIONS) {
		x_frame_options = process.env.X_FRAME_OPTIONS;
	}

	res.set({
		'Strict-Transport-Security': 'includeSubDomains; max-age=631138519; preload',
		'X-XSS-Protection':          '1; mode=block',
		'X-Content-Type-Options':    'nosniff',
		'X-Frame-Options':           x_frame_options,
		'Cache-Control':             'no-cache, no-store, max-age=0, must-revalidate',
		Pragma:                      'no-cache',
		Expires:                     0
	});
	next();
});

app.use(require('./lib/express/jwt')());
app.use('/', require('./routes/api/main'));

// production error handler
// no stacktraces leaked to user
// eslint-disable-next-line
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
	if (typeof err.stack !== 'undefined' && err.stack) {
		if (process.env.NODE_ENV === 'development') {
			log.debug(err.stack);
		} else if (typeof err.public == 'undefined' || !err.public) {
			log.warn(err.message);
		}
	}

	res
		.status(err.status || 500)
		.send(payload);
});

module.exports = app;
