import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import { debug, remoteVersion as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const VERSION_URL = "https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest";

const internalRemoteVersion = {
	cache_timeout: 1000 * 60 * 15, // 15 minutes
	last_result: null,
	last_fetch_time: null,

	/**
	 * Fetch the latest version info, using a cached result if within the cache timeout period.
	 * @return {Promise<{current: string, latest: string, update_available: boolean}>} Version info
	 */
	get: async () => {
		if (
			!internalRemoteVersion.last_result ||
			!internalRemoteVersion.last_fetch_time ||
			Date.now() - internalRemoteVersion.last_fetch_time > internalRemoteVersion.cache_timeout
		) {
			const raw = await internalRemoteVersion.fetchUrl(VERSION_URL);
			const data = JSON.parse(raw);
			internalRemoteVersion.last_result = data;
			internalRemoteVersion.last_fetch_time = Date.now();
		} else {
			debug(logger, "Using cached remote version result");
		}

		const latestVersion = internalRemoteVersion.last_result.tag_name;
		const version = pjson.version.split("-").shift().split(".");
		const currentVersion = `v${version[0]}.${version[1]}.${version[2]}`;
		return {
			current: currentVersion,
			latest: latestVersion,
			update_available: internalRemoteVersion.compareVersions(currentVersion, latestVersion),
		};
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		const headers = {
			"User-Agent": `NginxProxyManager v${pjson.version}`,
		};

		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			return https
				.get(url, { agent, headers }, (res) => {
					res.setEncoding("utf8");
					let raw_data = "";
					res.on("data", (chunk) => {
						raw_data += chunk;
					});
					res.on("end", () => {
						resolve(raw_data);
					});
				})
				.on("error", (err) => {
					reject(err);
				});
		});
	},

	compareVersions: (current, latest) => {
		const cleanCurrent = current.replace(/^v/, "");
		const cleanLatest = latest.replace(/^v/, "");

		const currentParts = cleanCurrent.split(".").map(Number);
		const latestParts = cleanLatest.split(".").map(Number);

		for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
			const curr = currentParts[i] || 0;
			const lat = latestParts[i] || 0;

			if (lat > curr) return true;
			if (lat < curr) return false;
		}
		return false;
	},
};

export default internalRemoteVersion;
