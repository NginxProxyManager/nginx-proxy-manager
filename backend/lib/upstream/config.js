/**
 * Environment configuration for upstream discovery, checks and health monitoring.
 *
 * Values are read on every call (not cached at import time) so they can be
 * changed in tests and so the behaviour always matches the current environment.
 */

const DEFAULT_DOCKER_HOST = "unix:///var/run/docker.sock";
const DEFAULT_HEALTH_INTERVAL = 60;
const MIN_HEALTH_INTERVAL = 10;

const toBool = (v) => /^(1|true|yes|on)$/i.test(`${v ?? ""}`.trim());

/**
 * @param   {string}  name
 * @param   {boolean} defaultValue
 * @returns {boolean}
 */
const envBool = (name, defaultValue) => {
	const raw = process.env[name];
	if (typeof raw === "undefined" || `${raw}`.trim() === "") {
		return defaultValue;
	}
	return toBool(raw);
};

/**
 * Docker discovery is opt-in: it needs access to the Docker API, which is root-equivalent.
 *
 * @returns {boolean}
 */
const isDockerDiscoveryEnabled = () => envBool("NPM_DOCKER_DISCOVERY", false);

/**
 * @returns {string}
 */
const getDockerHost = () => {
	const raw = `${process.env.DOCKER_HOST ?? ""}`.trim();
	return raw || DEFAULT_DOCKER_HOST;
};

/**
 * @returns {boolean}
 */
const isDnsDiscoveryEnabled = () => envBool("NPM_DNS_DISCOVERY", true);

/**
 * Kill switch for every TCP/DNS probe made by the backend (check endpoint and health monitor).
 *
 * @returns {boolean}
 */
const isUpstreamCheckEnabled = () => envBool("NPM_UPSTREAM_CHECK", true);

/**
 * Health monitor interval in seconds. 0 disables the monitor.
 * Values between 1 and 9 are raised to 10 seconds to keep the probe load sane.
 *
 * @returns {number}
 */
const getHealthInterval = () => {
	const raw = `${process.env.NPM_UPSTREAM_HEALTH_INTERVAL ?? ""}`.trim();
	if (raw === "") {
		return DEFAULT_HEALTH_INTERVAL;
	}
	const value = Number.parseInt(raw, 10);
	if (Number.isNaN(value) || value < 0) {
		return DEFAULT_HEALTH_INTERVAL;
	}
	if (value === 0) {
		return 0;
	}
	return Math.max(MIN_HEALTH_INTERVAL, value);
};

export {
	DEFAULT_DOCKER_HOST,
	getDockerHost,
	getHealthInterval,
	isDnsDiscoveryEnabled,
	isDockerDiscoveryEnabled,
	isUpstreamCheckEnabled,
	toBool,
};
