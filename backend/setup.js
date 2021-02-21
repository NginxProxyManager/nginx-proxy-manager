const fs                  = require('fs');
const NodeRSA             = require('node-rsa');
const config              = require('config');
const logger              = require('./logger').setup;
const certificateModel    = require('./models/certificate');
const userModel           = require('./models/user');
const userPermissionModel = require('./models/user_permission');
const utils               = require('./lib/utils');
const authModel           = require('./models/auth');
const settingModel        = require('./models/setting');
const dns_plugins         = require('./global/certbot-dns-plugins');
const debug_mode          = process.env.NODE_ENV !== 'production' || !!process.env.DEBUG;

/**
 * Creates a new JWT RSA Keypair if not alread set on the config
 *
 * @returns {Promise}
 */
const setupJwt = () => {
	return new Promise((resolve, reject) => {
		// Now go and check if the jwt gpg keys have been created and if not, create them
		if (!config.has('jwt') || !config.has('jwt.key') || !config.has('jwt.pub')) {
			logger.info('Creating a new JWT key pair...');

			// jwt keys are not configured properly
			const filename  = config.util.getEnv('NODE_CONFIG_DIR') + '/' + (config.util.getEnv('NODE_ENV') || 'default') + '.json';
			let config_data = {};

			try {
				config_data = require(filename);
			} catch (err) {
				// do nothing
				if (debug_mode) {
					logger.debug(filename + ' config file could not be required');
				}
			}

			// Now create the keys and save them in the config.
			let key = new NodeRSA({ b: 2048 });
			key.generateKeyPair();

			config_data.jwt = {
				key: key.exportKey('private').toString(),
				pub: key.exportKey('public').toString(),
			};

			// Write config
			fs.writeFile(filename, JSON.stringify(config_data, null, 2), (err) => {
				if (err) {
					logger.error('Could not write JWT key pair to config file: ' + filename);
					reject(err);
				} else {
					logger.info('Wrote JWT key pair to config file: ' + filename);

					logger.warn('Restarting interface to apply new configuration');
					process.exit(0);
				}
			});
		} else {
			// JWT key pair exists
			if (debug_mode) {
				logger.debug('JWT Keypair already exists');
			}

			resolve();
		}
	});
};

/**
 * Creates a default admin users if one doesn't already exist in the database
 *
 * @returns {Promise}
 */
const setupDefaultUser = () => {
	return userModel
		.query()
		.select(userModel.raw('COUNT(`id`) as `count`'))
		.where('is_deleted', 0)
		.first()
		.then((row) => {
			if (!row.count) {
				// Create a new user and set password
				logger.info('Creating a new user: admin@example.com with password: changeme');

				let data = {
					is_deleted: 0,
					email:      'admin@example.com',
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
								secret:  'changeme',
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
			} else if (debug_mode) {
				logger.debug('Admin user setup not required');
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
		.select(settingModel.raw('COUNT(`id`) as `count`'))
		.where({id: 'default-site'})
		.first()
		.then((row) => {
			if (!row.count) {
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
			if (debug_mode) {
				logger.debug('Default setting setup not required');
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
						const dns_plugin          = dns_plugins[certificate.meta.dns_provider];
						const packages_to_install = `${dns_plugin.package_name}==${dns_plugin.package_version} ${dns_plugin.dependencies}`;

						if (plugins.indexOf(packages_to_install) === -1) plugins.push(packages_to_install);

						// Make sure credentials file exists
						const credentials_loc = '/etc/letsencrypt/credentials/credentials-' + certificate.id; 
						const credentials_cmd = '[ -f \'' + credentials_loc + '\' ] || { mkdir -p /etc/letsencrypt/credentials 2> /dev/null; echo \'' + certificate.meta.dns_provider_credentials.replace('\'', '\\\'') + '\' > \'' + credentials_loc + '\' && chmod 600 \'' + credentials_loc + '\'; }';
						promises.push(utils.exec(credentials_cmd));
					}
				});

				if (plugins.length) {
					const install_cmd = 'pip3 install ' + plugins.join(' ');
					promises.push(utils.exec(install_cmd));
				}

				if (promises.length) {
					return Promise.all(promises)
						.then(() => { 
							logger.info('Added Certbot plugins ' + plugins.join(', ')); 
						});
				}
			}
		});
};

module.exports = function () {
	return setupJwt()
		.then(setupDefaultUser)
		.then(setupDefaultSettings)
		.then(setupCertbotPlugins);
};
