import { exec as nodeExec, execFile as nodeExecFile } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import _ from "lodash";
import { debug, global as logger } from "../logger.js";
import errs from "./error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const exec = async (cmd, options = {}) => {
	debug(logger, "CMD:", cmd);
	const { stdout, stderr } = await new Promise((resolve, reject) => {
		const child = nodeExec(cmd, options, (isError, stdout, stderr) => {
			if (isError) {
				reject(new errs.CommandError(stderr, isError));
			} else {
				resolve({ stdout, stderr });
			}
		});

		child.on("error", (e) => {
			reject(new errs.CommandError(stderr, 1, e));
		});
	});
	return stdout;
};

/**
 * @param   {String} cmd
 * @param   {Array}  args
 * @param   {Object|undefined}  options
 * @returns {Promise}
 */
const execFile = (cmd, args, options) => {
	debug(logger, `CMD: ${cmd} ${args ? args.join(" ") : ""}`);
	const opts = options || {};

	return new Promise((resolve, reject) => {
		nodeExecFile(cmd, args, opts, (err, stdout, stderr) => {
			if (err && typeof err === "object") {
				reject(new errs.CommandError(stderr, 1, err));
			} else {
				resolve(stdout.trim());
			}
		});
	});
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRow = (omissions) => {
	/**
	 * @param   {Object} row
	 * @returns {Object}
	 */
	return (row) => {
		return _.omit(row, omissions);
	};
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRows = (omissions) => {
	/**
	 * @param   {Array} rows
	 * @returns {Object}
	 */
	return (rows) => {
		rows.forEach((row, idx) => {
			rows[idx] = _.omit(row, omissions);
		});
		return rows;
	};
};

/**
 * @returns {Object} Liquid render engine
 */
const getRenderEngine = () => {
	const renderEngine = new Liquid({
		root: `${__dirname}/../templates/`,
	});

	/**
	 * nginxAccessRule expects the object given to have 2 properties:
	 *
	 * directive  string
	 * address    string
	 */
	renderEngine.registerFilter("nginxAccessRule", (v) => {
		if (typeof v.directive !== "undefined" && typeof v.address !== "undefined" && v.directive && v.address) {
			return `${v.directive} ${v.address};`;
		}
		return "";
	});

	return renderEngine;
};

const MAX_DOMAIN_FILENAME_LENGTH = 200;

/**
 * Sanitize a domain label for use in nginx config / log filenames.
 * Invalid or empty input yields "" (callers fall back to id-only basenames).
 *
 * @param   {String} domain
 * @returns {String}
 */
const sanitizeDomainForFilename = (domain) => {
	if (!domain || typeof domain !== "string") {
		return "";
	}
	let s = domain.trim().toLowerCase();
	s = s.replace(/[^a-z0-9.-]+/g, "_");
	s = s.replace(/_+/g, "_");
	s = s.replace(/^\.+|\.+$/g, "");
	if (s.length > MAX_DOMAIN_FILENAME_LENGTH) {
		s = s.slice(0, MAX_DOMAIN_FILENAME_LENGTH);
		s = s.replace(/[._]+$/g, "");
	}
	return s || "";
};

/**
 * Basename (no .conf) for proxy / redirection / dead hosts: id, or id.first-domain when domain_names is non-empty.
 *
 * @param   {Object} host
 * @returns {String}
 */
const getNginxFileBasenameForDomainHost = (host) => {
	const id = host.id;
	const domains = host.domain_names;
	if (Array.isArray(domains) && domains.length > 0) {
		const slug = sanitizeDomainForFilename(domains[0]);
		if (!slug) {
			return String(id);
		}
		return `${id}.${slug}`;
	}
	return String(id);
};

/**
 * Basename (no .conf) for stream hosts: id.incoming_port
 *
 * @param   {Object} host
 * @returns {String}
 */
const getNginxFileBasenameForStream = (host) => {
	const id = host.id;
	const port = host.incoming_port;
	if (port === undefined || port === null || port === "") {
		return String(id);
	}
	return `${id}.${port}`;
};

/**
 * Stem used in nginx config paths, log filenames, and Liquid `nginx_file_stem`.
 *
 * @param   {String} nice_host_type  e.g. proxy_host, stream (not default_host path — still used for template vars)
 * @param   {Object} [host]
 * @returns {String}
 */
const getNginxFileStem = (nice_host_type, host) => {
	if (nice_host_type === "default") {
		return host && typeof host.id !== "undefined" ? String(host.id) : "";
	}
	if (nice_host_type === "stream") {
		return getNginxFileBasenameForStream(host);
	}
	if (
		nice_host_type === "proxy_host" ||
		nice_host_type === "redirection_host" ||
		nice_host_type === "dead_host"
	) {
		return getNginxFileBasenameForDomainHost(host);
	}
	return host && typeof host.id !== "undefined" ? String(host.id) : "";
};

/**
 * Temp Lets Encrypt nginx config basename (no .conf), under /data/nginx/temp/
 *
 * @param   {Object} certificate
 * @returns {String}
 */
const getLetsEncryptTempConfigBasename = (certificate) => {
	const id = certificate.id;
	const domains = certificate.domain_names;
	if (Array.isArray(domains) && domains.length > 0) {
		const slug = sanitizeDomainForFilename(domains[0]);
		if (!slug) {
			return `letsencrypt_${id}`;
		}
		return `letsencrypt_${id}.${slug}`;
	}
	return `letsencrypt_${id}`;
};

/**
 * Basenames under /data/nginx/{type}/ that should be deleted for a host id (used by tests and nginx cleanup).
 *
 * @param   {String[]}  dirEntries  filenames only
 * @param   {Number}    hostId
 * @param   {Boolean}   deleteErrFile
 * @returns {String[]}
 */
const diskConfigFilenamesToDelete = (dirEntries, hostId, deleteErrFile) => {
	const prefix = `${hostId}.`;
	return dirEntries.filter((name) => {
		if (!name.startsWith(prefix)) {
			return false;
		}
		if (name.endsWith(".conf.err")) {
			return deleteErrFile;
		}
		if (name.endsWith(".conf")) {
			return true;
		}
		return false;
	});
};

/**
 * Basenames under /data/nginx/temp/ that match a certificate id.
 *
 * @param   {String[]}  dirEntries
 * @param   {Number}    certificateId
 * @returns {String[]}
 */
const letsencryptTempConfigFilenamesToDelete = (dirEntries, certificateId) => {
	const prefix = `letsencrypt_${certificateId}.`;
	return dirEntries.filter((name) => name.startsWith(prefix) && name.endsWith(".conf"));
};

export {
	sanitizeDomainForFilename,
	getNginxFileBasenameForDomainHost,
	getNginxFileBasenameForStream,
	getNginxFileStem,
	getLetsEncryptTempConfigBasename,
	diskConfigFilenamesToDelete,
	letsencryptTempConfigFilenamesToDelete,
};
export default {
	exec,
	execFile,
	omitRow,
	omitRows,
	getRenderEngine,
	sanitizeDomainForFilename,
	getNginxFileBasenameForDomainHost,
	getNginxFileBasenameForStream,
	getNginxFileStem,
	getLetsEncryptTempConfigBasename,
	diskConfigFilenamesToDelete,
	letsencryptTempConfigFilenamesToDelete,
};
