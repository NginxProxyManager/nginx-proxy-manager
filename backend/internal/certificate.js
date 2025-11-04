import fs from "node:fs";
import https from "node:https";
import path from "path";
import archiver from "archiver";
import _ from "lodash";
import moment from "moment";
import tempWrite from "temp-write";
import dnsPlugins from "../certbot/dns-plugins.json" with { type: "json" };
import { installPlugin } from "../lib/certbot.js";
import { useLetsencryptServer, useLetsencryptStaging } from "../lib/config.js";
import error from "../lib/error.js";
import utils from "../lib/utils.js";
import { debug, ssl as logger } from "../logger.js";
import certificateModel from "../models/certificate.js";
import tokenModel from "../models/token.js";
import userModel from "../models/user.js";
import internalAuditLog from "./audit-log.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";

const letsencryptConfig = "/etc/letsencrypt.ini";
const certbotCommand = "certbot";
const certbotLogsDir = "/data/logs";
const certbotWorkDir = "/tmp/letsencrypt-lib";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted", "meta.dns_provider_credentials"];
};

const internalCertificate = {
	allowedSslFiles: ["certificate", "certificate_key", "intermediate_certificate"],
	intervalTimeout: 1000 * 60 * 60, // 1 hour
	interval: null,
	intervalProcessing: false,
	renewBeforeExpirationBy: [30, "days"],

	initTimer: () => {
		logger.info("Let's Encrypt Renewal Timer initialized");
		internalCertificate.interval = setInterval(
			internalCertificate.processExpiringHosts,
			internalCertificate.intervalTimeout,
		);
		// And do this now as well
		internalCertificate.processExpiringHosts();
	},

	/**
	 * Triggered by a timer, this will check for expiring hosts and renew their ssl certs if required
	 */
	processExpiringHosts: () => {
		if (!internalCertificate.intervalProcessing) {
			internalCertificate.intervalProcessing = true;
			logger.info(
				`Renewing SSL certs expiring within ${internalCertificate.renewBeforeExpirationBy[0]} ${internalCertificate.renewBeforeExpirationBy[1]} ...`,
			);

			const expirationThreshold = moment()
				.add(internalCertificate.renewBeforeExpirationBy[0], internalCertificate.renewBeforeExpirationBy[1])
				.format("YYYY-MM-DD HH:mm:ss");

			// Fetch all the letsencrypt certs from the db that will expire within the configured threshold
			certificateModel
				.query()
				.where("is_deleted", 0)
				.andWhere("provider", "letsencrypt")
				.andWhere("expires_on", "<", expirationThreshold)
				.then((certificates) => {
					if (!certificates || !certificates.length) {
						return null;
					}

					/**
					 * Renews must be run sequentially or we'll get an error 'Another
					 * instance of Certbot is already running.'
					 */
					let sequence = Promise.resolve();

					certificates.forEach((certificate) => {
						sequence = sequence.then(() =>
							internalCertificate
								.renew(
									{
										can: () =>
											Promise.resolve({
												permission_visibility: "all",
											}),
										token: tokenModel(),
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
					logger.info("Completed SSL cert renew process");
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
	create: async (access, data) => {
		await access.can("certificates:create", data);
		data.owner_user_id = access.token.getUserId(1);

		if (data.provider === "letsencrypt") {
			data.nice_name = data.domain_names.join(", ");
		}

		// this command really should clean up and delete the cert if it can't fully succeed
		const certificate = await certificateModel.query().insertAndFetch(data);

		try {
			if (certificate.provider === "letsencrypt") {
				// Request a new Cert from LE. Let the fun begin.

				// 1. Find out any hosts that are using any of the hostnames in this cert
				// 2. Disable them in nginx temporarily
				// 3. Generate the LE config
				// 4. Request cert
				// 5. Remove LE config
				// 6. Re-instate previously disabled hosts

				// 1. Find out any hosts that are using any of the hostnames in this cert
				const inUseResult = await internalHost.getHostsWithDomains(certificate.domain_names);

				// 2. Disable them in nginx temporarily
				await internalCertificate.disableInUseHosts(inUseResult);

				const user = await userModel.query().where("is_deleted", 0).andWhere("id", data.owner_user_id).first();
				if (!user || !user.email) {
					throw new error.ValidationError(
						"A valid email address must be set on your user account to use Let's Encrypt",
					);
				}

				// With DNS challenge no config is needed, so skip 3 and 5.
				if (certificate.meta?.dns_challenge) {
					try {
						await internalNginx.reload();
						// 4. Request cert
						await internalCertificate.requestLetsEncryptSslWithDnsChallenge(certificate, user.email);
						await internalNginx.reload();
						// 6. Re-instate previously disabled hosts
						await internalCertificate.enableInUseHosts(inUseResult);
					} catch (err) {
						// In the event of failure, revert things and throw err back
						await internalCertificate.enableInUseHosts(inUseResult);
						await internalNginx.reload();
						throw err;
					}
				} else {
					// 3. Generate the LE config
					try {
						await internalNginx.generateLetsEncryptRequestConfig(certificate);
						await internalNginx.reload();
						setTimeout(() => {}, 5000);
						// 4. Request cert
						await internalCertificate.requestLetsEncryptSsl(certificate, user.email);
						// 5. Remove LE config
						await internalNginx.deleteLetsEncryptRequestConfig(certificate);
						await internalNginx.reload();
						// 6. Re-instate previously disabled hosts
						await internalCertificate.enableInUseHosts(inUseResult);
					} catch (err) {
						// In the event of failure, revert things and throw err back
						await internalNginx.deleteLetsEncryptRequestConfig(certificate);
						await internalCertificate.enableInUseHosts(inUseResult);
						await internalNginx.reload();
						throw err;
					}
				}

				// At this point, the letsencrypt cert should exist on disk.
				// Lets get the expiry date from the file and update the row silently
				try {
					const certInfo = await internalCertificate.getCertificateInfoFromFile(
						`${internalCertificate.getLiveCertPath(certificate.id)}/fullchain.pem`,
					);
					const savedRow = await certificateModel
						.query()
						.patchAndFetchById(certificate.id, {
							expires_on: moment(certInfo.dates.to, "X").format("YYYY-MM-DD HH:mm:ss"),
						})
						.then(utils.omitRow(omissions()));

					// Add cert data for audit log
					savedRow.meta = _.assign({}, savedRow.meta, {
						letsencrypt_certificate: certInfo,
					});

					await internalCertificate.addCreatedAuditLog(access, certificate.id, savedRow);

					return savedRow;
				} catch (err) {
					// Delete the certificate from the database if it was not created successfully
					await certificateModel.query().deleteById(certificate.id);
					throw err;
				}
			}
		} catch (err) {
			// Delete the certificate here. This is a hard delete, since it never existed properly
			await certificateModel.query().deleteById(certificate.id);
			throw err;
		}

		data.meta = _.assign({}, data.meta || {}, certificate.meta);

		// Add to audit log
		await internalCertificate.addCreatedAuditLog(access, certificate.id, utils.omitRow(omissions())(data));

		return utils.omitRow(omissions())(certificate);
	},

	addCreatedAuditLog: async (access, certificate_id, meta) => {
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "certificate",
			object_id: certificate_id,
			meta: meta,
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
	update: async (access, data) => {
		await access.can("certificates:update", data.id);
		const row = await internalCertificate.get(access, { id: data.id });

		if (row.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new error.InternalValidationError(
				`Certificate could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		const savedRow = await certificateModel
			.query()
			.patchAndFetchById(row.id, data)
			.then(utils.omitRow(omissions()));

		savedRow.meta = internalCertificate.cleanMeta(savedRow.meta);
		data.meta = internalCertificate.cleanMeta(data.meta);

		// Add row.nice_name for custom certs
		if (savedRow.provider === "other") {
			data.nice_name = savedRow.nice_name;
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "certificate",
			object_id: row.id,
			meta: _.omit(data, ["expires_on"]), // this prevents json circular reference because expires_on might be raw
		});

		return savedRow;
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const accessData = await access.can("certificates:get", data.id);
		const query = certificateModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", data.id)
			.allowGraph("[owner,proxy_hosts,redirection_hosts,dead_hosts,streams]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof data.expand !== "undefined" && data.expand !== null) {
			query.withGraphFetched(`[${data.expand.join(", ")}]`);
		}

		const row = await query.then(utils.omitRow(omissions()));
		if (!row || !row.id) {
			throw new error.ItemNotFoundError(data.id);
		}
		// Custom omissions
		if (typeof data.omit !== "undefined" && data.omit !== null) {
			return _.omit(row, [...data.omit]);
		}

		return internalCertificate.cleanExpansions(row);
	},

	cleanExpansions: (row) => {
		if (typeof row.proxy_hosts !== "undefined") {
			row.proxy_hosts = utils.omitRows(["is_deleted"])(row.proxy_hosts);
		}
		if (typeof row.redirection_hosts !== "undefined") {
			row.redirection_hosts = utils.omitRows(["is_deleted"])(row.redirection_hosts);
		}
		if (typeof row.dead_hosts !== "undefined") {
			row.dead_hosts = utils.omitRows(["is_deleted"])(row.dead_hosts);
		}
		if (typeof row.streams !== "undefined") {
			row.streams = utils.omitRows(["is_deleted"])(row.streams);
		}
		return row;
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @returns {Promise}
	 */
	download: async (access, data) => {
		await access.can("certificates:get", data);
		const certificate = await internalCertificate.get(access, data);
		if (certificate.provider === "letsencrypt") {
			const zipDirectory = internalCertificate.getLiveCertPath(data.id);
			if (!fs.existsSync(zipDirectory)) {
				throw new error.ItemNotFoundError(`Certificate ${certificate.nice_name} does not exists`);
			}

			const certFiles = fs
				.readdirSync(zipDirectory)
				.filter((fn) => fn.endsWith(".pem"))
				.map((fn) => fs.realpathSync(path.join(zipDirectory, fn)));

			const downloadName = `npm-${data.id}-${Date.now()}.zip`;
			const opName = `/tmp/${downloadName}`;

			await internalCertificate.zipFiles(certFiles, opName);
			debug(logger, "zip completed : ", opName);
			return {
				fileName: opName,
			};
		}
		throw new error.ValidationError("Only Let'sEncrypt certificates can be downloaded");
	},

	/**
	 * @param   {String}  source
	 * @param   {String}  out
	 * @returns {Promise}
	 */
	zipFiles: async (source, out) => {
		const archive = archiver("zip", { zlib: { level: 9 } });
		const stream = fs.createWriteStream(out);

		return new Promise((resolve, reject) => {
			source.map((fl) => {
				const fileName = path.basename(fl);
				debug(logger, fl, "added to certificate zip");
				archive.file(fl, { name: fileName });
				return true;
			});
			archive.on("error", (err) => reject(err)).pipe(stream);
			stream.on("close", () => resolve());
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
	delete: async (access, data) => {
		await access.can("certificates:delete", data.id);
		const row = await internalCertificate.get(access, { id: data.id });

		if (!row || !row.id) {
			throw new error.ItemNotFoundError(data.id);
		}

		await certificateModel.query().where("id", row.id).patch({
			is_deleted: 1,
		});

		// Add to audit log
		row.meta = internalCertificate.cleanMeta(row.meta);

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "certificate",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		if (row.provider === "letsencrypt") {
			// Revoke the cert
			await internalCertificate.revokeLetsEncryptSsl(row);
		}
		return true;
	},

	/**
	 * All Certs
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("certificates:list");

		const query = certificateModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,proxy_hosts,redirection_hosts,dead_hosts,streams]")
			.orderBy("nice_name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string") {
			query.where(function () {
				this.where("nice_name", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const r = await query.then(utils.omitRows(omissions()));
		for (let i = 0; i < r.length; i++) {
			r[i] = internalCertificate.cleanExpansions(r[i]);
		}
		return r;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  userId
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (userId, visibility) => {
		const query = certificateModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", userId);
		}

		const row = await query.first();
		return Number.parseInt(row.count, 10);
	},

	/**
	 * @param   {Object} certificate
	 * @returns {Promise}
	 */
	writeCustomCert: async (certificate) => {
		logger.info("Writing Custom Certificate:", certificate);

		const dir = `/data/custom_ssl/npm-${certificate.id}`;

		return new Promise((resolve, reject) => {
			if (certificate.provider === "letsencrypt") {
				reject(new Error("Refusing to write letsencrypt certs here"));
				return;
			}

			let certData = certificate.meta.certificate;
			if (typeof certificate.meta.intermediate_certificate !== "undefined") {
				certData = `${certData}\n${certificate.meta.intermediate_certificate}`;
			}

			try {
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir);
				}
			} catch (err) {
				reject(err);
				return;
			}

			fs.writeFile(`${dir}/fullchain.pem`, certData, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		}).then(() => {
			return new Promise((resolve, reject) => {
				fs.writeFile(`${dir}/privkey.pem`, certificate.meta.certificate_key, (err) => {
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
	 * @returns {Promise}
	 */
	createQuickCertificate: async (access, data) => {
		return await internalCertificate.create(access, {
			provider: "letsencrypt",
			domain_names: data.domain_names,
			meta: data.meta,
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
		// Put file contents into an object
		const files = {};
		_.map(data.files, (file, name) => {
			if (internalCertificate.allowedSslFiles.indexOf(name) !== -1) {
				files[name] = file.data.toString();
			}
		});

		// For each file, create a temp file and write the contents to it
		// Then test it depending on the file type
		const promises = [];
		_.map(files, (content, type) => {
			promises.push(
				new Promise((resolve) => {
					if (type === "certificate_key") {
						resolve(internalCertificate.checkPrivateKey(content));
					} else {
						// this should handle `certificate` and intermediate certificate
						resolve(internalCertificate.getCertificateInfo(content, true));
					}
				}).then((res) => {
					return { [type]: res };
				}),
			);
		});

		return Promise.all(promises).then((files) => {
			let data = {};
			_.each(files, (file) => {
				data = _.assign({}, data, file);
			});
			return data;
		});
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @param   {Object}  data.files
	 * @returns {Promise}
	 */
	upload: async (access, data) => {
		const row = await internalCertificate.get(access, { id: data.id });
		if (row.provider !== "other") {
			throw new error.ValidationError("Cannot upload certificates for this type of provider");
		}

		const validations = await internalCertificate.validate(data);
		if (typeof validations.certificate === "undefined") {
			throw new error.ValidationError("Certificate file was not provided");
		}

		_.map(data.files, (file, name) => {
			if (internalCertificate.allowedSslFiles.indexOf(name) !== -1) {
				row.meta[name] = file.data.toString();
			}
		});

		const certificate = await internalCertificate.update(access, {
			id: data.id,
			expires_on: moment(validations.certificate.dates.to, "X").format("YYYY-MM-DD HH:mm:ss"),
			domain_names: [validations.certificate.cn],
			meta: _.clone(row.meta), // Prevent the update method from changing this value that we'll use later
		});

		certificate.meta = row.meta;
		await internalCertificate.writeCustomCert(certificate);
		return _.pick(row.meta, internalCertificate.allowedSslFiles);
	},

	/**
	 * Uses the openssl command to validate the private key.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  privateKey    This is the entire key contents as a string
	 */
	checkPrivateKey: async (privateKey) => {
		const filepath = await tempWrite(privateKey, "/tmp");
		const failTimeout = setTimeout(() => {
			throw new error.ValidationError(
				"Result Validation Error: Validation timed out. This could be due to the key being passphrase-protected.",
			);
		}, 10000);

		try {
			const result = await utils.exec(`openssl pkey -in ${filepath} -check -noout 2>&1 `);
			clearTimeout(failTimeout);
			if (!result.toLowerCase().includes("key is valid")) {
				throw new error.ValidationError(`Result Validation Error: ${result}`);
			}
			fs.unlinkSync(filepath);
			return true;
		} catch (err) {
			clearTimeout(failTimeout);
			fs.unlinkSync(filepath);
			throw new error.ValidationError(`Certificate Key is not valid (${err.message})`, err);
		}
	},

	/**
	 * Uses the openssl command to both validate and get info out of the certificate.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  certificate      This is the entire cert contents as a string
	 * @param {Boolean} [throwExpired]  Throw when the certificate is out of date
	 */
	getCertificateInfo: async (certificate, throwExpired) => {
		try {
			const filepath = await tempWrite(certificate, "/tmp");
			const certData = await internalCertificate.getCertificateInfoFromFile(filepath, throwExpired);
			fs.unlinkSync(filepath);
			return certData;
		} catch (err) {
			fs.unlinkSync(filepath);
			throw err;
		}
	},

	/**
	 * Uses the openssl command to both validate and get info out of the certificate.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  certificateFile The file location on disk
	 * @param {Boolean} [throw_expired]  Throw when the certificate is out of date
	 */
	getCertificateInfoFromFile: async (certificateFile, throw_expired) => {
		const certData = {};

		try {
			const result = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-subject", "-noout"]);
			// Examples:
			// subject=CN = *.jc21.com
			// subject=CN = something.example.com
			const regex = /(?:subject=)?[^=]+=\s+(\S+)/gim;
			const match = regex.exec(result);
			if (match && typeof match[1] !== "undefined") {
				certData.cn = match[1];
			}

			const result2 = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-issuer", "-noout"]);
			// Examples:
			// issuer=C = US, O = Let's Encrypt, CN = Let's Encrypt Authority X3
			// issuer=C = US, O = Let's Encrypt, CN = E5
			// issuer=O = NginxProxyManager, CN = NginxProxyManager Intermediate CA","O = NginxProxyManager, CN = NginxProxyManager Intermediate CA
			const regex2 = /^(?:issuer=)?(.*)$/gim;
			const match2 = regex2.exec(result2);
			if (match2 && typeof match2[1] !== "undefined") {
				certData.issuer = match2[1];
			}

			const result3 = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-dates", "-noout"]);
			// notBefore=Jul 14 04:04:29 2018 GMT
			// notAfter=Oct 12 04:04:29 2018 GMT
			let validFrom = null;
			let validTo = null;

			const lines = result3.split("\n");
			lines.map((str) => {
				const regex = /^(\S+)=(.*)$/gim;
				const match = regex.exec(str.trim());

				if (match && typeof match[2] !== "undefined") {
					const date = Number.parseInt(moment(match[2], "MMM DD HH:mm:ss YYYY z").format("X"), 10);

					if (match[1].toLowerCase() === "notbefore") {
						validFrom = date;
					} else if (match[1].toLowerCase() === "notafter") {
						validTo = date;
					}
				}
				return true;
			});

			if (!validFrom || !validTo) {
				throw new error.ValidationError(`Could not determine dates from certificate: ${result}`);
			}

			if (throw_expired && validTo < Number.parseInt(moment().format("X"), 10)) {
				throw new error.ValidationError("Certificate has expired");
			}

			certData.dates = {
				from: validFrom,
				to: validTo,
			};

			return certData;
		} catch (err) {
			throw new error.ValidationError(`Certificate is not valid (${err.message})`, err);
		}
	},

	/**
	 * Cleans the ssl keys from the meta object and sets them to "true"
	 *
	 * @param   {Object}  meta
	 * @param   {Boolean} [remove]
	 * @returns {Object}
	 */
	cleanMeta: (meta, remove) => {
		internalCertificate.allowedSslFiles.map((key) => {
			if (typeof meta[key] !== "undefined" && meta[key]) {
				if (remove) {
					delete meta[key];
				} else {
					meta[key] = true;
				}
			}
			return true;
		});
		return meta;
	},

	/**
	 * Request a certificate using the http challenge
	 * @param   {Object}  certificate   the certificate row
	 * @param   {String}  email         the email address to use for registration
	 * @returns {Promise}
	 */
	requestLetsEncryptSsl: async (certificate, email) => {
		logger.info(
			`Requesting LetsEncrypt certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
		);

		const args = [
			"certonly",
			"--config",
			letsencryptConfig,
			"--work-dir",
			certbotWorkDir,
			"--logs-dir",
			certbotLogsDir,
			"--cert-name",
			`npm-${certificate.id}`,
			"--agree-tos",
			"--authenticator",
			"webroot",
			"-m",
			email,
			"--preferred-challenges",
			"http",
			"--domains",
			certificate.domain_names.join(","),
		];

		const adds = internalCertificate.getAdditionalCertbotArgs(certificate.id);
		args.push(...adds.args);

		logger.info(`Command: ${certbotCommand} ${args ? args.join(" ") : ""}`);

		const result = await utils.execFile(certbotCommand, args, adds.opts);
		logger.success(result);
		return result;
	},

	/**
	 * @param   {Object}   certificate  the certificate row
	 * @param   {String}   email        the email address to use for registration
	 * @returns {Promise}
	 */
	requestLetsEncryptSslWithDnsChallenge: async (certificate, email) => {
		await installPlugin(certificate.meta.dns_provider);
		const dnsPlugin = dnsPlugins[certificate.meta.dns_provider];
		logger.info(
			`Requesting LetsEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
		);

		const credentialsLocation = `/etc/letsencrypt/credentials/credentials-${certificate.id}`;
		fs.mkdirSync("/etc/letsencrypt/credentials", { recursive: true });
		fs.writeFileSync(credentialsLocation, certificate.meta.dns_provider_credentials, { mode: 0o600 });

		// Whether the plugin has a --<name>-credentials argument
		const hasConfigArg = certificate.meta.dns_provider !== "route53";

		const args = [
			"certonly",
			"--config",
			letsencryptConfig,
			"--work-dir",
			certbotWorkDir,
			"--logs-dir",
			certbotLogsDir,
			"--cert-name",
			`npm-${certificate.id}`,
			"--agree-tos",
			"-m",
			email,
			"--preferred-challenges",
			"dns",
			"--domains",
			certificate.domain_names.join(","),
			"--authenticator",
			dnsPlugin.full_plugin_name,
		];

		if (hasConfigArg) {
			args.push(`--${dnsPlugin.full_plugin_name}-credentials`, credentialsLocation);
		}
		if (certificate.meta.propagation_seconds !== undefined) {
			args.push(
				`--${dnsPlugin.full_plugin_name}-propagation-seconds`,
				certificate.meta.propagation_seconds.toString(),
			);
		}

		const adds = internalCertificate.getAdditionalCertbotArgs(certificate.id, certificate.meta.dns_provider);
		args.push(...adds.args);

		logger.info(`Command: ${certbotCommand} ${args ? args.join(" ") : ""}`);

		try {
			const result = await utils.execFile(certbotCommand, args, adds.opts);
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
	renew: async (access, data) => {
		await access.can("certificates:update", data);
		const certificate = await internalCertificate.get(access, data);

		if (certificate.provider === "letsencrypt") {
			const renewMethod = certificate.meta.dns_challenge
				? internalCertificate.renewLetsEncryptSslWithDnsChallenge
				: internalCertificate.renewLetsEncryptSsl;

			await renewMethod(certificate);
			const certInfo = await internalCertificate.getCertificateInfoFromFile(
				`${internalCertificate.getLiveCertPath(certificate.id)}/fullchain.pem`,
			);

			const updatedCertificate = await certificateModel.query().patchAndFetchById(certificate.id, {
				expires_on: moment(certInfo.dates.to, "X").format("YYYY-MM-DD HH:mm:ss"),
			});

			// Add to audit log
			await internalAuditLog.add(access, {
				action: "renewed",
				object_type: "certificate",
				object_id: updatedCertificate.id,
				meta: updatedCertificate,
			});

			return updatedCertificate;
		}

		throw new error.ValidationError("Only Let'sEncrypt certificates can be renewed");
	},

	/**
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	renewLetsEncryptSsl: async (certificate) => {
		logger.info(
			`Renewing LetsEncrypt certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
		);

		const args = [
			"renew",
			"--force-renewal",
			"--config",
			letsencryptConfig,
			"--work-dir",
			certbotWorkDir,
			"--logs-dir",
			certbotLogsDir,
			"--cert-name",
			`npm-${certificate.id}`,
			"--preferred-challenges",
			"http",
			"--no-random-sleep-on-renew",
			"--disable-hook-validation",
		];

		const adds = internalCertificate.getAdditionalCertbotArgs(certificate.id, certificate.meta.dns_provider);
		args.push(...adds.args);

		logger.info(`Command: ${certbotCommand} ${args ? args.join(" ") : ""}`);

		const result = await utils.execFile(certbotCommand, args, adds.opts);
		logger.info(result);
		return result;
	},

	/**
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	renewLetsEncryptSslWithDnsChallenge: async (certificate) => {
		const dnsPlugin = dnsPlugins[certificate.meta.dns_provider];
		if (!dnsPlugin) {
			throw Error(`Unknown DNS provider '${certificate.meta.dns_provider}'`);
		}

		logger.info(
			`Renewing LetsEncrypt certificates via ${dnsPlugin.name} for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
		);

		const args = [
			"renew",
			"--force-renewal",
			"--config",
			letsencryptConfig,
			"--work-dir",
			certbotWorkDir,
			"--logs-dir",
			certbotLogsDir,
			"--cert-name",
			`npm-${certificate.id}`,
			"--preferred-challenges",
			"dns",
			"--disable-hook-validation",
			"--no-random-sleep-on-renew",
		];

		const adds = internalCertificate.getAdditionalCertbotArgs(certificate.id, certificate.meta.dns_provider);
		args.push(...adds.args);

		logger.info(`Command: ${certbotCommand} ${args ? args.join(" ") : ""}`);

		const result = await utils.execFile(certbotCommand, args, adds.opts);
		logger.info(result);
		return result;
	},

	/**
	 * @param   {Object}  certificate    the certificate row
	 * @param   {Boolean} [throwErrors]
	 * @returns {Promise}
	 */
	revokeLetsEncryptSsl: async (certificate, throwErrors) => {
		logger.info(
			`Revoking LetsEncrypt certificates for Cert #${certificate.id}: ${certificate.domain_names.join(", ")}`,
		);

		const args = [
			"revoke",
			"--config",
			letsencryptConfig,
			"--work-dir",
			certbotWorkDir,
			"--logs-dir",
			certbotLogsDir,
			"--cert-path",
			`${internalCertificate.getLiveCertPath(certificate.id)}/fullchain.pem`,
			"--delete-after-revoke",
		];

		const adds = internalCertificate.getAdditionalCertbotArgs(certificate.id);
		args.push(...adds.args);

		logger.info(`Command: ${certbotCommand} ${args ? args.join(" ") : ""}`);

		try {
			const result = await utils.execFile(certbotCommand, args, adds.opts);
			await utils.exec(`rm -f '/etc/letsencrypt/credentials/credentials-${certificate.id}' || true`);
			logger.info(result);
			return result;
		} catch (err) {
			logger.error(err.message);
			if (throwErrors) {
				throw err;
			}
		}
	},

	/**
	 * @param   {Object}  certificate
	 * @returns {Boolean}
	 */
	hasLetsEncryptSslCerts: (certificate) => {
		const letsencryptPath = internalCertificate.getLiveCertPath(certificate.id);
		return fs.existsSync(`${letsencryptPath}/fullchain.pem`) && fs.existsSync(`${letsencryptPath}/privkey.pem`);
	},

	/**
	 * @param   {Object}  inUseResult
	 * @param   {Number}  inUseResult.total_count
	 * @param   {Array}   inUseResult.proxy_hosts
	 * @param   {Array}   inUseResult.redirection_hosts
	 * @param   {Array}   inUseResult.dead_hosts
	 * @returns {Promise}
	 */
	disableInUseHosts: async (inUseResult) => {
		if (inUseResult?.total_count) {
			if (inUseResult?.proxy_hosts.length) {
				await internalNginx.bulkDeleteConfigs("proxy_host", inUseResult.proxy_hosts);
			}

			if (inUseResult?.redirection_hosts.length) {
				await internalNginx.bulkDeleteConfigs("redirection_host", inUseResult.redirection_hosts);
			}

			if (inUseResult?.dead_hosts.length) {
				await internalNginx.bulkDeleteConfigs("dead_host", inUseResult.dead_hosts);
			}
		}
	},

	/**
	 * @param   {Object}  inUseResult
	 * @param   {Number}  inUseResult.total_count
	 * @param   {Array}   inUseResult.proxy_hosts
	 * @param   {Array}   inUseResult.redirection_hosts
	 * @param   {Array}   inUseResult.dead_hosts
	 * @returns {Promise}
	 */
	enableInUseHosts: async (inUseResult) => {
		if (inUseResult.total_count) {
			if (inUseResult.proxy_hosts.length) {
				await internalNginx.bulkGenerateConfigs("proxy_host", inUseResult.proxy_hosts);
			}

			if (inUseResult.redirection_hosts.length) {
				await internalNginx.bulkGenerateConfigs("redirection_host", inUseResult.redirection_hosts);
			}

			if (inUseResult.dead_hosts.length) {
				await internalNginx.bulkGenerateConfigs("dead_host", inUseResult.dead_hosts);
			}
		}
	},

	/**
	 *
	 * @param   {Object}    payload
	 * @param   {string[]}  payload.domains
	 * @returns
	 */
	testHttpsChallenge: async (access, payload) => {
		await access.can("certificates:list");

		// Create a test challenge file
		const testChallengeDir = "/data/letsencrypt-acme-challenge/.well-known/acme-challenge";
		const testChallengeFile = `${testChallengeDir}/test-challenge`;
		fs.mkdirSync(testChallengeDir, { recursive: true });
		fs.writeFileSync(testChallengeFile, "Success", { encoding: "utf8" });

		const results = {};
		for (const domain of payload.domains) {
			results[domain] = await internalCertificate.performTestForDomain(domain);
		}

		// Remove the test challenge file
		fs.unlinkSync(testChallengeFile);

		return results;
	},

	performTestForDomain: async (domain) => {
		logger.info(`Testing http challenge for ${domain}`);
		const url = `http://${domain}/.well-known/acme-challenge/test-challenge`;
		const formBody = `method=G&url=${encodeURI(url)}&bodytype=T&requestbody=&headername=User-Agent&headervalue=None&locationid=1&ch=false&cc=false`;
		const options = {
			method: "POST",
			headers: {
				"User-Agent": "Mozilla/5.0",
				"Content-Type": "application/x-www-form-urlencoded",
				"Content-Length": Buffer.byteLength(formBody),
			},
		};

		const result = await new Promise((resolve) => {
			const req = https.request("https://www.site24x7.com/tools/restapi-tester", options, (res) => {
				let responseBody = "";

				res.on("data", (chunk) => {
					responseBody = responseBody + chunk;
				});

				res.on("end", () => {
					try {
						const parsedBody = JSON.parse(`${responseBody}`);
						if (res.statusCode !== 200) {
							logger.warn(
								`Failed to test HTTP challenge for domain ${domain} because HTTP status code ${res.statusCode} was returned: ${parsedBody.message}`,
							);
							resolve(undefined);
						} else {
							resolve(parsedBody);
						}
					} catch (err) {
						if (res.statusCode !== 200) {
							logger.warn(
								`Failed to test HTTP challenge for domain ${domain} because HTTP status code ${res.statusCode} was returned`,
							);
						} else {
							logger.warn(
								`Failed to test HTTP challenge for domain ${domain} because response failed to be parsed: ${err.message}`,
							);
						}
						resolve(undefined);
					}
				});
			});

			// Make sure to write the request body.
			req.write(formBody);
			req.end();
			req.on("error", (e) => {
				logger.warn(`Failed to test HTTP challenge for domain ${domain}`, e);
				resolve(undefined);
			});
		});

		if (!result) {
			// Some error occurred while trying to get the data
			return "failed";
		}
		if (result.error) {
			logger.info(
				`HTTP challenge test failed for domain ${domain} because error was returned: ${result.error.msg}`,
			);
			return `other:${result.error.msg}`;
		}
		if (`${result.responsecode}` === "200" && result.htmlresponse === "Success") {
			// Server exists and has responded with the correct data
			return "ok";
		}
		if (`${result.responsecode}` === "200") {
			// Server exists but has responded with wrong data
			logger.info(
				`HTTP challenge test failed for domain ${domain} because of invalid returned data:`,
				result.htmlresponse,
			);
			return "wrong-data";
		}
		if (`${result.responsecode}` === "404") {
			// Server exists but responded with a 404
			logger.info(`HTTP challenge test failed for domain ${domain} because code 404 was returned`);
			return "404";
		}
		if (
			`${result.responsecode}` === "0" ||
			(typeof result.reason === "string" && result.reason.toLowerCase() === "host unavailable")
		) {
			// Server does not exist at domain
			logger.info(`HTTP challenge test failed for domain ${domain} the host was not found`);
			return "no-host";
		}
		// Other errors
		logger.info(`HTTP challenge test failed for domain ${domain} because code ${result.responsecode} was returned`);
		return `other:${result.responsecode}`;
	},

	getAdditionalCertbotArgs: (certificate_id, dns_provider) => {
		const args = [];
		if (useLetsencryptServer() !== null) {
			args.push("--server", useLetsencryptServer());
		}
		if (useLetsencryptStaging() && useLetsencryptServer() === null) {
			args.push("--staging");
		}

		// For route53, add the credentials file as an environment variable,
		// inheriting the process env
		const opts = {};
		if (certificate_id && dns_provider === "route53") {
			opts.env = process.env;
			opts.env.AWS_CONFIG_FILE = `/etc/letsencrypt/credentials/credentials-${certificate_id}`;
		}

		if (dns_provider === "duckdns") {
			args.push("--dns-duckdns-no-txt-restore");
		}

		return { args: args, opts: opts };
	},

	getLiveCertPath: (certificateId) => {
		return `/etc/letsencrypt/live/npm-${certificateId}`;
	},
};

export default internalCertificate;
