import fs from "node:fs";
import https from "node:https";		
import crypto from "node:crypto";	// EO specific
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
const EO_API_BASE = process.env.EO_API_BASE || "teo.tencentcloudapi.com";
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

    eoApiCall: (my_action, my_payload) => {
        let result = "";

        // I scraped these code from tencent cloud China mainland devision
        // https://cloud.tencent.com/document/product/1552/120408
        // sorry for the Chinese comments
        
        // 腾讯云API签名v3实现示例
        // 本代码基于腾讯云API签名v3文档实现: https://cloud.tencent.com/document/product/213/30654
        // 请严格按照文档说明使用，不建议随意修改签名相关代码


        function sha256(message, secret = "", encoding) {
            const hmac = crypto.createHmac("sha256", secret)
            return hmac.update(message).digest(encoding)
        }
        function getHash(message, encoding = "hex") {
            const hash = crypto.createHash("sha256")
            return hash.update(message).digest(encoding)
        }
        function getDate(timestamp) {
            const date = new Date(timestamp * 1000)
            const year = date.getUTCFullYear()
            const month = ("0" + (date.getUTCMonth() + 1)).slice(-2)
            const day = ("0" + date.getUTCDate()).slice(-2)
            return `${year}-${month}-${day}`
        }

        // 密钥信息从环境变量读取，需要提前在环境变量中设置 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY
        // 使用环境变量方式可以避免密钥硬编码在代码中，提高安全性
        // 生产环境建议使用更安全的密钥管理方案，如密钥管理系统(KMS)、容器密钥注入等
        // 请参见：https://cloud.tencent.com/document/product/1278/85305
        // 密钥可前往官网控制台 https://console.cloud.tencent.com/cam/capi 进行获取
        const SECRET_ID = EO_API_SECRET_ID
        const SECRET_KEY = EO_API_SECRET_KEY
        const TOKEN = ""

        const host = EO_API_BASE
        const service = "teo"
        const region = ""
        const action = my_action
        const version = "2022-09-01"
        const timestamp = parseInt(String(new Date().getTime() / 1000))
        const date = getDate(timestamp)
        const payload = my_payload

        // ************* 步骤 1：拼接规范请求串 *************
        const signedHeaders = "content-type;host"
        const hashedRequestPayload = getHash(payload)
        const httpRequestMethod = "POST"
        const canonicalUri = "/"
        const canonicalQueryString = ""
        const canonicalHeaders =
            "content-type:application/json; charset=utf-8\n" + "host:" + host + "\n"

        const canonicalRequest =
            httpRequestMethod +
            "\n" +
            canonicalUri +
            "\n" +
            canonicalQueryString +
            "\n" +
            canonicalHeaders +
            "\n" +
            signedHeaders +
            "\n" +
            hashedRequestPayload

        // ************* 步骤 2：拼接待签名字符串 *************
        const algorithm = "TC3-HMAC-SHA256"
        const hashedCanonicalRequest = getHash(canonicalRequest)
        const credentialScope = date + "/" + service + "/" + "tc3_request"
        const stringToSign =
            algorithm +
            "\n" +
            timestamp +
            "\n" +
            credentialScope +
            "\n" +
            hashedCanonicalRequest

        // ************* 步骤 3：计算签名 *************
        const kDate = sha256(date, "TC3" + SECRET_KEY)
        const kService = sha256(service, kDate)
        const kSigning = sha256("tc3_request", kService)
        const signature = sha256(stringToSign, kSigning, "hex")

        // ************* 步骤 4：拼接 Authorization *************
        const authorization =
            algorithm +
            " " +
            "Credential=" +
            SECRET_ID +
            "/" +
            credentialScope +
            ", " +
            "SignedHeaders=" +
            signedHeaders +
            ", " +
            "Signature=" +
            signature

        // ************* 步骤 5：构造并发起请求 *************
        const headers = {
            Authorization: authorization,
            "Content-Type": "application/json; charset=utf-8",
            Host: host,
            "X-TC-Action": action,
            "X-TC-Timestamp": timestamp,
            "X-TC-Version": version,
        }

        if (region) {
            headers["X-TC-Region"] = region
        }
        if (TOKEN) {
            headers["X-TC-Token"] = TOKEN
        }

        const options = {
            hostname: host,
            method: httpRequestMethod,
            headers,
        }

        const req = https.request(options, (res) => {
            let data = ""
            res.on("data", (chunk) => {
                data += chunk
            })

            res.on("end", () => {
                result = data
                // console.log(data)
                if (EO_IP_RANGES_DEBUG) {
                    logger.info(
                        `eoApiCall(${action},${payload}) response: ${data}`
                    );
                }
            })
        })

        req.on("error", (error) => {
            // console.error(error)
            logger.error(`eoApiCall(${action},${payload}) error: ${error}`);
        })

        req.write(payload)

        req.end()

        // in most cases, result should be a json string
        return result;
    },

    eoDescribeOriginACL: (zoneId) => {
        return internalIpRangesEo.eoApiCall("DescribeOriginACL", `{"ZoneId":"${zoneId}"}`)
    },

    eoConfirmOriginACLUpdate: (zoneId) => {
        return internalIpRangesEo.eoApiCall("ConfirmOriginACLUpdate", `{"ZoneId":"${zoneId}"}`)
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

            let ip_ranges_4 = [];
            let ip_ranges_6 = [];

            // a for loop to call eoDescribeOriginACL for each zone id
            for (const zoneId of EO_ZONE_IDS) {
                const response = internalIpRangesEo.eoDescribeOriginACL(zoneId);
                // parse response and extract ip ranges
                const jsonResponse = JSON.parse(response);
                // the response should look like this:
                /*
                    {
                        "Response": {
                            "RequestId": "23f58161-c888-4a46-9446-e9984c48dee5",
                            "OriginACLInfo": {
                                "CurrentOriginACL": {
                                    "ActiveTime": "2025-10-30T00:00:00+08:00",
                                    "EntireAddresses": {
                                        "IPv4": Array[196], // list of ipv4 ranges
                                        "IPv6": Array[90]   // list of ipv6 ranges
                                    },
                                    "IsPlaned": "true",
                                    "Version": "gaz-0.0.3-20251016"
                                },
                                "L4ProxyIds": [

                                ],
                                "L7Hosts": [
                                    "example.com",
                                    "www.example.com"
                                ],
                                "NextOriginACL": null,  // if not null, means pending update, need to confirm
                                "Status": "online"
                            }
                        }
                    }
                */

                ip_ranges_4.concat(jsonResponse.Response.OriginACLInfo.CurrentOriginACL.EntireAddresses.IPv4);
                ip_ranges_6.concat(jsonResponse.Response.OriginACLInfo.CurrentOriginACL.EntireAddresses.IPv6);

                // if EO_AUTO_CONFIRM_ENABLED is true, and NextOriginACL is not null, call eoConfirmOriginACLUpdate
                if (EO_AUTO_CONFIRM_ENABLED && jsonResponse.Response.OriginACLInfo.NextOriginACL) {
                    internalIpRangesEo.eoConfirmOriginACLUpdate(zoneId);
                    logger.info(`Auto-confirmed Origin ACL update for Zone ID: ${zoneId}`);
                }
            }
            const ip_ranges = ip_ranges_4.concat(ip_ranges_6);

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
