#!/usr/bin/env node

const logger = require('./logger').global;

function appStart () {
	const migrate             = require('./migrate');
	const setup               = require('./setup');
	const app                 = require('./app');
	const apiValidator        = require('./lib/validator/api');
	const internalCertificate = require('./internal/certificate');
	const internalIpRanges    = require('./internal/ip_ranges');

	return migrate.latest()
		.then(setup)
		.then(() => {
			return apiValidator.loadSchemas;
		})
		.then(internalIpRanges.fetch)
		.then(() => {

			internalCertificate.initTimer();
			internalIpRanges.initTimer();

			const server = app.listen(3000, () => {
				logger.info('Backend PID ' + process.pid + ' listening on port 3000 ...');

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
