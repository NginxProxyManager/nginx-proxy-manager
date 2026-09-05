import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import { debug, remoteVersion as logger } from "../logger.js";
import { formatVersion, parseVersion } from "./app-version.js";

const VERSION_URL = "https://hub.docker.com/v2/repositories/moailaozi/nginx-proxy-manager/tags?page_size=100";

const compareVersions = (current, latest) => {
	const currentVersion = parseVersion(current);
	const latestVersion = parseVersion(latest);
	if (!currentVersion || !latestVersion) return false;

	for (const part of ["major", "minor", "revision"]) {
		if (latestVersion[part] > currentVersion[part]) return true;
		if (latestVersion[part] < currentVersion[part]) return false;
	}
	return false;
};

const latestStableTag = (tags) =>
	tags
		.map((tag) => String(tag?.name || "").trim())
		.filter((tag) => /^v?\d+\.\d+\.\d+$/.test(tag))
		.sort((left, right) => {
			if (compareVersions(left, right)) return 1;
			if (compareVersions(right, left)) return -1;
			return 0;
		})[0] || null;

const internalRemoteVersion = {
	cache_timeout: 1000 * 60 * 15,
	last_result: null,
	last_fetch_time: null,

	get: async () => {
		if (
			!internalRemoteVersion.last_result ||
			!internalRemoteVersion.last_fetch_time ||
			Date.now() - internalRemoteVersion.last_fetch_time > internalRemoteVersion.cache_timeout
		) {
			const raw = await internalRemoteVersion.fetchUrl(VERSION_URL);
			internalRemoteVersion.last_result = JSON.parse(raw);
			internalRemoteVersion.last_fetch_time = Date.now();
		} else {
			debug(logger, "Using cached Docker Hub version result");
		}

		const current = formatVersion();
		const latest = latestStableTag(internalRemoteVersion.last_result.results || []);
		return {
			current,
			latest,
			update_available: latest ? compareVersions(current, latest) : false,
		};
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		const headers = { "User-Agent": `Lorwell-Nginx-Proxy-Manager/${formatVersion()}` };

		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			https
				.get(url, { agent, headers }, (res) => {
					res.setEncoding("utf8");
					let rawData = "";
					res.on("data", (chunk) => {
						rawData += chunk;
					});
					res.on("end", () => {
						if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
							reject(new Error(`Docker Hub returned HTTP ${res.statusCode || "unknown"}`));
							return;
						}
						resolve(rawData);
					});
				})
				.on("error", reject);
		});
	},

	compareVersions,
	latestStableTag,
};

export default internalRemoteVersion;
