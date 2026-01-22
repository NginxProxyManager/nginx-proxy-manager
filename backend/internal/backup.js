import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import archiverZipEncrypted from "archiver-zip-encrypted";
import unzipper from "unzipper";

// Register encrypted zip format
archiver.registerFormat("zip-encrypted", archiverZipEncrypted);
import db from "../db.js";
import errs from "../lib/error.js";
import { debug, backup as logger } from "../logger.js";

import settingModel from "../models/setting.js";
import userModel from "../models/user.js";
import authModel from "../models/auth.js";
import userPermissionModel from "../models/user_permission.js";
import certificateModel from "../models/certificate.js";
import accessListModel from "../models/access_list.js";
import accessListAuthModel from "../models/access_list_auth.js";
import accessListClientModel from "../models/access_list_client.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import deadHostModel from "../models/dead_host.js";
import streamModel from "../models/stream.js";
import auditLogModel from "../models/audit-log.js";

import internalNginx from "./nginx.js";
import internalAccessList from "./access-list.js";

// Model lookup map for table operations
const models = {
	setting: settingModel,
	user: userModel,
	auth: authModel,
	user_permission: userPermissionModel,
	certificate: certificateModel,
	access_list: accessListModel,
	access_list_auth: accessListAuthModel,
	access_list_client: accessListClientModel,
	proxy_host: proxyHostModel,
	redirection_host: redirectionHostModel,
	dead_host: deadHostModel,
	stream: streamModel,
	audit_log: auditLogModel,
};

const BACKUP_VERSION = 1;

// Table configuration for export/import operations
// - softDelete: if true, filter by is_deleted=0 on export
// - useModel: if true, use model.insert() instead of raw knex (for settings with upsert)
const TABLE_CONFIG = [
	{ table: "setting", useModel: true },
	{ table: "user", softDelete: true },
	{ table: "auth", softDelete: true },
	{ table: "user_permission" },
	{ table: "certificate", softDelete: true },
	{ table: "access_list", softDelete: true },
	{ table: "access_list_auth" },
	{ table: "access_list_client" },
	{ table: "proxy_host", softDelete: true },
	{ table: "redirection_host", softDelete: true },
	{ table: "dead_host", softDelete: true },
	{ table: "stream", softDelete: true },
];

// Delete order: reverse of TABLE_CONFIG with audit_log first (respects FK dependencies)
const DELETE_TABLE_ORDER = ["audit_log", ...TABLE_CONFIG.map((t) => t.table).reverse()];

// Host types that have nginx configs
const NGINX_HOST_TYPES = [
	{ type: "proxy_host", graph: "[certificate, access_list.[items,clients]]" },
	{ type: "redirection_host", graph: "[certificate]" },
	{ type: "dead_host", graph: "[certificate]" },
	{ type: "stream", graph: "[certificate]" },
];

// JSON fields per table that need to be stringified for raw knex inserts
const JSON_FIELDS = {
	user: ["roles"],
	auth: ["meta"],
	setting: ["meta"],
	certificate: ["domain_names", "meta"],
	access_list: ["meta"],
	access_list_auth: ["meta"],
	access_list_client: ["meta"],
	proxy_host: ["domain_names", "meta", "locations"],
	redirection_host: ["domain_names", "meta"],
	dead_host: ["domain_names", "meta"],
	stream: ["meta"],
};

// Boolean fields per table that need to be converted to integers for database compatibility
// SQLite/MySQL store booleans as 0/1 integers, PostgreSQL has native booleans but our schema uses integers
// Converting to 0/1 works for all supported databases (SQLite, MySQL, and PostgreSQL)
const BOOLEAN_FIELDS = {
	user: ["is_deleted", "is_disabled"],
	auth: ["is_deleted"],
	certificate: ["is_deleted"],
	access_list: ["is_deleted", "satisfy_any", "pass_auth"],
	access_list_auth: [],
	access_list_client: [],
	proxy_host: ["is_deleted", "enabled", "ssl_forced", "hsts_enabled", "hsts_subdomains", "http2_support", "block_exploits", "caching_enabled", "allow_websocket_upgrade"],
	redirection_host: ["is_deleted", "enabled", "ssl_forced", "hsts_enabled", "hsts_subdomains", "http2_support", "block_exploits", "preserve_path"],
	dead_host: ["is_deleted", "enabled", "ssl_forced", "hsts_enabled", "hsts_subdomains", "http2_support"],
	stream: ["is_deleted", "enabled", "tcp_forwarding", "udp_forwarding"],
};

// Datetime fields per table that need to be converted for database compatibility
// Backups store dates in ISO 8601 format (e.g., '2026-01-22T06:49:44.000Z')
// MySQL doesn't accept ISO 8601, so we convert to 'YYYY-MM-DD HH:MM:SS' which works
// for all supported databases (SQLite, MySQL, and PostgreSQL)
const DATETIME_FIELDS = {
	user: ["created_on", "modified_on"],
	auth: ["created_on", "modified_on", "expires_on"],
	user_permission: ["created_on", "modified_on"],
	certificate: ["created_on", "modified_on", "expires_on"],
	access_list: ["created_on", "modified_on"],
	access_list_auth: ["created_on", "modified_on"],
	access_list_client: ["created_on", "modified_on"],
	proxy_host: ["created_on", "modified_on"],
	redirection_host: ["created_on", "modified_on"],
	dead_host: ["created_on", "modified_on"],
	stream: ["created_on", "modified_on"],
};

/**
 * Converts an ISO 8601 datetime string to database-compatible format
 * @param {string} isoString - ISO 8601 datetime (e.g., '2026-01-22T06:49:44.000Z')
 * @returns {string} - Database-compatible datetime (e.g., '2026-01-22 06:49:44')
 */
const convertDatetimeForDb = (isoString) => {
	if (!isoString || typeof isoString !== "string") return isoString;
	// Replace 'T' with space and remove milliseconds and 'Z' suffix
	return isoString.replace("T", " ").replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
};

/**
 * Prepares a row for raw knex insert by converting fields to database-compatible formats
 * @param {string} table - Table name
 * @param {Object} row - Row data
 * @returns {Object} - Row with fields converted for database compatibility
 */
const prepareRowForInsert = (table, row) => {
	const prepared = { ...row };

	// Stringify JSON fields
	const jsonFields = JSON_FIELDS[table];
	if (jsonFields) {
		for (const field of jsonFields) {
			if (prepared[field] !== undefined && prepared[field] !== null && typeof prepared[field] === "object") {
				prepared[field] = JSON.stringify(prepared[field]);
			}
		}
	}

	// Convert boolean fields to integers (0/1)
	const booleanFields = BOOLEAN_FIELDS[table];
	if (booleanFields) {
		for (const field of booleanFields) {
			if (prepared[field] !== undefined && prepared[field] !== null) {
				prepared[field] = prepared[field] ? 1 : 0;
			}
		}
	}

	// Convert datetime fields from ISO 8601 to database-compatible format
	const datetimeFields = DATETIME_FIELDS[table];
	if (datetimeFields) {
		for (const field of datetimeFields) {
			if (prepared[field]) {
				prepared[field] = convertDatetimeForDb(prepared[field]);
			}
		}
	}

	return prepared;
};

/**
 * Safely deletes a file or directory, logging errors instead of throwing
 * @param {string} targetPath - Path to delete
 * @param {boolean} recursive - Whether to delete recursively (for directories)
 */
const safeDelete = (targetPath, recursive = false) => {
	try {
		if (fs.existsSync(targetPath)) {
			if (recursive) {
				fs.rmSync(targetPath, { recursive: true, force: true });
			} else {
				fs.unlinkSync(targetPath);
			}
			debug(logger, `Deleted: ${targetPath}`);
		}
	} catch (err) {
		debug(logger, `Could not delete ${targetPath}:`, err.message);
	}
};

/**
 * Safely copies a file, creating parent directories as needed
 * @param {string} source - Source file path
 * @param {string} target - Target file path
 * @param {Object} options - Options: { mode, recursive }
 */
const safeCopy = (source, target, options = {}) => {
	if (!fs.existsSync(source)) return false;

	fs.mkdirSync(path.dirname(target), { recursive: true });
	if (options.recursive) {
		fs.cpSync(source, target, { recursive: true });
	} else {
		fs.copyFileSync(source, target);
		if (options.mode !== undefined) {
			fs.chmodSync(target, options.mode);
		}
	}
	debug(logger, `Copied: ${source} -> ${target}`);
	return true;
};

/**
 * Builds the table counts object for audit log meta
 * @param {Object} tables - Tables object from backup data
 * @returns {Object} - Table counts
 */
const buildTableCounts = (tables) => ({
	users: tables.user?.length || 0,
	certificates: tables.certificate?.length || 0,
	access_lists: tables.access_list?.length || 0,
	proxy_hosts: tables.proxy_host?.length || 0,
	redirection_hosts: tables.redirection_host?.length || 0,
	dead_hosts: tables.dead_host?.length || 0,
	streams: tables.stream?.length || 0,
});

// File paths
const LETSENCRYPT_PATH = "/etc/letsencrypt";
const LETSENCRYPT_LIVE_PATH = `${LETSENCRYPT_PATH}/live`;
const LETSENCRYPT_ARCHIVE_PATH = `${LETSENCRYPT_PATH}/archive`;
const LETSENCRYPT_RENEWAL_PATH = `${LETSENCRYPT_PATH}/renewal`;
const LETSENCRYPT_ACCOUNTS_PATH = `${LETSENCRYPT_PATH}/accounts`;
const LETSENCRYPT_CREDENTIALS_PATH = `${LETSENCRYPT_PATH}/credentials`;
const LETSENCRYPT_RENEWAL_HOOKS_PATH = `${LETSENCRYPT_PATH}/renewal-hooks`;
const CUSTOM_SSL_PATH = "/data/custom_ssl";
const ACCESS_LIST_PATH = "/data/access";

const internalBackup = {
	/**
	 * Export all configuration data and certificate files to a ZIP
	 * @param {Access} access
	 * @param {string|null} password - Optional password for ZIP encryption
	 * @returns {Promise<{fileName: string}>}
	 */
	exportAll: async (access, password = null) => {
		await access.can("settings:update");

		logger.info("Starting backup export...");

		// Collect all database data
		const data = {
			version: BACKUP_VERSION,
			exportedAt: new Date().toISOString(),
			tables: {},
		};

		// Export tables (excluding soft-deleted records where applicable)
		for (const { table, softDelete } of TABLE_CONFIG) {
			const query = models[table].query();
			data.tables[table] = softDelete ? await query.where("is_deleted", 0) : await query;
		}

		// Create ZIP file
		const downloadName = `npm-backup-${Date.now()}.zip`;
		const zipPath = `/tmp/${downloadName}`;

		await internalBackup.createBackupZip(data, zipPath, password);

		logger.info("Backup export completed:", zipPath);

		// Add to audit log
		await auditLogModel.query().insert({
			user_id: access.token.getUserId(1),
			action: "exported",
			object_type: "backup",
			object_id: 0,
			meta: {
				exportedAt: data.exportedAt,
				tables: buildTableCounts(data.tables),
			},
		});

		return {
			fileName: zipPath,
		};
	},

	/**
	 * Creates the backup ZIP file with database JSON and certificate files
	 * @param {Object} data - Database export data
	 * @param {string} outputPath - Path to write ZIP file
	 * @param {string|null} password - Optional password for ZIP encryption
	 * @returns {Promise<void>}
	 */
	createBackupZip: async (data, outputPath, password = null) => {
		return new Promise((resolve, reject) => {
			// Note: Using zip20 (ZipCrypto) instead of aes256 because unzipper only supports
			// legacy zip encryption. AES-256 is more secure but incompatible with unzipper.
			const archive = password
				? archiver.create("zip-encrypted", { zlib: { level: 9 }, encryptionMethod: "zip20", password })
				: archiver("zip", { zlib: { level: 9 } });
			const stream = fs.createWriteStream(outputPath);

			archive.on("error", (err) => reject(err));
			stream.on("close", () => resolve());

			archive.pipe(stream);

			// Add database export as JSON
			archive.append(JSON.stringify(data, null, 2), { name: "database.json" });

			// Add Let's Encrypt certificate directories
			// Note: We don't backup the 'live' directory because it contains symlinks to 'archive'.
			// Instead, we backup 'archive' and recreate the symlinks on restore.
			if (data.tables.certificate) {
				for (const cert of data.tables.certificate) {
					if (cert.provider === "letsencrypt") {
						// Archive directory (actual cert files)
						const archivePath = `${LETSENCRYPT_ARCHIVE_PATH}/npm-${cert.id}`;
						if (fs.existsSync(archivePath)) {
							debug(logger, `Adding Let's Encrypt archive directory: ${archivePath}`);
							archive.directory(archivePath, `letsencrypt/archive/npm-${cert.id}`);
						}

						// README file from live directory (certbot creates this in live, not archive)
						const readmePath = `${LETSENCRYPT_LIVE_PATH}/npm-${cert.id}/README`;
						if (fs.existsSync(readmePath)) {
							debug(logger, `Adding README file: ${readmePath}`);
							archive.file(readmePath, { name: `letsencrypt/live/npm-${cert.id}/README` });
						}

						// Renewal configuration
						const renewalPath = `${LETSENCRYPT_RENEWAL_PATH}/npm-${cert.id}.conf`;
						if (fs.existsSync(renewalPath)) {
							debug(logger, `Adding renewal config: ${renewalPath}`);
							archive.file(renewalPath, { name: `letsencrypt/renewal/npm-${cert.id}.conf` });
						}

						// DNS challenge credentials
						const credPath = `${LETSENCRYPT_CREDENTIALS_PATH}/credentials-${cert.id}`;
						if (fs.existsSync(credPath)) {
							debug(logger, `Adding credentials file: ${credPath}`);
							archive.file(credPath, { name: `letsencrypt/credentials/credentials-${cert.id}` });
						}
					} else if (cert.provider === "other") {
						// Custom SSL certificates
						const customPath = `${CUSTOM_SSL_PATH}/npm-${cert.id}`;
						if (fs.existsSync(customPath)) {
							debug(logger, `Adding custom SSL cert directory: ${customPath}`);
							archive.directory(customPath, `custom_ssl/npm-${cert.id}`);
						}
					}
				}
			}

			// Add Let's Encrypt accounts directory (shared across all certs)
			if (fs.existsSync(LETSENCRYPT_ACCOUNTS_PATH)) {
				debug(logger, `Adding Let's Encrypt accounts directory: ${LETSENCRYPT_ACCOUNTS_PATH}`);
				archive.directory(LETSENCRYPT_ACCOUNTS_PATH, "letsencrypt/accounts");
			}

			// Add Let's Encrypt renewal-hooks directory (shared across all certs)
			if (fs.existsSync(LETSENCRYPT_RENEWAL_HOOKS_PATH)) {
				debug(logger, `Adding Let's Encrypt renewal-hooks directory: ${LETSENCRYPT_RENEWAL_HOOKS_PATH}`);
				archive.directory(LETSENCRYPT_RENEWAL_HOOKS_PATH, "letsencrypt/renewal-hooks");
			}

			// Add access list htpasswd files
			if (data.tables.access_list) {
				for (const list of data.tables.access_list) {
					const htpasswdPath = `${ACCESS_LIST_PATH}/${list.id}`;
					if (fs.existsSync(htpasswdPath)) {
						debug(logger, `Adding htpasswd file: ${htpasswdPath}`);
						archive.file(htpasswdPath, { name: `access/${list.id}` });
					}
				}
			}

			archive.finalize();
		});
	},

	/**
	 * Extracts a ZIP directory to disk, supporting password-protected files
	 * @param {Object} directory - unzipper directory object from Open.file()
	 * @param {string} extractDir - Directory to extract files to
	 * @param {string|null} password - Optional password for encrypted files
	 * @returns {Promise<void>}
	 */
	extractZipDirectory: async (directory, extractDir, password = null) => {
		for (const file of directory.files) {
			const filePath = path.join(extractDir, file.path);

			if (file.type === "Directory") {
				fs.mkdirSync(filePath, { recursive: true });
				continue;
			}

			// Ensure parent directory exists
			fs.mkdirSync(path.dirname(filePath), { recursive: true });

			// Extract file content using stream with optional password
			await new Promise((resolve, reject) => {
				const writeStream = fs.createWriteStream(filePath);
				const readStream = file.stream(password || undefined);

				// Must listen for errors on BOTH streams - unzipper emits password errors on the read stream
				readStream.on("error", reject);
				writeStream.on("error", reject);
				writeStream.on("finish", resolve);

				readStream.pipe(writeStream);
			});
		}
	},

	/**
	 * Import configuration from a backup ZIP file
	 * @param {Access} access
	 * @param {Object} file - Uploaded file object from express-fileupload
	 * @param {string|null} password - Optional password for encrypted ZIPs
	 * @returns {Promise<{success: boolean, message: string}>}
	 */
	importAll: async (access, file, password = null) => {
		await access.can("settings:update");

		if (!file || !file.data) {
			throw new errs.ValidationError("No backup file provided");
		}

		logger.info("Starting backup import...");

		// Write uploaded file to temp location
		const tempZipPath = `/tmp/npm-backup-upload-${Date.now()}.zip`;
		const extractDir = `/tmp/npm-backup-extract-${Date.now()}`;

		try {
			// Write the uploaded file to disk
			fs.writeFileSync(tempZipPath, file.data);

			// Extract ZIP (with optional password for encrypted backups)
			fs.mkdirSync(extractDir, { recursive: true });
			try {
				const directory = await unzipper.Open.file(tempZipPath);
				await internalBackup.extractZipDirectory(directory, extractDir, password);
			} catch (extractErr) {
				// Check if this is a password-related error from unzipper
				const errMsg = extractErr.message || "";
				debug(logger, `Zip extraction error: ${errMsg}`);

				if (errMsg === "MISSING_PASSWORD") {
					throw new errs.ValidationError("This backup is password-protected. Please provide the password.");
				}
				if (errMsg === "BAD_PASSWORD") {
					throw new errs.ValidationError("Incorrect password. Please check and try again.");
				}
				throw new errs.ValidationError(`Failed to extract backup file: ${errMsg}`);
			}

			// Read and validate database.json
			const dbJsonPath = path.join(extractDir, "database.json");
			if (!fs.existsSync(dbJsonPath)) {
				throw new errs.ValidationError("Invalid backup file: missing database.json");
			}

			const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf8"));

			// Validate backup version
			if (!data.version || data.version > BACKUP_VERSION) {
				throw new errs.ValidationError(
					`Unsupported backup version: ${data.version}. Maximum supported: ${BACKUP_VERSION}`,
				);
			}

			// Validate required tables exist
			const requiredTables = ["user", "setting"];
			for (const table of requiredTables) {
				if (!data.tables[table]) {
					throw new errs.ValidationError(`Invalid backup: missing ${table} table`);
				}
			}

			// Purge existing files before we delete DB rows
			await internalBackup.purgeNginxConfigs();
			await internalBackup.purgeAccessListFiles();
			await internalBackup.purgeCertificateFiles();

			// Perform the import
			await internalBackup.performImport(data, extractDir);

			// Regenerate all nginx configs
			await internalBackup.regenerateNginxConfigs();

			logger.info("Backup import completed successfully");

			// Add audit log entry for the import (user_id=0 since original user no longer exists)
			try {
				await models.audit_log.query().insert({
					user_id: 0,
					action: "imported",
					object_type: "backup",
					object_id: 0,
					meta: {
						importedAt: new Date().toISOString(),
						backupVersion: data.version,
						backupExportedAt: data.exportedAt,
						tables: buildTableCounts(data.tables),
					},
				});
			} catch (auditErr) {
				// Don't fail the restore if audit logging fails
				logger.warn("Could not add audit log entry:", auditErr.message);
			}

			return {
				success: true,
				message: "Backup restored successfully. Please log in again.",
			};
		} finally {
			// Cleanup temp files
			try {
				if (fs.existsSync(tempZipPath)) {
					fs.unlinkSync(tempZipPath);
				}
				if (fs.existsSync(extractDir)) {
					fs.rmSync(extractDir, { recursive: true, force: true });
				}
			} catch (e) {
				logger.warn("Failed to cleanup temp files:", e.message);
			}
		}
	},

	/**
	 * Performs the actual database import in correct FK order
	 * @param {Object} data - Parsed backup data
	 * @param {string} extractDir - Path to extracted backup files
	 * @returns {Promise<void>}
	 */
	performImport: async (data, extractDir) => {
		const tables = data.tables;
		const knex = db();

		// Clear ALL existing data in reverse dependency order
		// This includes users - restore replaces everything
		logger.info("Clearing existing data...");
		for (const table of DELETE_TABLE_ORDER) {
			await models[table].query().delete();
		}

		// Restore all files FIRST (before DB imports)
		logger.info("Restoring certificate files...");
		await internalBackup.restoreCertificateFiles(tables.certificate || [], extractDir);

		logger.info("Restoring access list files...");
		await internalBackup.restoreAccessListFiles(tables.access_list || [], extractDir);

		// Import all tables in dependency order
		// Uses raw knex to bypass Objection's $beforeInsert hooks (preserves IDs, hashed passwords, etc.)
		for (const { table, useModel } of TABLE_CONFIG) {
			if (!tables[table]) continue;

			logger.info(`Importing ${table}...`);
			for (const row of tables[table]) {
				if (useModel) {
					await models[table].query().insert(row).onConflict("id").merge();
				} else {
					await knex(table).insert(prepareRowForInsert(table, row));
				}
			}
		}
	},

	/**
	 * Restores certificate files from backup to their target locations
	 * @param {Array} certificates - Array of certificate records
	 * @param {string} extractDir - Path to extracted backup
	 * @returns {Promise<void>}
	 */
	restoreCertificateFiles: async (certificates, extractDir) => {
		// Restore shared Let's Encrypt directories first
		safeCopy(path.join(extractDir, "letsencrypt/accounts"), LETSENCRYPT_ACCOUNTS_PATH, { recursive: true });
		safeCopy(path.join(extractDir, "letsencrypt/renewal-hooks"), LETSENCRYPT_RENEWAL_HOOKS_PATH, { recursive: true });

		// Restore per-certificate files
		for (const cert of certificates) {
			if (cert.provider === "letsencrypt") {
				// Archive directory (actual cert files)
				const archiveSource = path.join(extractDir, `letsencrypt/archive/npm-${cert.id}`);
				const archiveTarget = `${LETSENCRYPT_ARCHIVE_PATH}/npm-${cert.id}`;
				if (safeCopy(archiveSource, archiveTarget, { recursive: true })) {
					// Create live directory with symlinks to archive
					await internalBackup.createLiveSymlinks(cert.id);
				}

				// Renewal config
				safeCopy(
					path.join(extractDir, `letsencrypt/renewal/npm-${cert.id}.conf`),
					`${LETSENCRYPT_RENEWAL_PATH}/npm-${cert.id}.conf`,
				);

				// Credentials (with restricted permissions)
				safeCopy(
					path.join(extractDir, `letsencrypt/credentials/credentials-${cert.id}`),
					`${LETSENCRYPT_CREDENTIALS_PATH}/credentials-${cert.id}`,
					{ mode: 0o600 },
				);

				// README file (certbot creates this in live directory)
				safeCopy(
					path.join(extractDir, `letsencrypt/live/npm-${cert.id}/README`),
					`${LETSENCRYPT_LIVE_PATH}/npm-${cert.id}/README`,
				);
			} else if (cert.provider === "other") {
				safeCopy(
					path.join(extractDir, `custom_ssl/npm-${cert.id}`),
					`${CUSTOM_SSL_PATH}/npm-${cert.id}`,
					{ recursive: true },
				);
			}
		}
	},

	/**
	 * Creates the live directory symlinks pointing to the latest files in archive
	 * Certbot uses symlinks like: live/npm-X/fullchain.pem -> ../../archive/npm-X/fullchainN.pem
	 * @param {number} certId - Certificate ID
	 * @returns {Promise<void>}
	 */
	createLiveSymlinks: async (certId) => {
		const archiveDir = `${LETSENCRYPT_ARCHIVE_PATH}/npm-${certId}`;
		const liveDir = `${LETSENCRYPT_LIVE_PATH}/npm-${certId}`;

		if (!fs.existsSync(archiveDir)) {
			debug(logger, `Archive directory does not exist: ${archiveDir}`);
			return;
		}

		// Create live directory
		fs.mkdirSync(liveDir, { recursive: true });

		// Standard certbot certificate files
		const certFiles = ["cert", "chain", "fullchain", "privkey"];

		for (const baseName of certFiles) {
			// Find the highest version number for this file in archive
			const files = fs.readdirSync(archiveDir).filter((f) => f.startsWith(`${baseName}`) && f.endsWith(".pem"));
			if (files.length === 0) continue;

			// Sort to get the highest version (e.g., fullchain2.pem > fullchain1.pem)
			files.sort((a, b) => {
				const numA = Number.parseInt(a.replace(`${baseName}`, "").replace(".pem", ""), 10) || 0;
				const numB = Number.parseInt(b.replace(`${baseName}`, "").replace(".pem", ""), 10) || 0;
				return numB - numA;
			});

			const latestFile = files[0];
			const symlinkPath = path.join(liveDir, `${baseName}.pem`);
			const targetPath = `../../archive/npm-${certId}/${latestFile}`;

			try {
				// Remove existing symlink if present
				if (fs.existsSync(symlinkPath)) {
					fs.unlinkSync(symlinkPath);
				}
				fs.symlinkSync(targetPath, symlinkPath);
				debug(logger, `Created symlink: ${symlinkPath} -> ${targetPath}`);
			} catch (err) {
				debug(logger, `Could not create symlink ${symlinkPath}:`, err.message);
			}
		}
		debug(logger, `Created live symlinks for certificate ${certId}`);
	},

	/**
	 * Restores access list htpasswd files from backup
	 * @param {Array} accessLists - Array of access list records
	 * @param {string} extractDir - Path to extracted backup
	 * @returns {Promise<void>}
	 */
	restoreAccessListFiles: async (accessLists, extractDir) => {
		for (const list of accessLists) {
			safeCopy(path.join(extractDir, `access/${list.id}`), `${ACCESS_LIST_PATH}/${list.id}`);
		}
	},

	/**
	 * Purges all access list (htpasswd) files before import
	 * @returns {Promise<void>}
	 */
	purgeAccessListFiles: async () => {
		logger.info("Purging existing access list files...");

		const accessLists = await models.access_list.query().where("is_deleted", 0);

		for (const list of accessLists) {
			safeDelete(internalAccessList.getFilename(list));
		}

		logger.info(`Access list files purged (${accessLists.length} files)`);
	},

	/**
	 * Purges all certificate files before import
	 * This removes Let's Encrypt certs, credentials, and custom SSL certs
	 * @returns {Promise<void>}
	 */
	purgeCertificateFiles: async () => {
		logger.info("Purging existing certificate files...");

		// Purge shared Let's Encrypt directories
		safeDelete(LETSENCRYPT_ACCOUNTS_PATH, true);
		safeDelete(LETSENCRYPT_RENEWAL_HOOKS_PATH, true);

		// Purge per-certificate files
		const certificates = await models.certificate.query().where("is_deleted", 0);

		for (const cert of certificates) {
			if (cert.provider === "letsencrypt") {
				safeDelete(`${LETSENCRYPT_LIVE_PATH}/npm-${cert.id}`, true);
				safeDelete(`${LETSENCRYPT_ARCHIVE_PATH}/npm-${cert.id}`, true);
				safeDelete(`${LETSENCRYPT_RENEWAL_PATH}/npm-${cert.id}.conf`);
				safeDelete(`${LETSENCRYPT_CREDENTIALS_PATH}/credentials-${cert.id}`);
			} else if (cert.provider === "other") {
				safeDelete(`${CUSTOM_SSL_PATH}/npm-${cert.id}`, true);
			}
		}

		logger.info(`Certificate files purged (${certificates.length} certificates)`);
	},

	/**
	 * Purges all nginx configuration files before import
	 * This must be called before database rows are deleted to avoid orphaned configs
	 * @returns {Promise<void>}
	 */
	purgeNginxConfigs: async () => {
		logger.info("Purging existing nginx configs...");

		for (const { type } of NGINX_HOST_TYPES) {
			const hosts = await models[type].query().where("is_deleted", 0);
			if (hosts.length) {
				logger.info(`Deleting ${hosts.length} ${type} configs...`);
				await internalNginx.bulkDeleteConfigs(type, hosts);
			}
		}

		logger.info("Nginx configs purged");
	},

	/**
	 * Regenerates all nginx configuration files after import
	 * @returns {Promise<void>}
	 */
	regenerateNginxConfigs: async () => {
		logger.info("Regenerating nginx configs...");

		// Regenerate configs for all host types
		for (const { type, graph } of NGINX_HOST_TYPES) {
			const hosts = await models[type]
				.query()
				.where("is_deleted", 0)
				.andWhere("enabled", 1)
				.withGraphFetched(graph);

			if (hosts.length) {
				logger.info(`Regenerating ${hosts.length} ${type} configs...`);
				await internalNginx.bulkGenerateConfigs(type, hosts);
			}
		}

		// Regenerate default site config
		const defaultSiteSetting = await models.setting.query().where("id", "default-site").first();
		if (defaultSiteSetting) {
			logger.info("Regenerating default site config...");
			await internalNginx.generateConfig("default", defaultSiteSetting);
		}

		// Test and reload nginx
		logger.info("Testing nginx configuration...");
		await internalNginx.test();
		logger.info("Reloading nginx...");
		await internalNginx.reload();

		logger.info("Nginx configs regenerated successfully");
	},
};

export default internalBackup;
