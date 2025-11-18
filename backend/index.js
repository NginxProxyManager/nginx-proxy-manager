#!/usr/bin/env node

import app from "./app.js";
import internalNginx from "./internal/nginx.js";
import internalCertificate from "./internal/certificate.js";
import internalIpRanges from "./internal/ip_ranges.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

const IP_RANGES_FETCH_ENABLED = process.env.SKIP_IP_RANGES === "false";

async function appStart() {
	return migrateUp()
		.then(setup)
		.then(getCompiledSchema)
		.then(() => {
			if (!IP_RANGES_FETCH_ENABLED) {
				logger.info("IP Ranges fetch is disabled by environment variable");
				return;
			}
			logger.info("IP Ranges fetch is enabled");
			internalIpRanges.initTimer();
			return internalIpRanges.fetch().catch((err) => {
				logger.error("IP Ranges fetch failed, continuing anyway:", err.message);
			});
		})
		.then(() => {
			internalCertificate.initTimer();
			internalNginx.reload();

			const server = app.listen("/run/npmplus.sock", () => {
				logger.info(`Backend PID ${process.pid} listening on unix socket...`);

				process.on("SIGTERM", () => {
					logger.info(`PID ${process.pid} received SIGTERM`);
					server.close(() => {
						logger.info("Stopping.");
						process.exit(0);
					});
				});
			});
		})
		.catch((err) => {
			logger.error(`Startup Error: ${err.message}`, err);
			setTimeout(appStart, 1000);
		});
}

try {
	appStart();
} catch (err) {
	logger.fatal(err);
	process.exit(1);
}
