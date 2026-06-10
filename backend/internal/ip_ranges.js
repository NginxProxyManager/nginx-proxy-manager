import fs from "node:fs";
import https from "node:https";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "proxy-agent";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { ipRanges as logger } from "../logger.js";
import settingModel from "../models/setting.js";
import internalNginx from "./nginx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLOUDFRONT_URL = "https://ip-ranges.amazonaws.com/ip-ranges.json";
const CLOUDFARE_V4_URL = "https://www.cloudflare.com/ips-v4";
const CLOUDFARE_V6_URL = "https://www.cloudflare.com/ips-v6";

const regIpV4 = /^(\d+\.?){4}\/\d+/;
const regIpV6 = /^(([\da-fA-F]+)?:)+\/\d+/;

const internalIpRanges = {
	interval_timeout: 1000 * 60 * 60 * 6, // 6 hours
	interval: null,
	interval_processing: false,
	iteration_count: 0,
	last_ip_ranges: [],

	initTimer: () => {
		logger.info("IP Ranges Renewal Timer initialized");
		internalIpRanges.interval = setInterval(internalIpRanges.fetch, internalIpRanges.interval_timeout);
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			return https
				.get(url, { agent }, (res) => {
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

	/**
	 * Triggered at startup and then later by a timer, this will fetch the ip ranges from services and apply them to nginx.
	 */
	fetch: () => {
		if (!internalIpRanges.interval_processing) {
			internalIpRanges.interval_processing = true;
			logger.info("Fetching IP Ranges from online services...");

			let ip_ranges = [];

			return internalIpRanges
				.fetchUrl(CLOUDFRONT_URL)
				.then((cloudfront_data) => {
					const data = JSON.parse(cloudfront_data);

					if (data && typeof data.prefixes !== "undefined") {
						data.prefixes.map((item) => {
							if (item.service === "CLOUDFRONT") {
								ip_ranges.push(item.ip_prefix);
							}
							return true;
						});
					}

					if (data && typeof data.ipv6_prefixes !== "undefined") {
						data.ipv6_prefixes.map((item) => {
							if (item.service === "CLOUDFRONT") {
								ip_ranges.push(item.ipv6_prefix);
							}
							return true;
						});
					}
				})
				.then(() => {
					return internalIpRanges.fetchUrl(CLOUDFARE_V4_URL);
				})
				.then((cloudfare_data) => {
					const items = cloudfare_data.split("\n").filter((line) => regIpV4.test(line));
					ip_ranges = [...ip_ranges, ...items];
				})
				.then(() => {
					return internalIpRanges.fetchUrl(CLOUDFARE_V6_URL);
				})
				.then((cloudfare_data) => {
					const items = cloudfare_data.split("\n").filter((line) => regIpV6.test(line));
					ip_ranges = [...ip_ranges, ...items];
				})
				.then(() => {
					const clean_ip_ranges = [];
					ip_ranges.map((range) => {
						if (range) {
							clean_ip_ranges.push(range);
						}
						return true;
					});

					internalIpRanges.last_ip_ranges = clean_ip_ranges;

					return internalIpRanges.generateConfig(clean_ip_ranges).then(() => {
						// Always reload nginx after writing the config — even on the very first
						// iteration. nginx and backend boot in parallel under s6, so by the time
						// we finish fetching IP ranges nginx has typically already loaded its
						// config without ip_ranges.conf (it's an optional include) and is running
						// without `real_ip_header` set. Skipping the reload meant the configured
						// real-ip header (e.g. cf-connecting-ip) wasn't honored until the user
						// manually re-saved the setting.
						//
						// If nginx isn't up yet, the reload will fail; we log and continue so the
						// boot sequence isn't broken — nginx will read the file when it starts.
						return internalNginx.reload().catch((err) => {
							logger.warn(`nginx reload after ip_ranges write failed (likely starting): ${err.message}`);
						});
					});
				})
				.then(() => {
					internalIpRanges.interval_processing = false;
					internalIpRanges.iteration_count++;
				})
				.catch((err) => {
					logger.fatal(err.message);
					internalIpRanges.interval_processing = false;
				});
		}
	},

	/**
	 * @param   {Array}  ip_ranges
	 * @returns {Promise}
	 */
	generateConfig: async (ip_ranges) => {
		let realIpHeader = "X-Real-IP";
		try {
			const setting = await settingModel.query().where("id", "real-ip-header").first();
			if (setting?.value) {
				const candidate = setting.value === "custom" && setting.meta?.custom
					? setting.meta.custom
					: setting.value;
				// Defense-in-depth: even though the PUT schema validates this, the value lands
				// in a raw nginx directive, so reject anything that isn't a plain header name.
				if (/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(candidate)) {
					realIpHeader = candidate;
				} else {
					logger.warn(`Ignoring invalid real-ip-header setting "${candidate}" — falling back to X-Real-IP`);
				}
			}
		} catch (err) {
			logger.warn(`Could not read real-ip-header setting: ${err.message} — falling back to X-Real-IP`);
		}

		const renderEngine = utils.getRenderEngine();
		return new Promise((resolve, reject) => {
			let template = null;
			const filename = "/etc/nginx/conf.d/include/ip_ranges.conf";
			try {
				template = fs.readFileSync(`${__dirname}/../templates/ip_ranges.conf`, { encoding: "utf8" });
			} catch (err) {
				reject(new errs.ConfigurationError(err.message));
				return;
			}

			renderEngine
				.parseAndRender(template, { ip_ranges: ip_ranges, real_ip_header: realIpHeader })
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

	/**
	 * Regenerate ip_ranges.conf with cached ranges and reload nginx.
	 * Called when the real-ip-header setting changes.
	 * @returns {Promise}
	 */
	regenerate: async () => {
		await internalIpRanges.generateConfig(internalIpRanges.last_ip_ranges);
		await internalNginx.reload();
	},
};

export default internalIpRanges;
