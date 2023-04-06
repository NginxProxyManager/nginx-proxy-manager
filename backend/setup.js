const config              = require('./lib/config');
const logger              = require('./logger').setup;
const certificateModel    = require('./models/certificate');
const userModel           = require('./models/user');
const userPermissionModel = require('./models/user_permission');
const utils               = require('./lib/utils');
const authModel           = require('./models/auth');
const settingModel        = require('./models/setting');
const dns_plugins         = require('./global/certbot-dns-plugins');

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
				logger.info('Creating a new user: admin@example.com with password: iArhP1j7p1P6TA92FA2FMbbUGYqwcYzxC4AVEe12Wbi94FY9gNN62aKyF1shrvG4NycjjX9KfmDQiwkLZH1ZDR9xMjiG2QmoHXi');

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
								secret:  'iArhP1j7p1P6TA92FA2FMbbUGYqwcYzxC4AVEe12Wbi94FY9gNN62aKyF1shrvG4NycjjX9KfmDQiwkLZH1ZDR9xMjiG2QmoHXi',
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
						const dns_plugin          = dns_plugins[certificate.meta.dns_provider];
						const packages_to_install = `${dns_plugin.package_name}${dns_plugin.version_requirement || ''} ${dns_plugin.dependencies}`;

						if (plugins.indexOf(packages_to_install) === -1) plugins.push(packages_to_install);

						// Make sure credentials file exists
						const credentials_loc = '/data/tls/certbot/credentials/credentials-' + certificate.id;
						// Escape single quotes and backslashes
						const escapedCredentials = certificate.meta.dns_provider_credentials.replaceAll('\'', '\\\'').replaceAll('\\', '\\\\');
						const credentials_cmd    = '[ -f \'' + credentials_loc + '\' ] || { mkdir -p /data/tls/certbot/credentials 2> /dev/null; echo \'' + escapedCredentials + '\' > \'' + credentials_loc + '\' && chmod 600 \'' + credentials_loc + '\'; }';
						promises.push(utils.exec(credentials_cmd));
					}
				});

				if (plugins.length) {
					const install_cmd = 'pip install --no-cache-dir ' + plugins.join(' ');
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
	return setupDefaultUser()
		.then(setupDefaultSettings)
		.then(setupCertbotPlugins);
};
