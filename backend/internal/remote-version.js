import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import { debug, remoteVersion as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const VERSION_URL = "https://api.github.com/repos/ZoeyVid/NPMplus/releases/latest";

const internalRemoteVersion = {
	cache_timeout: 1000 * 60 * 60 * 24, // 1 day
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
		}

		const latestVersion = internalRemoteVersion.last_result.tag_name;
		const currentVersion = pjson.version;
		return {
			current: currentVersion,
			latest: latestVersion,
			update_available: !currentVersion.startsWith(latestVersion) && currentVersion.length >= 13,
		};
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		const headers = {
			"User-Agent": `NPMplus/${pjson.version}`,
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
};

export default internalRemoteVersion;
