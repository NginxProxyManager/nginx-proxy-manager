#!/usr/bin/env node

const logger = require('./logger').global;

async function appStart () {
	const migrate             = require('./migrate');
	const setup               = require('./setup');
	const app                 = require('./app');
	const apiValidator        = require('./lib/validator/api');
	const internalNginx       = require('./internal/nginx');
	const internalCertificate = require('./internal/certificate');
	const internalIpRanges    = require('./internal/ip_ranges');

	return migrate.latest()
		.then(setup)
		.then(() => {
			return apiValidator.loadSchemas;
		})
		.then(internalIpRanges.fetch)
		.then(() => {
			internalNginx.reload();
			internalCertificate.initTimer();
			internalIpRanges.initTimer();

			const server = app.listen(48693, '127.0.0.1', () => {
				logger.info('Backend PID ' + process.pid + ' listening on port 48693 ...');

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
			logger.error(err.message);
			setTimeout(appStart, 1000);
		});
}

try {
	appStart();
} catch (err) {
	logger.error(err.message, err);
	process.exit(1);
}
