import fs from "node:fs";
import https from "node:https";
import crypto from "node:crypto";
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
const EO_AUTO_CONFIRM_ENABLED = process.env.EO_AUTO_CONFIRM_ENABLED === "true";
// Mainland China: teo.tencentcloudapi.com
// International: teo.intl.tencentcloudapi.com
const EO_API_BASE = process.env.EO_API_BASE || "teo.tencentcloudapi.com";
const EO_API_SECRET_ID = process.env.EO_API_SECRET_ID || "";
const EO_API_SECRET_KEY = process.env.EO_API_SECRET_KEY || "";
const EO_ZONE_IDS = process.env.EO_ZONE_IDS ? process.env.EO_ZONE_IDS.split(",") : [];
// Default: 3 days (1000 * 60 * 60 * 72)
const EO_IP_RANGES_FETCH_INTERVAL = Number.parseInt(process.env.EO_IP_RANGES_FETCH_INTERVAL || "", 10) || 259200000;
const EO_IP_RANGES_DEBUG = process.env.EO_IP_RANGES_DEBUG === "true";
const OUTPUT_FILE = "/etc/nginx/conf.d/include/ip_ranges_eo.conf";

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
	 * Makes a signed request to Tencent Cloud API v3
	 * Returns a Promise that resolves with the response body string
	 */
	eoApiCall: (my_action, my_payload) => {
		return new Promise((resolve, reject) => {
			// Tencent Cloud API Signature v3 Logic
			// Ref: https://cloud.tencent.com/document/product/213/30654

			function sha256(message, secret, encoding) {
				const hmac = crypto.createHmac("sha256", secret || "");
				return hmac.update(message).digest(encoding);
			}
			function getHash(message, encoding = "hex") {
				const hash = crypto.createHash("sha256");
				return hash.update(message).digest(encoding);
			}
			function getDate(timestamp) {
				const date = new Date(timestamp * 1000);
				const year = date.getUTCFullYear();
				const month = (`0${date.getUTCMonth() + 1}`).slice(-2);
				const day = (`0${date.getUTCDate()}`).slice(-2);
				return `${year}-${month}-${day}`;
			}

			const SECRET_ID = EO_API_SECRET_ID;
			const SECRET_KEY = EO_API_SECRET_KEY;
			
			if (!SECRET_ID || !SECRET_KEY) {
				reject(new Error("Missing EO_API_SECRET_ID or EO_API_SECRET_KEY"));
				return;
			}

			const host = EO_API_BASE;
			const service = "teo";
			const action = my_action;
			const version = "2022-09-01";
			const timestamp = Number.parseInt(String(Date.now() / 1000), 10);
			const date = getDate(timestamp);
			const payload = my_payload;

			// 1. Canonical Request
			const signedHeaders = "content-type;host";
			const hashedRequestPayload = getHash(payload);
			const httpRequestMethod = "POST";
			const canonicalUri = "/";
			const canonicalQueryString = "";
			const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;

			const canonicalRequest =
				httpRequestMethod + "\n" +
				canonicalUri + "\n" +
				canonicalQueryString + "\n" +
				canonicalHeaders + "\n" +
				signedHeaders + "\n" +
				hashedRequestPayload;

			// 2. String to Sign
			const algorithm = "TC3-HMAC-SHA256";
			const hashedCanonicalRequest = getHash(canonicalRequest);
			const credentialScope = `${date}/${service}/tc3_request`;
			const stringToSign =
				algorithm + "\n" +
				timestamp + "\n" +
				credentialScope + "\n" +
				hashedCanonicalRequest;

			// 3. Calculate Signature
			const kDate = sha256(date, `TC3${SECRET_KEY}`);
			const kService = sha256(service, kDate);
			const kSigning = sha256("tc3_request", kService);
			const signature = sha256(stringToSign, kSigning, "hex");

			// 4. Authorization Header
			const authorization =
				algorithm + " " +
				"Credential=" + SECRET_ID + "/" + credentialScope + ", " +
				"SignedHeaders=" + signedHeaders + ", " +
				"Signature=" + signature;

			const headers = {
				Authorization: authorization,
				"Content-Type": "application/json; charset=utf-8",
				Host: host,
				"X-TC-Action": action,
				"X-TC-Timestamp": timestamp,
				"X-TC-Version": version,
			};

			// Use ProxyAgent to support HTTP proxies if configured in env
			const agent = new ProxyAgent();
			const options = {
				hostname: host,
				method: httpRequestMethod,
				headers,
				agent,
			};

			const req = https.request(options, (res) => {
				let data = "";
				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					if (EO_IP_RANGES_DEBUG) {
						logger.debug(`eoApiCall(${action}, ${payload}) response: ${data}`);
					}
					resolve(data);
				});
			});

			req.on("error", (error) => {
				logger.error(`eoApiCall(${action}, ${payload}) error: ${error}`);
				reject(error);
			});

			req.write(payload);
			req.end();
		});
	},

	eoDescribeOriginACL: (zoneId) => {
		return internalIpRangesEo.eoApiCall("DescribeOriginACL", JSON.stringify({ ZoneId: zoneId }));
	},

	eoConfirmOriginACLUpdate: (zoneId) => {
		return internalIpRangesEo.eoApiCall("ConfirmOriginACLUpdate", JSON.stringify({ ZoneId: zoneId }));
	},

	/**
	 * Main fetch method for EdgeOne.
	 * Fetches IP ranges from EdgeOne API for each Zone ID, merges them, and writes to config.
	 */
	fetch: async () => {
		if (internalIpRangesEo.interval_processing || !EO_IP_RANGES_FETCH_ENABLED) {
			return;
		}
		
		// If no zone IDs configured, nothing to do
		if (EO_ZONE_IDS.length === 0) {
			return;
		}

		internalIpRangesEo.interval_processing = true;
		logger.info(`Fetching EdgeOne IP Ranges from API: ${EO_API_BASE}`);

		try {
			const ip_ranges_4 = [];
			const ip_ranges_6 = [];

			for (const zoneId of EO_ZONE_IDS) {
				if (!zoneId.trim()) continue;
				
				try {
					logger.info(`zone ID: ${zoneId}, Fetching new config`);
					const response = await internalIpRangesEo.eoDescribeOriginACL(zoneId.trim());
					const jsonResponse = JSON.parse(response);

					// Check for API errors
					if (jsonResponse.Response?.Error) {
						throw new Error(`API Error: ${jsonResponse.Response.Error.Message}`);
					}
					
					const aclInfo = jsonResponse?.Response?.OriginACLInfo;

					if (aclInfo?.CurrentOriginACL?.EntireAddresses) {
						const addresses = aclInfo.CurrentOriginACL.EntireAddresses;
						if (Array.isArray(addresses.IPv4)) {
							ip_ranges_4.push(...addresses.IPv4);
						}
						if (Array.isArray(addresses.IPv6)) {
							ip_ranges_6.push(...addresses.IPv6);
						}
					}

					// If NextOriginACL returns not null, it indicates new origin IP ranges are available for update.
					if (Object.is(aclInfo.NextOriginACL, null)) continue;
					logger.info(`zone ID: ${zoneId}, ACL update pending`);
					
					// Auto confirm if there is a pending update
					if (!EO_AUTO_CONFIRM_ENABLED) continue;
					logger.info(`zone ID: ${zoneId}, Auto-confirming ACL update`);
					await internalIpRangesEo.eoConfirmOriginACLUpdate(zoneId.trim());

				} catch (zoneErr) {
					logger.error(`zone ID: ${zoneId}, Failed to fetch/process: ${zoneErr.message}`);
				}
			}

			const ip_ranges = [...ip_ranges_4, ...ip_ranges_6];
			
			// De-duplicate ranges
			const unique_ip_ranges = [...new Set(ip_ranges)];

			if (unique_ip_ranges.length > 0) {
				// Generate config
				await internalIpRangesEo.generateConfig(unique_ip_ranges);

				// Reload nginx
				if (internalIpRangesEo.iteration_count > 0) {
					await internalNginx.reload();
				}
				internalIpRangesEo.iteration_count++;
			} else {
				logger.warn("EdgeOne IP fetch resulted in 0 IPs, skipping config update.");
			}

		} catch (err) {
			logger.fatal(`EdgeOne IP range fetch failed: ${err.message}`);
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
			
			// Note: Ensure this template file exists or reuse the generic ip_ranges.conf if structure is identical
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
					fs.writeFileSync(OUTPUT_FILE, config_text, { encoding: "utf8" });
					resolve(true);
				})
				.catch((err) => {
					logger.warn(`Could not write ${OUTPUT_FILE}: ${err.message}`);
					reject(new errs.ConfigurationError(err.message));
				});
		});
	},
};

export default internalIpRangesEo;
