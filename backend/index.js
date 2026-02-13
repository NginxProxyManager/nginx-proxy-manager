#!/usr/bin/env node

import app from "./app.js";
import internalNginx from "./internal/nginx.js";
import internalCertificate from "./internal/certificate.js";
import internalIpRanges from "./internal/ip_ranges.js";
import { global as logger } from "./logger.js";
import { migrateUp } from "./migrate.js";
import { getCompiledSchema } from "./schema/index.js";
import setup from "./setup.js";

async function appStart() {
	return migrateUp()
		.then(setup)
		.then(getCompiledSchema)
		.then(() => {
			if (process.env.TRUST_CLOUDFLARE === "false") {
				logger.info("Cloudflares IPs are NOT trusted");
				return;
			}
			logger.info("Cloudflares IPs are trusted");
			internalIpRanges.initTimer();
			return internalIpRanges.fetch();
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
