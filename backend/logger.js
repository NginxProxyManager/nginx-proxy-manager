import signale from "signale";
import { isDebugMode } from "./lib/config.js";

const opts = {
	logLevel: "info",
};

const global = new signale.Signale({ scope: "Global   ", ...opts });
const migrate = new signale.Signale({ scope: "Migrate  ", ...opts });
const express = new signale.Signale({ scope: "Express  ", ...opts });
const access = new signale.Signale({ scope: "Access   ", ...opts });
const nginx = new signale.Signale({ scope: "Nginx    ", ...opts });
const ssl = new signale.Signale({ scope: "SSL      ", ...opts });
const certbot = new signale.Signale({ scope: "Certbot  ", ...opts });
const importer = new signale.Signale({ scope: "Importer ", ...opts });
const setup = new signale.Signale({ scope: "Setup    ", ...opts });
const ipRanges = new signale.Signale({ scope: "IP Ranges", ...opts });
const remoteVersion = new signale.Signale({ scope: "Remote Version", ...opts });

const debug = (logger, ...args) => {
	if (isDebugMode()) {
		logger.debug(...args);
	}
};

export { debug, global, migrate, express, access, nginx, ssl, certbot, importer, setup, ipRanges, remoteVersion };
