import fs from "node:fs";
import path from "node:path";
import { mkcert as logger } from "../logger.js";
import errs from "./error.js";
import utils from "./utils.js";

const MKCERT_PATH = "/usr/local/bin/mkcert";
const CA_ROOT_PATH = "/data/mkcert_ca";
const CERT_PATH = "/data/mkcert_ssl";

/**
 * Check if mkcert is installed
 * @returns {Promise<boolean>}
 */
const isInstalled = async () => {
	try {
		await utils.execFile(MKCERT_PATH, ["-version"]);
		return true;
	} catch {
		return false;
	}
};

/**
 * Get mkcert version
 * @returns {Promise<string>}
 */
const getVersion = async () => {
	try {
		const output = await utils.execFile(MKCERT_PATH, ["-version"]);
		return output.trim();
	} catch {
		return null;
	}
};

/**
 * Get the CA root certificate path
 * @returns {Promise<string|null>}
 */
const getCARootPath = async () => {
	try {
		const caRoot = await utils.execFile(MKCERT_PATH, ["-CAROOT"]);
		return caRoot.trim();
	} catch {
		return null;
	}
};

/**
 * Install local CA (run once on first use)
 * Sets up CAROOT environment variable to use custom path
 * @returns {Promise<void>}
 */
const installCA = async () => {
	logger.info("Installing mkcert CA...");

	// Ensure CA directory exists
	if (!fs.existsSync(CA_ROOT_PATH)) {
		fs.mkdirSync(CA_ROOT_PATH, { recursive: true, mode: 0o700 });
	}

	try {
		// Install CA with custom CAROOT
		await utils.exec(`CAROOT=${CA_ROOT_PATH} ${MKCERT_PATH} -install`, {
			env: { ...process.env, CAROOT: CA_ROOT_PATH },
		});
		logger.info("mkcert CA installed successfully");
	} catch (err) {
		logger.error("Failed to install mkcert CA:", err);
		throw new errs.CommandError("Failed to install mkcert CA", 1, err);
	}
};

/**
 * Check if CA is already installed
 * @returns {Promise<boolean>}
 */
const isCAInstalled = async () => {
	const rootCertPath = path.join(CA_ROOT_PATH, "rootCA.pem");
	const rootKeyPath = path.join(CA_ROOT_PATH, "rootCA-key.pem");
	return fs.existsSync(rootCertPath) && fs.existsSync(rootKeyPath);
};

/**
 * Ensure CA is installed, install if not
 * @returns {Promise<void>}
 */
const ensureCA = async () => {
	if (!(await isCAInstalled())) {
		await installCA();
	}
};

/**
 * Validate domain names for security
 * Prevents command injection
 * @param {string[]} domains
 * @returns {boolean}
 */
const validateDomains = (domains) => {
	// Allow alphanumeric, dots, hyphens, and wildcards
	const validDomainRegex = /^[\w\-.*]+$/;
	for (const domain of domains) {
		if (!validDomainRegex.test(domain)) {
			return false;
		}
		// Prevent path traversal
		if (domain.includes("..") || domain.includes("/") || domain.includes("\\")) {
			return false;
		}
	}
	return true;
};

/**
 * Generate certificate for given domains
 * @param {number} certificateId - Certificate ID for file naming
 * @param {string[]} domains - Array of domain names
 * @returns {Promise<{certPath: string, keyPath: string}>}
 */
const generateCertificate = async (certificateId, domains) => {
	if (!domains || domains.length === 0) {
		throw new errs.ValidationError("At least one domain is required");
	}

	if (!validateDomains(domains)) {
		throw new errs.ValidationError(
			"Invalid domain names. Only alphanumeric characters, dots, hyphens, and wildcards are allowed",
		);
	}

	// Ensure CA is installed
	await ensureCA();

	const certDir = path.join(CERT_PATH, `npm-${certificateId}`);
	const certPath = path.join(certDir, "fullchain.pem");
	const keyPath = path.join(certDir, "privkey.pem");

	// Create certificate directory
	if (!fs.existsSync(certDir)) {
		fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });
	}

	logger.info(`Generating mkcert certificate for: ${domains.join(", ")}`);

	try {
		// Generate certificate using mkcert
		const args = ["-cert-file", certPath, "-key-file", keyPath, ...domains];

		await utils.exec(`CAROOT=${CA_ROOT_PATH} ${MKCERT_PATH} ${args.join(" ")}`, {
			env: { ...process.env, CAROOT: CA_ROOT_PATH },
		});

		// Set secure permissions
		fs.chmodSync(certPath, 0o644);
		fs.chmodSync(keyPath, 0o600);

		logger.info(`Certificate generated successfully at ${certDir}`);

		return { certPath, keyPath };
	} catch (err) {
		logger.error("Failed to generate certificate:", err);
		// Clean up on failure
		if (fs.existsSync(certDir)) {
			fs.rmSync(certDir, { recursive: true, force: true });
		}
		throw new errs.CommandError("Failed to generate mkcert certificate", 1, err);
	}
};

/**
 * Read CA root certificate content
 * @returns {Promise<string|null>}
 */
const getCARootCertificate = async () => {
	const rootCertPath = path.join(CA_ROOT_PATH, "rootCA.pem");
	if (fs.existsSync(rootCertPath)) {
		return fs.readFileSync(rootCertPath, "utf8");
	}
	return null;
};

/**
 * Delete certificate files
 * @param {number} certificateId
 * @returns {Promise<void>}
 */
const deleteCertificate = async (certificateId) => {
	const certDir = path.join(CERT_PATH, `npm-${certificateId}`);
	if (fs.existsSync(certDir)) {
		fs.rmSync(certDir, { recursive: true, force: true });
		logger.info(`Deleted certificate directory: ${certDir}`);
	}
};

/**
 * Get certificate file paths
 * @param {number} certificateId
 * @returns {{certPath: string, keyPath: string}}
 */
const getCertificatePaths = (certificateId) => {
	const certDir = path.join(CERT_PATH, `npm-${certificateId}`);
	return {
		certPath: path.join(certDir, "fullchain.pem"),
		keyPath: path.join(certDir, "privkey.pem"),
	};
};

/**
 * Get mkcert status info
 * @returns {Promise<Object>}
 */
const getStatus = async () => {
	const installed = await isInstalled();
	const version = installed ? await getVersion() : null;
	const caInstalled = installed ? await isCAInstalled() : false;
	const caRoot = installed ? CA_ROOT_PATH : null;

	return {
		installed,
		version,
		caInstalled,
		caRoot,
	};
};

export default {
	isInstalled,
	getVersion,
	getCARootPath,
	installCA,
	isCAInstalled,
	ensureCA,
	generateCertificate,
	getCARootCertificate,
	deleteCertificate,
	getCertificatePaths,
	getStatus,
	validateDomains,
	CERT_PATH,
	CA_ROOT_PATH,
};
