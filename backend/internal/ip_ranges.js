import fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import utils from "../lib/utils.js";
import { ipRanges as logger } from "../logger.js";
import internalNginx from "./nginx.js";
import pjson from "../package.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLOUDFLARE_V4_URL = "https://www.cloudflare.com/ips-v4";
const CLOUDFLARE_V6_URL = "https://www.cloudflare.com/ips-v6";

const regIpV4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;
const regIpV6 = /^([0-9a-fA-F:]+)\/[0-9]{1,3}$/;

const internalIpRanges = {
	interval_timeout: 1000 * 60 * 60,
	interval: null,
	interval_processing: false,

	initTimer: () => {
		logger.info("IP Ranges Renewal Timer initialized");
		internalIpRanges.interval = setInterval(internalIpRanges.fetch, internalIpRanges.interval_timeout);
	},

	fetchUrl: async (url) => {
		const res = await fetch(url, {
			headers: { "User-Agent": `NPMplus/${pjson.version}` },
		});

		if (!res.ok) {
			throw new Error(`Status code: ${response.status}`);
		}

		return await res.text();
	},

	/**
	 * Triggered at startup and then later by a timer, this will fetch the ip ranges from services and apply them to nginx.
	 */
	fetch: async () => {
		if (internalIpRanges.interval_processing) {
			return;
		}

		internalIpRanges.interval_processing = true;
		logger.info("Fetching IP Ranges from online services...");

		try {
			const [v4Data, v6Data] = await Promise.all([
				internalIpRanges.fetchUrl(CLOUDFLARE_V4_URL),
				internalIpRanges.fetchUrl(CLOUDFLARE_V6_URL),
			]);

			const v4Ranges = v4Data
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => regIpV4.test(line));
			const v6Ranges = v6Data
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => regIpV6.test(line));

			const ip_ranges = [...v4Ranges, ...v6Ranges];

			if (await internalIpRanges.generateConfig(ip_ranges)) {
				await internalNginx.reload();
			}
		} catch (err) {
			logger.error(err.message);
		} finally {
			internalIpRanges.interval_processing = false;
		}
	},

	/**
	 * @param   {Array}  ip_ranges
	 * @returns {Promise<boolean>}
	 */
	generateConfig: async (ip_ranges) => {
		try {
			const renderEngine = utils.getRenderEngine();
			const template = fs.readFileSync(`${__dirname}/../templates/ip_ranges.conf`, { encoding: "utf8" });
			const newConfig = await renderEngine.parseAndRender(template, { ip_ranges: ip_ranges });

			if (fs.existsSync("/usr/local/nginx/conf/conf.d/ip_ranges.conf")) {
				const oldConfig = fs.readFileSync("/usr/local/nginx/conf/conf.d/ip_ranges.conf", {
					encoding: "utf8",
				});
				if (oldConfig === newConfig) {
					logger.info("Not updating Cloudflared IPs");
					return false;
				}
			}

			fs.writeFileSync("/usr/local/nginx/conf/conf.d/ip_ranges.conf", newConfig, { encoding: "utf8" });
			logger.info("Updated Cloudflared IPs");
			return true;
		} catch (err) {
			logger.error(`Error updating Cloudflare IPs: ${err.message}`);
			return false;
		}
	},
};

export default internalIpRanges;
