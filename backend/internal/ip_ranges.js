const https = require('https');
const fs = require('fs');
const logger = require('../logger').ip_ranges;
const error = require('../lib/error');
const utils = require('../lib/utils');
const internalNginx = require('./nginx');

const CLOUDFARE_V4_URL = 'https://www.cloudflare.com/ips-v4';
const CLOUDFARE_V6_URL = 'https://www.cloudflare.com/ips-v6';

const regIpV4 = /^(\d+\.?){4}\/\d+/;
const regIpV6 = /^(([\da-fA-F]+)?:)+\/\d+/;

const internalIpRanges = {
	interval_timeout: 1000 * 60 * 60 * Number(process.env.IPRT),
	interval: null,
	interval_processing: false,
	iteration_count: 0,

	initTimer: () => {
		if (process.env.SKIP_IP_RANGES === 'false') {
			logger.info('IP Ranges Renewal Timer initialized');
			internalIpRanges.interval = setInterval(internalIpRanges.fetch, internalIpRanges.interval_timeout);
		}
	},

	fetchUrl: (url) => {
		return new Promise((resolve, reject) => {
			logger.info('Fetching ' + url);
			return https
				.get(url, (res) => {
					res.setEncoding('utf8');
					let raw_data = '';
					res.on('data', (chunk) => {
						raw_data += chunk;
					});

					res.on('end', () => {
						resolve(raw_data);
					});
				})
				.on('error', (err) => {
					reject(err);
				});
		});
	},

	/**
	 * Triggered at startup and then later by a timer, this will fetch the ip ranges from services and apply them to nginx.
	 */
	fetch: () => {
		if (!internalIpRanges.interval_processing && process.env.SKIP_IP_RANGES === 'false') {
			internalIpRanges.interval_processing = true;
			logger.info('Fetching IP Ranges from online services...');

			let ip_ranges = [];

			return internalIpRanges
				.fetchUrl(CLOUDFARE_V4_URL)
				.then((cloudfare_data) => {
					const items = cloudfare_data.split('\n').filter((line) => regIpV4.test(line));
					ip_ranges = [...ip_ranges, ...items];
				})
				.then(() => {
					return internalIpRanges.fetchUrl(CLOUDFARE_V6_URL);
				})
				.then((cloudfare_data) => {
					const items = cloudfare_data.split('\n').filter((line) => regIpV6.test(line));
					ip_ranges = [...ip_ranges, ...items];
				})
				.then(() => {
					const clean_ip_ranges = [];
					ip_ranges.map((range) => {
						if (range) {
							clean_ip_ranges.push(range);
						}
					});

					return internalIpRanges.generateConfig(clean_ip_ranges).then(() => {
						if (internalIpRanges.iteration_count) {
							// Reload nginx
							return internalNginx.reload();
						}
					});
				})
				.then(() => {
					internalIpRanges.interval_processing = false;
					internalIpRanges.iteration_count++;
				})
				.catch((err) => {
					logger.error(err.message);
					internalIpRanges.interval_processing = false;
				});
		}
	},

	/**
	 * @param   {Array}  ip_ranges
	 * @returns {Promise}
	 */
	generateConfig: (ip_ranges) => {
		const renderEngine = utils.getRenderEngine();
		return new Promise((resolve, reject) => {
			let template = null;
			const filename = '/tmp/ip_ranges.conf';
			try {
				template = fs.readFileSync('/app/templates/_ip_ranges.conf', { encoding: 'utf8' });
			} catch (err) {
				reject(new error.ConfigurationError(err.message));
				return;
			}

			renderEngine
				.parseAndRender(template, { ip_ranges })
				.then((config_text) => {
					fs.writeFileSync(filename, config_text, { encoding: 'utf8' });
					resolve(true);
				})
				.catch((err) => {
					logger.warn('Could not write ' + filename + ':', err.message);
					reject(new error.ConfigurationError(err.message));
				});
		});
	},
};

module.exports = internalIpRanges;
