import fs from "node:fs";
import https from "node:https";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "proxy-agent";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { ipRangesEO as logger } from "../logger.js";
import internalNginx from "./nginx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==== EdgeOne Environment Variables ====
const EO_IP_RANGES_FETCH_ENABLED = process.env.EO_IP_RANGES_FETCH_ENABLED === "true";
const EO_API_BASE = process.env.EO_API_BASE || "";
const EO_API_SECRET_ID = process.env.EO_API_SECRET_ID || "";
const EO_API_SECRET_KEY = process.env.EO_API_SECRET_KEY || "";
const EO_ZONE_IDS = process.env.EO_ZONE_IDS ? process.env.EO_ZONE_IDS.split(",") : [];
const EO_IP_RANGES_FETCH_INTERVAL = parseInt(process.env.EO_IP_RANGES_FETCH_INTERVAL || "", 10) || 1000 * 60 * 60 * 72; // Default: 3 days
const EO_IP_RANGES_DEBUG = process.env.EO_IP_RANGES_DEBUG === "true";
const OUTPUT_FILE = "/etc/nginx/conf.d/include/ip_ranges_eo.conf";

// ==== EdgeOne IP Range Handler Skeleton ====
const internalIpRangesEo = {
	interval: null,
	interval_timeout: EO_IP_RANGES_FETCH_INTERVAL,
	interval_processing: false,
	iteration_count: 0,

	initTimer: () => {
		logger.info("EdgeOne IP Ranges Renewal Timer initialized");
		if (internalIpRangesEo.interval) {
			clearInterval(internalIpRangesEo.interval);
		}
		internalIpRangesEo.interval = setInterval(
			internalIpRangesEo.fetch,
			internalIpRangesEo.interval_timeout
		);
	},

	/**
	 * Main fetch method for EdgeOne.
	 * Fetches IP ranges from EdgeOne API for each Zone ID, merges them, and writes to config.
	 */
	fetch: async () => {
		if (internalIpRangesEo.interval_processing || !EO_IP_RANGES_FETCH_ENABLED) {
			return;
		}
		internalIpRangesEo.interval_processing = true;
		logger.info("Fetching EdgeOne IP Ranges from API ...");

		try {
			// --- TODO: fetch logic per API spec ---
			// 1. Loop EO_ZONE_IDS, make API calls to EO_API_BASE using EO_API_SECRET_ID/EO_API_SECRET_KEY
			// 2. Merge results into a single ip_ranges list of strings
			const ip_ranges = [];

			// --- Example debug logging ---
			if (EO_IP_RANGES_DEBUG) {
				logger.info(
					`EO_API_BASE: ${EO_API_BASE}, EO_ZONE_IDS: ${EO_ZONE_IDS}, EO_API_SECRET_ID: ***`
				);
			}

			// --- TODO: Populate ip_ranges array above with API response data ---

			// Generate config
			await internalIpRangesEo.generateConfig(ip_ranges);

			// Optionally reload nginx if needed
			if (internalIpRangesEo.iteration_count > 0) {
				await internalNginx.reload();
			}
			internalIpRangesEo.iteration_count++;
		} catch (err) {
			logger.fatal("EdgeOne IP range fetch failed: " + err.message);
		}
		internalIpRangesEo.interval_processing = false;
	},

	/**
	 * Generates the Nginx include config file for EdgeOne IPs.
	 * @param {Array<string>} ip_ranges
	 */
	generateConfig: (ip_ranges) => {
		const renderEngine = utils.getRenderEngine();
		return new Promise((resolve, reject) => {
			let template = null;
			const filename = OUTPUT_FILE;
			try {
				template = fs.readFileSync(
					`${__dirname}/../templates/ip_ranges.conf`,
					{ encoding: "utf8" }
				);
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			renderEngine
				.parseAndRender(template, { ip_ranges: ip_ranges })
				.then((config_text) => {
					fs.writeFileSync(filename, config_text, { encoding: "utf8" });
					resolve(true);
				})
				.catch((err) => {
					logger.warn(`Could not write ${filename}: ${err.message}`);
					reject(new errs.ConfigurationError(err.message));
				});
		});
	},
};

export default internalIpRangesEo;
