import { remoteVersion as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const internalRemoteVersion = {
	cache_timeout: 1000 * 60 * 60, // 1 hour
	last_result: null,
	last_fetch_time: null,

	/**
	 * Fetch the latest version info, using a cached result if within the cache timeout period.
	 * @return {Promise<{current: string, latest: string, update_available: boolean}>} Version info
	 */
	get: async () => {
		try {
			if (
				!internalRemoteVersion.last_result ||
				!internalRemoteVersion.last_fetch_time ||
				Date.now() - internalRemoteVersion.last_fetch_time > internalRemoteVersion.cache_timeout
			) {
				const response = await fetch("https://api.github.com/repos/ZoeyVid/NPMplus/releases/latest", {
					headers: {
						"User-Agent": `NPMplus/${pjson.version}`,
					},
				});

				if (!response.ok) {
					throw new Error(`Status code: ${response.status}`);
				}

				const data = await response.json();

				internalRemoteVersion.last_result = data;
				internalRemoteVersion.last_fetch_time = Date.now();
			}
		} catch (error) {
			logger.error("Failed to fetch remote version:", error.message);
			if (!internalRemoteVersion.last_result) {
				return {
					current: pjson.version,
					latest: "unknown",
					update_available: false,
				};
			}
		}

		const latestVersion = internalRemoteVersion.last_result?.tag_name || "unknown";
		const currentVersion = pjson.version;
		return {
			current: currentVersion,
			latest: latestVersion,
			update_available: !currentVersion.startsWith(latestVersion) && currentVersion.length >= 13,
		};
	},
};

export default internalRemoteVersion;
