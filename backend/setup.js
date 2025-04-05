const config              = require('./lib/config');
const logger              = require('./logger').setup;
const certificateModel    = require('./models/certificate');
const userModel           = require('./models/user');
const userPermissionModel = require('./models/user_permission');
const utils               = require('./lib/utils');
const authModel           = require('./models/auth');
const settingModel        = require('./models/setting');
const certbot             = require('./lib/certbot');
/**
 * Creates a default admin users if one doesn't already exist in the database
 *
 * @returns {Promise}
 */
const setupDefaultUser = () => {
	return userModel
		.query()
		.select('id', )
		.where('is_deleted', 0)
		.first()
		.then((row) => {
			if (!row || !row.id) {
				// Create a new user and set password
				const email    = process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com';
				const password = process.env.INITIAL_ADMIN_PASSWORD || 'changeme';

				logger.info('Creating a new user: ' + email + ' with password: ' + password);

				const data = {
					is_deleted: 0,
					email:      email,
					name:       'Administrator',
					nickname:   'Admin',
					avatar:     '',
					roles:      ['admin'],
				};

				return userModel
					.query()
					.insertAndFetch(data)
					.then((user) => {
						return authModel
							.query()
							.insert({
								user_id: user.id,
								type:    'password',
								secret:  password,
								meta:    {},
							})
							.then(() => {
								return userPermissionModel.query().insert({
									user_id:           user.id,
									visibility:        'all',
									proxy_hosts:       'manage',
									redirection_hosts: 'manage',
									dead_hosts:        'manage',
									streams:           'manage',
									access_lists:      'manage',
									certificates:      'manage',
								});
							});
					})
					.then(() => {
						logger.info('Initial admin setup completed');
					});
			} else if (config.debug()) {
				logger.info('Admin user setup not required');
			}
		});
};

/**
 * Creates default settings if they don't already exist in the database
 *
 * @returns {Promise}
 */
const setupDefaultSettings = () => {
	return settingModel
		.query()
		.select('id')
		.where({id: 'default-site'})
		.first()
		.then((row) => {
			if (!row || !row.id) {
				settingModel
					.query()
					.insert({
						id:          'default-site',
						name:        'Default Site',
						description: 'What to show when Nginx is hit with an unknown Host',
						value:       'congratulations',
						meta:        {},
					})
					.then(() => {
						logger.info('Default settings added');
					});
			}
			if (config.debug()) {
				logger.info('Default setting setup not required');
			}
		});
};

/**
 * Installs all Certbot plugins which are required for an installed certificate
 *
 * @returns {Promise}
 */
const setupCertbotPlugins = () => {
	return certificateModel
		.query()
		.where('is_deleted', 0)
		.andWhere('provider', 'letsencrypt')
		.then((certificates) => {
			if (certificates && certificates.length) {
				let plugins  = [];
				let promises = [];

				certificates.map(function (certificate) {
					if (certificate.meta && certificate.meta.dns_challenge === true) {
						if (plugins.indexOf(certificate.meta.dns_provider) === -1) {
							plugins.push(certificate.meta.dns_provider);
						}

						// Make sure credentials file exists
						const credentials_loc = '/etc/letsencrypt/credentials/credentials-' + certificate.id;
						// Escape single quotes and backslashes
						const escapedCredentials = certificate.meta.dns_provider_credentials.replaceAll('\'', '\\\'').replaceAll('\\', '\\\\');
						const credentials_cmd    = '[ -f \'' + credentials_loc + '\' ] || { mkdir -p /etc/letsencrypt/credentials 2> /dev/null; echo \'' + escapedCredentials + '\' > \'' + credentials_loc + '\' && chmod 600 \'' + credentials_loc + '\'; }';
						promises.push(utils.exec(credentials_cmd));
					}
				});

				return certbot.installPlugins(plugins)
					.then(() => {
						if (promises.length) {
							return Promise.all(promises)
								.then(() => {
									logger.info('Added Certbot plugins ' + plugins.join(', '));
								});
						}
					});
			}
		});
};


/**
 * Starts a timer to call run the logrotation binary every two days
 * @returns {Promise}
 */
const setupLogrotation = () => {
	const intervalTimeout = 1000 * 60 * 60 * 24 * 2; // 2 days

	const runLogrotate = async () => {
		try {
			await utils.exec('logrotate /etc/logrotate.d/nginx-proxy-manager');
			logger.info('Logrotate completed.');
		} catch (e) { logger.warn(e); }
	};

	logger.info('Logrotate Timer initialized');
	setInterval(runLogrotate, intervalTimeout);
	// And do this now as well
	return runLogrotate();
};

module.exports = function () {
	return setupDefaultUser()
		.then(setupDefaultSettings)
		.then(setupCertbotPlugins)
		.then(setupLogrotation);
};
