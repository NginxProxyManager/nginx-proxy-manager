const _                = require('lodash');
const fs               = require('fs');
const https            = require('https');
const tempWrite        = require('temp-write');
const moment           = require('moment');
const archiver         = require('archiver');
const path             = require('path');
const { isArray }      = require('lodash');
const logger           = require('../logger').ssl;
const config           = require('../lib/config');
const error            = require('../lib/error');
const utils            = require('../lib/utils');
const certbot          = require('../lib/certbot');
const certificateModel = require('../models/certificate');
const tokenModel       = require('../models/token');
const dnsPlugins       = require('../global/certbot-dns-plugins.json');
const internalAuditLog = require('./audit-log');
const internalNginx    = require('./nginx');
const internalHost     = require('./host');


const letsencryptStaging = config.useLetsencryptStaging();
const letsencryptServer  = config.useLetsencryptServer();
const letsencryptConfig  = '/etc/letsencrypt.ini';
const certbotCommand     = 'certbot';

function omissions() {
	return ['is_deleted', 'owner.is_deleted'];
}

const internalCertificate = {

	allowedSslFiles:         ['certificate', 'certificate_key', 'intermediate_certificate'],
	intervalTimeout:         1000 * 60 * 60, // 1 hour
	interval:                null,
	intervalProcessing:      false,
	renewBeforeExpirationBy: [30, 'days'],

	initTimer: () => {
		logger.info('Let\'s Encrypt Renewal Timer initialized');
		internalCertificate.interval = setInterval(internalCertificate.processExpiringHosts, internalCertificate.intervalTimeout);
		// And do this now as well
		internalCertificate.processExpiringHosts();
	},

	/**
	 * Triggered by a timer, this will check for expiring hosts and renew their ssl certs if required
	 */
	processExpiringHosts: () => {
		if (!internalCertificate.intervalProcessing) {
			internalCertificate.intervalProcessing = true;
			logger.info('Renewing SSL certs expiring within ' + internalCertificate.renewBeforeExpirationBy[0] + ' ' + internalCertificate.renewBeforeExpirationBy[1] + ' ...');

			const expirationThreshold = moment().add(internalCertificate.renewBeforeExpirationBy[0], internalCertificate.renewBeforeExpirationBy[1]).format('YYYY-MM-DD HH:mm:ss');

			// Fetch all the letsencrypt certs from the db that will expire within the configured threshold
			certificateModel
				.query()
				.where('is_deleted', 0)
				.andWhere('provider', 'letsencrypt')
				.andWhere('expires_on', '<', expirationThreshold)
				.then((certificates) => {
					if (!certificates || !certificates.length) {
						return null;
					}

					/**
					 * Renews must be run sequentially or we'll get an error 'Another
					 * instance of Certbot is already running.'
					 */
					let sequence = Promise.resolve();

					certificates.forEach(function (certificate) {
						sequence = sequence.then(() =>
							internalCertificate
								.renew(
									{
										can: () =>
											Promise.resolve({
												permission_visibility: 'all',
											}),
										token: new tokenModel(),
									},
									{ id: certificate.id },
								)
								.catch((err) => {
									// Don't want to stop the train here, just log the error
									logger.error(err.message);
								}),
						);
					});

					return sequence;
				})
				.then(() => {
					logger.info('Completed SSL cert renew process');
					internalCertificate.intervalProcessing = false;
				})
				.catch((err) => {
					logger.error(err);
					internalCertificate.intervalProcessing = false;
				});
		}
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		return access.can('certificates:create', data)
			.then(() => {
				data.owner_user_id = access.token.getUserId(1);

				if (data.provider === 'letsencrypt') {
					data.nice_name = data.domain_names.join(', ');
				}

				return certificateModel
					.query()
					.insertAndFetch(data)
					.then(utils.omitRow(omissions()));
			})
			.then((certificate) => {
				if (certificate.provider === 'letsencrypt') {
					// Request a new Cert from LE. Let the fun begin.

					// 1. Find out any hosts that are using any of the hostnames in this cert
					// 2. Disable them in nginx temporarily
					// 3. Generate the LE config
					// 4. Request cert
					// 5. Remove LE config
					// 6. Re-instate previously disabled hosts

					// 1. Find out any hosts that are using any of the hostnames in this cert
					return internalHost.getHostsWithDomains(certificate.domain_names)
						.then((in_use_result) => {
							// 2. Disable them in nginx temporarily
							return internalCertificate.disableInUseHosts(in_use_result)
								.then(() => {
									return in_use_result;
								});
						})
						.then((in_use_result) => {
							// With DNS challenge no config is needed, so skip 3 and 5.
							if (certificate.meta.dns_challenge) {
								return internalNginx.reload().then(() => {
									// 4. Request cert
									return internalCertificate.requestLetsEncryptSslWithDnsChallenge(certificate);
								})
									.then(internalNginx.reload)
									.then(() => {
										// 6. Re-instate previously disabled hosts
										return internalCertificate.enableInUseHosts(in_use_result);
									})
									.then(() => {
										return certificate;
									})
									.catch((err) => {
										// In the event of failure, revert things and throw err back
										return internalCertificate.enableInUseHosts(in_use_result)
											.then(internalNginx.reload)
											.then(() => {
												throw err;
											});
									});
							} else {
								// 3. Generate the LE config
								return internalNginx.generateLetsEncryptRequestConfig(certificate)
									.then(internalNginx.reload)
									.then(async() => await new Promise((r) => setTimeout(r, 5000)))
									.then(() => {
										// 4. Request cert
										return internalCertificate.requestLetsEncryptSsl(certificate);
									})
									.then(() => {
										// 5. Remove LE config
										return internalNginx.deleteLetsEncryptRequestConfig(certificate);
									})
									.then(internalNginx.reload)
									.then(() => {
										// 6. Re-instate previously disabled hosts
										return internalCertificate.enableInUseHosts(in_use_result);
									})
									.then(() => {
										return certificate;
									})
									.catch((err) => {
										// In the event of failure, revert things and throw err back
										return internalNginx.deleteLetsEncryptRequestConfig(certificate)
											.then(() => {
												return internalCertificate.enableInUseHosts(in_use_result);
											})
											.then(internalNginx.reload)
											.then(() => {
												throw err;
											});
									});
							}
						})
						.then(() => {
							// At this point, the letsencrypt cert should exist on disk.
							// Lets get the expiry date from the file and update the row silently
							return internalCertificate.getCertificateInfoFromFile('/etc/letsencrypt/live/npm-' + certificate.id + '/fullchain.pem')
								.then((cert_info) => {
									return certificateModel
										.query()
										.patchAndFetchById(certificate.id, {
											expires_on: moment(cert_info.dates.to, 'X').format('YYYY-MM-DD HH:mm:ss')
										})
										.then(utils.omitRow(omissions()))
										.then((saved_row) => {
											// Add cert data for audit log
											saved_row.meta = _.assign({}, saved_row.meta, {
												letsencrypt_certificate: cert_info
											});

											return saved_row;
										});
								});
						}).catch(async (error) => {
							// Delete the certificate from the database if it was not created successfully
							await certificateModel
								.query()
								.deleteById(certificate.id);

							throw error;
						});
				} else {
					return certificate;
				}
			}).then((certificate) => {

				data.meta = _.assign({}, data.meta || {}, certificate.meta);

				// Add to audit log
				return internalAuditLog.add(access, {
					action:      'created',
					object_type: 'certificate',
					object_id:   certificate.id,
					meta:        data
				})
					.then(() => {
						return certificate;
					});
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @param  {String}  [data.email]
	 * @param  {String}  [data.name]
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access.can('certificates:update', data.id)
			.then((/*access_data*/) => {
				return internalCertificate.get(access, {id: data.id});
			})
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('Certificate could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
				}

				return certificateModel
					.query()
					.patchAndFetchById(row.id, data)
					.then(utils.omitRow(omissions()))
					.then((saved_row) => {
						saved_row.meta = internalCertificate.cleanMeta(saved_row.meta);
						data.meta      = internalCertificate.cleanMeta(data.meta);

						// Add row.nice_name for custom certs
						if (saved_row.provider === 'other') {
							data.nice_name = saved_row.nice_name;
						}

						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'updated',
							object_type: 'certificate',
							object_id:   row.id,
							meta:        _.omit(data, ['expires_on']) // this prevents json circular reference because expires_on might be raw
						})
							.then(() => {
								return saved_row;
							});
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		if (typeof data === 'undefined') {
			data = {};
		}

		return access.can('certificates:get', data.id)
			.then((access_data) => {
				let query = certificateModel
					.query()
					.where('is_deleted', 0)
					.andWhere('id', data.id)
					.allowGraph('[owner]')
					.first();

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				if (typeof data.expand !== 'undefined' && data.expand !== null) {
					query.withGraphFetched('[' + data.expand.join(', ') + ']');
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				}
				// Custom omissions
				if (typeof data.omit !== 'undefined' && data.omit !== null) {
					row = _.omit(row, data.omit);
				}
				return row;
			});
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @returns {Promise}
	 */
	download: (access, data) => {
		return new Promise((resolve, reject) => {
			access.can('certificates:get', data)
				.then(() => {
					return internalCertificate.get(access, data);
				})
				.then((certificate) => {
					if (certificate.provider === 'letsencrypt') {
						const zipDirectory = '/etc/letsencrypt/live/npm-' + data.id;

						if (!fs.existsSync(zipDirectory)) {
							throw new error.ItemNotFoundError('Certificate ' + certificate.nice_name + ' does not exists');
						}

						let certFiles      = fs.readdirSync(zipDirectory)
							.filter((fn) => fn.endsWith('.pem'))
							.map((fn) => fs.realpathSync(path.join(zipDirectory, fn)));
						const downloadName = 'npm-' + data.id + '-' + `${Date.now()}.zip`;
						const opName       = '/tmp/' + downloadName;
						internalCertificate.zipFiles(certFiles, opName)
							.then(() => {
								logger.debug('zip completed : ', opName);
								const resp = {
									fileName: opName
								};
								resolve(resp);
							}).catch((err) => reject(err));
					} else {
						throw new error.ValidationError('Only Let\'sEncrypt certificates can be downloaded');
					}
				}).catch((err) => reject(err));
		});
	},

	/**
	* @param   {String}  source
	* @param   {String}  out
	* @returns {Promise}
	*/
	zipFiles(source, out) {
		const archive = archiver('zip', { zlib: { level: 9 } });
		const stream  = fs.createWriteStream(out);

		return new Promise((resolve, reject) => {
			source
				.map((fl) => {
					let fileName = path.basename(fl);
					logger.debug(fl, 'added to certificate zip');
					archive.file(fl, { name: fileName });
				});
			archive
				.on('error', (err) => reject(err))
				.pipe(stream);

			stream.on('close', () => resolve());
			archive.finalize();
		});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access.can('certificates:delete', data.id)
			.then(() => {
				return internalCertificate.get(access, {id: data.id});
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				}

				return certificateModel
					.query()
					.where('id', row.id)
					.patch({
						is_deleted: 1
					})
					.then(() => {
						// Add to audit log
						row.meta = internalCertificate.cleanMeta(row.meta);

						return internalAuditLog.add(access, {
							action:      'deleted',
							object_type: 'certificate',
							object_id:   row.id,
							meta:        _.omit(row, omissions())
						});
					})
					.then(() => {
						if (row.provider === 'letsencrypt') {
							// Revoke the cert
							return internalCertificate.revokeLetsEncryptSsl(row);
						}
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All Certs
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access.can('certificates:list')
			.then((access_data) => {
				let query = certificateModel
					.query()
					.where('is_deleted', 0)
					.groupBy('id')
					.allowGraph('[owner]')
					.orderBy('nice_name', 'ASC');

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				// Query is used for searching
				if (typeof search_query === 'string') {
					query.where(function () {
						this.where('nice_name', 'like', '%' + search_query + '%');
					});
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.withGraphFetched('[' + expand.join(', ') + ']');
				}

				return query.then(utils.omitRows(omissions()));
			});
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		let query = certificateModel
			.query()
			.count('id as count')
			.where('is_deleted', 0);

		if (visibility !== 'all') {
			query.andWhere('owner_user_id', user_id);
		}

		return query.first()
			.then((row) => {
				return parseInt(row.count, 10);
			});
	},

	/**
	 * @param   {Object} certificate
	 * @returns {Promise}
	 */
	writeCustomCert: (certificate) => {
		logger.info('Writing Custom Certificate:', certificate);

		const dir = '/data/custom_ssl/npm-' + certificate.id;

		return new Promise((resolve, reject) => {
			if (certificate.provider === 'letsencrypt') {
				reject(new Error('Refusing to write letsencrypt certs here'));
				return;
			}

			let certData = certificate.meta.certificate;
			if (typeof certificate.meta.intermediate_certificate !== 'undefined') {
				certData = certData + '\n' + certificate.meta.intermediate_certificate;
			}

			try {
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir);
				}
			} catch (err) {
				reject(err);
				return;
			}

			fs.writeFile(dir + '/fullchain.pem', certData, function (err) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		})
			.then(() => {
				return new Promise((resolve, reject) => {
					fs.writeFile(dir + '/privkey.pem', certificate.meta.certificate_key, function (err) {
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					});
				});
			});
	},

	/**
	 * @param   {Access}   access
	 * @param   {Object}   data
	 * @param   {Array}    data.domain_names
	 * @param   {String}   data.meta.letsencrypt_email
	 * @param   {Boolean}  data.meta.letsencrypt_agree
	 * @returns {Promise}
	 */
	createQuickCertificate: (access, data) => {
		return internalCertificate.create(access, {
			provider:     'letsencrypt',
			domain_names: data.domain_names,
			meta:         data.meta
		});
	},

	/**
	 * Validates that the certs provided are good.
	 * No access required here, nothing is changed or stored.
	 *
	 * @param   {Object}  data
	 * @param   {Object}  data.files
	 * @returns {Promise}
	 */
	validate: (data) => {
		return new Promise((resolve) => {
			// Put file contents into an object
			let files = {};
			_.map(data.files, (file, name) => {
				if (internalCertificate.allowedSslFiles.indexOf(name) !== -1) {
					files[name] = file.data.toString();
				}
			});

			resolve(files);
		})
			.then((files) => {
				// For each file, create a temp file and write the contents to it
				// Then test it depending on the file type
				let promises = [];
				_.map(files, (content, type) => {
					promises.push(new Promise((resolve) => {
						if (type === 'certificate_key') {
							resolve(internalCertificate.checkPrivateKey(content));
						} else {
							// this should handle `certificate` and intermediate certificate
							resolve(internalCertificate.getCertificateInfo(content, true));
						}
					}).then((res) => {
						return {[type]: res};
					}));
				});

				return Promise.all(promises)
					.then((files) => {
						let data = {};

						_.each(files, (file) => {
							data = _.assign({}, data, file);
						});

						return data;
					});
			});
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @param   {Object}  data.files
	 * @returns {Promise}
	 */
	upload: (access, data) => {
		return internalCertificate.get(access, {id: data.id})
			.then((row) => {
				if (row.provider !== 'other') {
					throw new error.ValidationError('Cannot upload certificates for this type of provider');
				}

				return internalCertificate.validate(data)
					.then((validations) => {
						if (typeof validations.certificate === 'undefined') {
							throw new error.ValidationError('Certificate file was not provided');
						}

						_.map(data.files, (file, name) => {
							if (internalCertificate.allowedSslFiles.indexOf(name) !== -1) {
								row.meta[name] = file.data.toString();
							}
						});

						// TODO: This uses a mysql only raw function that won't translate to postgres
						return internalCertificate.update(access, {
							id:           data.id,
							expires_on:   moment(validations.certificate.dates.to, 'X').format('YYYY-MM-DD HH:mm:ss'),
							domain_names: [validations.certificate.cn],
							meta:         _.clone(row.meta) // Prevent the update method from changing this value that we'll use later
						})
							.then((certificate) => {
								certificate.meta = row.meta;
								return internalCertificate.writeCustomCert(certificate);
							});
					})
					.then(() => {
						return _.pick(row.meta, internalCertificate.allowedSslFiles);
					});
			});
	},

	/**
	 * Uses the openssl command to validate the private key.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  private_key    This is the entire key contents as a string
	 */
	checkPrivateKey: (private_key) => {
		return tempWrite(private_key, '/tmp')
			.then((filepath) => {
				return new Promise((resolve, reject) => {
					const failTimeout = setTimeout(() => {
						reject(new error.ValidationError('Result Validation Error: Validation timed out. This could be due to the key being passphrase-protected.'));
					}, 10000);
					utils
						.exec('openssl pkey -in ' + filepath + ' -check -noout 2>&1 ')
						.then((result) => {
							clearTimeout(failTimeout);
							if (!result.toLowerCase().includes('key is valid')) {
								reject(new error.ValidationError('Result Validation Error: ' + result));
							}
							fs.unlinkSync(filepath);
							resolve(true);
						})
						.catch((err) => {
							clearTimeout(failTimeout);
							fs.unlinkSync(filepath);
							reject(new error.ValidationError('Certificate Key is not valid (' + err.message + ')', err));
						});
				});
			});
	},

	/**
	 * Uses the openssl command to both validate and get info out of the certificate.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  certificate      This is the entire cert contents as a string
	 * @param {Boolean} [throw_expired]  Throw when the certificate is out of date
	 */
	getCertificateInfo: (certificate, throw_expired) => {
		return tempWrite(certificate, '/tmp')
			.then((filepath) => {
				return internalCertificate.getCertificateInfoFromFile(filepath, throw_expired)
					.then((certData) => {
						fs.unlinkSync(filepath);
						return certData;
					}).catch((err) => {
						fs.unlinkSync(filepath);
						throw err;
					});
			});
	},

	/**
	 * Uses the openssl command to both validate and get info out of the certificate.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  certificate_file The file location on disk
	 * @param {Boolean} [throw_expired]  Throw when the certificate is out of date
	 */
	getCertificateInfoFromFile: (certificate_file, throw_expired) => {
		let certData = {};

		return utils.exec('openssl x509 -in ' + certificate_file + ' -subject -noout')
			.then((result) => {
				// Examples:
				// subject=CN = *.jc21.com
				// subject=CN = something.example.com
				const regex = /(?:subject=)?[^=]+=\s+(\S+)/gim;
				const match = regex.exec(result);
				if (match && typeof match[1] !== 'undefined') {
					certData['cn'] = match[1];
				}
			})
			.then(() => {
				return utils.exec('openssl x509 -in ' + certificate_file + ' -issuer -noout');
			})

			.then((result) => {
				// Examples:
				// issuer=C = US, O = Let's Encrypt, CN = Let's Encrypt Authority X3
				// issuer=C = US, O = Let's Encrypt, CN = E5
				// issuer=O = NginxProxyManager, CN = NginxProxyManager Intermediate CA","O = NginxProxyManager, CN = NginxProxyManager Intermediate CA
				const regex = /^(?:issuer=)?(.*)$/gim;
				const match = regex.exec(result);
				if (match && typeof match[1] !== 'undefined') {
					certData['issuer'] = match[1];
				}
			})
			.then(() => {
				return utils.exec('openssl x509 -in ' + certificate_file + ' -dates -noout');
			})
			.then((result) => {
				// notBefore=Jul 14 04:04:29 2018 GMT
				// notAfter=Oct 12 04:04:29 2018 GMT
				let validFrom = null;
				let validTo   = null;

				const lines = result.split('\n');
				lines.map(function (str) {
					const regex = /^(\S+)=(.*)$/gim;
					const match = regex.exec(str.trim());

					if (match && typeof match[2] !== 'undefined') {
						const date = parseInt(moment(match[2], 'MMM DD HH:mm:ss YYYY z').format('X'), 10);

						if (match[1].toLowerCase() === 'notbefore') {
							validFrom = date;
						} else if (match[1].toLowerCase() === 'notafter') {
							validTo = date;
						}
					}
				});

				if (!validFrom || !validTo) {
					throw new error.ValidationError('Could not determine dates from certificate: ' + result);
				}

				if (throw_expired && validTo < parseInt(moment().format('X'), 10)) {
					throw new error.ValidationError('Certificate has expired');
				}

				certData['dates'] = {
					from: validFrom,
					to:   validTo
				};

				return certData;
			}).catch((err) => {
				throw new error.ValidationError('Certificate is not valid (' + err.message + ')', err);
			});
	},

	/**
	 * Cleans the ssl keys from the meta object and sets them to "true"
	 *
	 * @param   {Object}  meta
	 * @param   {Boolean} [remove]
	 * @returns {Object}
	 */
	cleanMeta: function (meta, remove) {
		internalCertificate.allowedSslFiles.map((key) => {
			if (typeof meta[key] !== 'undefined' && meta[key]) {
				if (remove) {
					delete meta[key];
				} else {
					meta[key] = true;
				}
			}
		});

		return meta;
	},

	/**
	 * Request a certificate using the http challenge
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	requestLetsEncryptSsl: (certificate) => {
		logger.info('Requesting Let\'sEncrypt certificates for Cert #' + certificate.id + ': ' + certificate.domain_names.join(', '));

		const cmd = `${certbotCommand} certonly ` +
			`--config '${letsencryptConfig}' ` +
			'--work-dir "/tmp/letsencrypt-lib" ' +
			'--logs-dir "/tmp/letsencrypt-log" ' +
			`--cert-name "npm-${certificate.id}" ` +
			'--agree-tos ' +
			'--authenticator webroot ' +
			`--email '${certificate.meta.letsencrypt_email}' ` +
			'--preferred-challenges "dns,http" ' +
			`--domains "${certificate.domain_names.join(',')}" ` +
			(letsencryptServer !== null ? `--server '${letsencryptServer}' ` : '') +
			(letsencryptStaging && letsencryptServer === null ? '--staging ' : '');

		logger.info('Command:', cmd);

		return utils.exec(cmd)
			.then((result) => {
				logger.success(result);
				return result;
			});
	},

	/**
	 * @param   {Object}         certificate          the certificate row
	 * @param   {String}         dns_provider         the dns provider name (key used in `certbot-dns-plugins.json`)
	 * @param   {String | null}  credentials          the content of this providers credentials file
	 * @param   {String}         propagation_seconds
	 * @returns {Promise}
	 */
	requestLetsEncryptSslWithDnsChallenge: async (certificate) => {
		await certbot.installPlugin(certificate.meta.dns_provider);
		const dnsPlugin = dnsPlugins[certificate.meta.dns_provider];
		logger.info(`Requesting Let'sEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(', ')}`);

		const credentialsLocation = '/etc/letsencrypt/credentials/credentials-' + certificate.id;
		fs.mkdirSync('/etc/letsencrypt/credentials', { recursive: true });
		fs.writeFileSync(credentialsLocation, certificate.meta.dns_provider_credentials, {mode: 0o600});

		// Whether the plugin has a --<name>-credentials argument
		const hasConfigArg = certificate.meta.dns_provider !== 'route53';

		let mainCmd = certbotCommand + ' certonly ' +
			`--config '${letsencryptConfig}' ` +
			'--work-dir "/tmp/letsencrypt-lib" ' +
			'--logs-dir "/tmp/letsencrypt-log" ' +
			`--cert-name 'npm-${certificate.id}' ` +
			'--agree-tos ' +
			`--email '${certificate.meta.letsencrypt_email}' ` +
			`--domains '${certificate.domain_names.join(',')}' ` +
			`--authenticator '${dnsPlugin.full_plugin_name}' ` +
			(
				hasConfigArg
					? `--${dnsPlugin.full_plugin_name}-credentials '${credentialsLocation}' `
					: ''
			) +
			(
				certificate.meta.propagation_seconds !== undefined
					? `--${dnsPlugin.full_plugin_name}-propagation-seconds '${certificate.meta.propagation_seconds}' `
					: ''
			) +
			(letsencryptServer !== null ? `--server '${letsencryptServer}' ` : '') +
			(letsencryptStaging && letsencryptServer === null ? '--staging ' : '');

		// Prepend the path to the credentials file as an environment variable
		if (certificate.meta.dns_provider === 'route53') {
			mainCmd = 'AWS_CONFIG_FILE=\'' + credentialsLocation + '\' ' + mainCmd;
		}

		if (certificate.meta.dns_provider === 'duckdns') {
			mainCmd = mainCmd + ' --dns-duckdns-no-txt-restore';
		}

		logger.info('Command:', mainCmd);

		try {
			const result = await utils.exec(mainCmd);
			logger.info(result);
			return result;
		} catch (err) {
			// Don't fail if file does not exist, so no need for action in the callback
			fs.unlink(credentialsLocation, () => {});
			throw err;
		}
	},


	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @returns {Promise}
	 */
	renew: (access, data) => {
		return access.can('certificates:update', data)
			.then(() => {
				return internalCertificate.get(access, data);
			})
			.then((certificate) => {
				if (certificate.provider === 'letsencrypt') {
					const renewMethod = certificate.meta.dns_challenge ? internalCertificate.renewLetsEncryptSslWithDnsChallenge : internalCertificate.renewLetsEncryptSsl;

					return renewMethod(certificate)
						.then(() => {
							return internalCertificate.getCertificateInfoFromFile('/etc/letsencrypt/live/npm-' + certificate.id + '/fullchain.pem');
						})
						.then((cert_info) => {
							return certificateModel
								.query()
								.patchAndFetchById(certificate.id, {
									expires_on: moment(cert_info.dates.to, 'X').format('YYYY-MM-DD HH:mm:ss')
								});
						})
						.then((updated_certificate) => {
							// Add to audit log
							return internalAuditLog.add(access, {
								action:      'renewed',
								object_type: 'certificate',
								object_id:   updated_certificate.id,
								meta:        updated_certificate
							})
								.then(() => {
									return updated_certificate;
								});
						});
				} else {
					throw new error.ValidationError('Only Let\'sEncrypt certificates can be renewed');
				}
			});
	},

	/**
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	renewLetsEncryptSsl: (certificate) => {
		logger.info('Renewing Let\'sEncrypt certificates for Cert #' + certificate.id + ': ' + certificate.domain_names.join(', '));

		const cmd = certbotCommand + ' renew --force-renewal ' +
			`--config '${letsencryptConfig}' ` +
			'--work-dir "/tmp/letsencrypt-lib" ' +
			'--logs-dir "/tmp/letsencrypt-log" ' +
			`--cert-name 'npm-${certificate.id}' ` +
			'--preferred-challenges "dns,http" ' +
			'--no-random-sleep-on-renew ' +
			'--disable-hook-validation ' +
			(letsencryptServer !== null ? `--server '${letsencryptServer}' ` : '') +
			(letsencryptStaging && letsencryptServer === null ? '--staging ' : '');

		logger.info('Command:', cmd);

		return utils.exec(cmd)
			.then((result) => {
				logger.info(result);
				return result;
			});
	},

	/**
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	renewLetsEncryptSslWithDnsChallenge: (certificate) => {
		const dnsPlugin = dnsPlugins[certificate.meta.dns_provider];

		if (!dnsPlugin) {
			throw Error(`Unknown DNS provider '${certificate.meta.dns_provider}'`);
		}

		logger.info(`Renewing Let'sEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(', ')}`);

		let mainCmd = certbotCommand + ' renew --force-renewal ' +
			`--config "${letsencryptConfig}" ` +
			'--work-dir "/tmp/letsencrypt-lib" ' +
			'--logs-dir "/tmp/letsencrypt-log" ' +
			`--cert-name 'npm-${certificate.id}' ` +
			'--disable-hook-validation ' +
			'--no-random-sleep-on-renew ' +
			(letsencryptServer !== null ? `--server '${letsencryptServer}' ` : '') +
			(letsencryptStaging && letsencryptServer === null ? '--staging ' : '');

		// Prepend the path to the credentials file as an environment variable
		if (certificate.meta.dns_provider === 'route53') {
			const credentialsLocation = '/etc/letsencrypt/credentials/credentials-' + certificate.id;
			mainCmd                   = 'AWS_CONFIG_FILE=\'' + credentialsLocation + '\' ' + mainCmd;
		}

		logger.info('Command:', mainCmd);

		return utils.exec(mainCmd)
			.then(async (result) => {
				logger.info(result);
				return result;
			});
	},

	/**
	 * @param   {Object}  certificate    the certificate row
	 * @param   {Boolean} [throw_errors]
	 * @returns {Promise}
	 */
	revokeLetsEncryptSsl: (certificate, throw_errors) => {
		logger.info('Revoking Let\'sEncrypt certificates for Cert #' + certificate.id + ': ' + certificate.domain_names.join(', '));

		const mainCmd = certbotCommand + ' revoke ' +
			`--config '${letsencryptConfig}' ` +
			'--work-dir "/tmp/letsencrypt-lib" ' +
			'--logs-dir "/tmp/letsencrypt-log" ' +
			`--cert-path '/etc/letsencrypt/live/npm-${certificate.id}/fullchain.pem' ` +
			'--delete-after-revoke ' +
			(letsencryptServer !== null ? `--server '${letsencryptServer}' ` : '') +
			(letsencryptStaging && letsencryptServer === null ? '--staging ' : '');

		// Don't fail command if file does not exist
		const delete_credentialsCmd = `rm -f '/etc/letsencrypt/credentials/credentials-${certificate.id}' || true`;

		logger.info('Command:', mainCmd + '; ' + delete_credentialsCmd);

		return utils.exec(mainCmd)
			.then(async (result) => {
				await utils.exec(delete_credentialsCmd);
				logger.info(result);
				return result;
			})
			.catch((err) => {
				logger.error(err.message);

				if (throw_errors) {
					throw err;
				}
			});
	},

	/**
	 * @param   {Object}  certificate
	 * @returns {Boolean}
	 */
	hasLetsEncryptSslCerts: (certificate) => {
		const letsencryptPath = '/etc/letsencrypt/live/npm-' + certificate.id;

		return fs.existsSync(letsencryptPath + '/fullchain.pem') && fs.existsSync(letsencryptPath + '/privkey.pem');
	},

	/**
	 * @param {Object}  in_use_result
	 * @param {Number}  in_use_result.total_count
	 * @param {Array}   in_use_result.proxy_hosts
	 * @param {Array}   in_use_result.redirection_hosts
	 * @param {Array}   in_use_result.dead_hosts
	 */
	disableInUseHosts: (in_use_result) => {
		if (in_use_result.total_count) {
			let promises = [];

			if (in_use_result.proxy_hosts.length) {
				promises.push(internalNginx.bulkDeleteConfigs('proxy_host', in_use_result.proxy_hosts));
			}

			if (in_use_result.redirection_hosts.length) {
				promises.push(internalNginx.bulkDeleteConfigs('redirection_host', in_use_result.redirection_hosts));
			}

			if (in_use_result.dead_hosts.length) {
				promises.push(internalNginx.bulkDeleteConfigs('dead_host', in_use_result.dead_hosts));
			}

			return Promise.all(promises);

		} else {
			return Promise.resolve();
		}
	},

	/**
	 * @param {Object}  in_use_result
	 * @param {Number}  in_use_result.total_count
	 * @param {Array}   in_use_result.proxy_hosts
	 * @param {Array}   in_use_result.redirection_hosts
	 * @param {Array}   in_use_result.dead_hosts
	 */
	enableInUseHosts: (in_use_result) => {
		if (in_use_result.total_count) {
			let promises = [];

			if (in_use_result.proxy_hosts.length) {
				promises.push(internalNginx.bulkGenerateConfigs('proxy_host', in_use_result.proxy_hosts));
			}

			if (in_use_result.redirection_hosts.length) {
				promises.push(internalNginx.bulkGenerateConfigs('redirection_host', in_use_result.redirection_hosts));
			}

			if (in_use_result.dead_hosts.length) {
				promises.push(internalNginx.bulkGenerateConfigs('dead_host', in_use_result.dead_hosts));
			}

			return Promise.all(promises);

		} else {
			return Promise.resolve();
		}
	},

	testHttpsChallenge: async (access, domains) => {
		await access.can('certificates:list');

		if (!isArray(domains)) {
			throw new error.InternalValidationError('Domains must be an array of strings');
		}
		if (domains.length === 0) {
			throw new error.InternalValidationError('No domains provided');
		}

		// Create a test challenge file
		const testChallengeDir  = '/data/letsencrypt-acme-challenge/.well-known/acme-challenge';
		const testChallengeFile = testChallengeDir + '/test-challenge';
		fs.mkdirSync(testChallengeDir, {recursive: true});
		fs.writeFileSync(testChallengeFile, 'Success', {encoding: 'utf8'});

		async function performTestForDomain (domain) {
			logger.info('Testing http challenge for ' + domain);
			const url      = `http://${domain}/.well-known/acme-challenge/test-challenge`;
			const formBody = `method=G&url=${encodeURI(url)}&bodytype=T&requestbody=&headername=User-Agent&headervalue=None&locationid=1&ch=false&cc=false`;
			const options  = {
				method:  'POST',
				headers: {
					'User-Agent':     'Mozilla/5.0',
					'Content-Type':   'application/x-www-form-urlencoded',
					'Content-Length': Buffer.byteLength(formBody)
				}
			};

			const result = await new Promise((resolve) => {

				const req = https.request('https://www.site24x7.com/tools/restapi-tester', options, function (res) {
					let responseBody = '';

					res.on('data', (chunk) => responseBody = responseBody + chunk);
					res.on('end', function () {
						try {
							const parsedBody = JSON.parse(responseBody + '');
							if (res.statusCode !== 200) {
								logger.warn(`Failed to test HTTP challenge for domain ${domain} because HTTP status code ${res.statusCode} was returned: ${parsedBody.message}`);
								resolve(undefined);
							} else {
								resolve(parsedBody);
							}
						} catch (err) {
							if (res.statusCode !== 200) {
								logger.warn(`Failed to test HTTP challenge for domain ${domain} because HTTP status code ${res.statusCode} was returned`);
							} else {
								logger.warn(`Failed to test HTTP challenge for domain ${domain} because response failed to be parsed: ${err.message}`);
							}
							resolve(undefined);
						}
					});
				});

				// Make sure to write the request body.
				req.write(formBody);
				req.end();
				req.on('error', function (e) { logger.warn(`Failed to test HTTP challenge for domain ${domain}`, e);
					resolve(undefined); });
			});

			if (!result) {
				// Some error occurred while trying to get the data
				return 'failed';
			} else if (result.error) {
				logger.info(`HTTP challenge test failed for domain ${domain} because error was returned: ${result.error.msg}`);
				return `other:${result.error.msg}`;
			} else if (`${result.responsecode}` === '200' && result.htmlresponse === 'Success') {
				// Server exists and has responded with the correct data
				return 'ok';
			} else if (`${result.responsecode}` === '200') {
				// Server exists but has responded with wrong data
				logger.info(`HTTP challenge test failed for domain ${domain} because of invalid returned data:`, result.htmlresponse);
				return 'wrong-data';
			} else if (`${result.responsecode}` === '404') {
				// Server exists but responded with a 404
				logger.info(`HTTP challenge test failed for domain ${domain} because code 404 was returned`);
				return '404';
			} else if (`${result.responsecode}` === '0' || (typeof result.reason === 'string' && result.reason.toLowerCase() === 'host unavailable')) {
				// Server does not exist at domain
				logger.info(`HTTP challenge test failed for domain ${domain} the host was not found`);
				return 'no-host';
			} else {
				// Other errors
				logger.info(`HTTP challenge test failed for domain ${domain} because code ${result.responsecode} was returned`);
				return `other:${result.responsecode}`;
			}
		}

		const results = {};

		for (const domain of domains){
			results[domain] = await performTestForDomain(domain);
		}

		// Remove the test challenge file
		fs.unlinkSync(testChallengeFile);

		return results;
	}
};

module.exports = internalCertificate;
