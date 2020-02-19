const https         = require('https');
const fs            = require('fs');
const logger        = require('../logger').ip_ranges;
const error         = require('../lib/error');
const internalNginx = require('./nginx');
const { Liquid }    = require('liquidjs');

const CLOUDFRONT_URL   = 'https://ip-ranges.amazonaws.com/ip-ranges.json';
const CLOUDFARE_V4_URL = 'https://www.cloudflare.com/ips-v4';
const CLOUDFARE_V6_URL = 'https://www.cloudflare.com/ips-v6';

const internalIpRanges = {

	interval_timeout:    1000 * 60 * 60 * 6, // 6 hours
	interval:            null,
	interval_processing: false,
	iteration_count:     0,

	initTimer: () => {
		logger.info('IP Ranges Renewal Timer initialized');
		internalIpRanges.interval = setInterval(internalIpRanges.fetch, internalIpRanges.interval_timeout);
	},

	fetchUrl: (url) => {
		return new Promise((resolve, reject) => {
			logger.info('Fetching ' + url);
			return https.get(url, (res) => {
				res.setEncoding('utf8');
				let raw_data = '';
				res.on('data', (chunk) => {
					raw_data += chunk;
				});

				res.on('end', () => {
					resolve(raw_data);
				});
			}).on('error', (err) => {
				reject(err);
			});
		});
	},

	/**
	 * Triggered at startup and then later by a timer, this will fetch the ip ranges from services and apply them to nginx.
	 */
	fetch: () => {
		if (!internalIpRanges.interval_processing) {
			internalIpRanges.interval_processing = true;
			logger.info('Fetching IP Ranges from online services...');

			let ip_ranges = [];

			return internalIpRanges.fetchUrl(CLOUDFRONT_URL)
				.then((cloudfront_data) => {
					let data = JSON.parse(cloudfront_data);

					if (data && typeof data.prefixes !== 'undefined') {
						data.prefixes.map((item) => {
							if (item.service === 'CLOUDFRONT') {
								ip_ranges.push(item.ip_prefix);
							}
						});
					}

					if (data && typeof data.ipv6_prefixes !== 'undefined') {
						data.ipv6_prefixes.map((item) => {
							if (item.service === 'CLOUDFRONT') {
								ip_ranges.push(item.ipv6_prefix);
							}
						});
					}
				})
				.then(() => {
					return internalIpRanges.fetchUrl(CLOUDFARE_V4_URL);
				})
				.then((cloudfare_data) => {
					let items = cloudfare_data.split('\n');
					ip_ranges = [... ip_ranges, ... items];
				})
				.then(() => {
					return internalIpRanges.fetchUrl(CLOUDFARE_V6_URL);
				})
				.then((cloudfare_data) => {
					let items = cloudfare_data.split('\n');
					ip_ranges = [... ip_ranges, ... items];
				})
				.then(() => {
					let clean_ip_ranges = [];
					ip_ranges.map((range) => {
						if (range) {
							clean_ip_ranges.push(range);
						}
					});

					return internalIpRanges.generateConfig(clean_ip_ranges)
						.then(() => {
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
		let renderEngine = new Liquid({
			root: __dirname + '/../templates/'
		});

		return new Promise((resolve, reject) => {
			let template = null;
			let filename = '/etc/nginx/conf.d/include/ip_ranges.conf';
			try {
				template = fs.readFileSync(__dirname + '/../templates/ip_ranges.conf', {encoding: 'utf8'});
			} catch (err) {
				reject(new error.ConfigurationError(err.message));
				return;
			}

			renderEngine
				.parseAndRender(template, {ip_ranges: ip_ranges})
				.then((config_text) => {
					fs.writeFileSync(filename, config_text, {encoding: 'utf8'});
					resolve(true);
				})
				.catch((err) => {
					logger.warn('Could not write ' + filename + ':', err.message);
					reject(new error.ConfigurationError(err.message));
				});
		});
	}
};

module.exports = internalIpRanges;
