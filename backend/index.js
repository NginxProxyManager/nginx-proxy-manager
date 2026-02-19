#!/usr/bin/env node

import app from "./app.js";
import internalCertificate from "./internal/certificate.js";
import internalIpRanges from "./internal/ip_ranges.js";
import internalIpRangesEO from "./internal/ip_ranges_eo.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

const IP_RANGES_FETCH_ENABLED = process.env.IP_RANGES_FETCH_ENABLED !== "false";
const EO_IP_RANGES_FETCH_ENABLED = process.env.EO_IP_RANGES_FETCH_ENABLED === "true";

// Timer env: 
// 'true' = always, 'false' = never, 
// anything else (including unset/'auto') = enable on successful fetch
const IP_RANGES_TIMER_ENABLED = process.env.IP_RANGES_TIMER_ENABLED;
const EO_IP_RANGES_TIMER_ENABLED = process.env.EO_IP_RANGES_TIMER_ENABLED;

async function appStart() {
	try {
		await migrateUp();
		await setup();
		await getCompiledSchema();

		// IP Ranges - Cloudflare and Cloudfront
		if (IP_RANGES_FETCH_ENABLED) {
			let ipRangesFetchSucceeded = false;
			try {
				await internalIpRanges.fetch();
				ipRangesFetchSucceeded = true;
				logger.info("IP Ranges initial fetch succeeded.");
			} catch (err) {
				logger.error("IP Ranges initial fetch failed: " + err.message);
			}

			if (
				IP_RANGES_TIMER_ENABLED === 'true' ||
				(IP_RANGES_TIMER_ENABLED !== 'false' && ipRangesFetchSucceeded)
			) {
				internalIpRanges.initTimer();
				logger.info("IP Ranges timer enabled.");
			} else {
				logger.info("IP Ranges timer not enabled.");
			}
		} else {
			logger.info("IP Ranges fetch is disabled by environment variable");
		}

		// EO IP Ranges - EdgeOne
		if (EO_IP_RANGES_FETCH_ENABLED) {
			let eoIpRangesFetchSucceeded = false;
			try {
				await internalIpRangesEO.fetch();
				eoIpRangesFetchSucceeded = true;
				logger.info("EO IP Ranges initial fetch succeeded.");
			} catch (err) {
				logger.error("EO IP Ranges initial fetch failed: " + err.message);
			}

			if (
				EO_IP_RANGES_TIMER_ENABLED === 'true' ||
				(EO_IP_RANGES_TIMER_ENABLED !== 'false' && eoIpRangesFetchSucceeded)
			) {
				internalIpRangesEO.initTimer();
				logger.info("EO IP Ranges timer enabled.");
			} else {
				logger.info("EO IP Ranges timer not enabled.");
			}
		} else {
			logger.info("EO IP Ranges fetch is disabled by environment variable");
		}

		internalCertificate.initTimer();

		const server = app.listen(3000, () => {
			logger.info(`Backend PID ${process.pid} listening on port 3000 ...`);

			process.on("SIGTERM", () => {
				logger.info(`PID ${process.pid} received SIGTERM`);
				server.close(() => {
					logger.info("Stopping.");
					process.exit(0);
				});
			});
		});
	} catch (err) {
		logger.error(`Startup Error: ${err.message}`, err);
		setTimeout(appStart, 1000);
	}
}

try {
	appStart();
} catch (err) {
	logger.fatal(err);
	process.exit(1);
}
