#!/usr/bin/env node

const schema = require('./schema');
const logger = require('./logger').global;

async function appStart() {
	const migrate = require('./migrate');
	const setup = require('./setup');
	const app = require('./app');
	const internalNginx = require('./internal/nginx');
	const internalCertificate = require('./internal/certificate');
	const internalIpRanges = require('./internal/ip_ranges');

	return migrate
		.latest()
		.then(setup)
		.then(schema.getCompiledSchema)
		.then(internalIpRanges.fetch)
		.then(() => {
			internalNginx.reload();
			internalCertificate.initTimer();
			internalIpRanges.initTimer();

			const server = app.listen('/run/npmplus.sock', () => {
				logger.info('Backend PID ' + process.pid + ' listening on unix socket');

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
			logger.error(err.message, err);
			setTimeout(appStart, 1000);
		});
}

try {
	appStart();
} catch (err) {
	logger.error(err.message, err);
	process.exit(1);
}
