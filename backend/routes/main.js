import express from "express";
import { isCI } from "../lib/config.js";
import errs from "../lib/error.js";
import logRequest from "../lib/express/log-request.js";
import pjson from "../package.json" with { type: "json" };
import { isSetup } from "../setup.js";
import auditLogRoutes from "./audit-log.js";
import ciRoutes from "./ci.js";
import accessListsRoutes from "./nginx/access_lists.js";
import certificatesHostsRoutes from "./nginx/certificates.js";
import deadHostsRoutes from "./nginx/dead_hosts.js";
import proxyHostsRoutes from "./nginx/proxy_hosts.js";
import redirectionHostsRoutes from "./nginx/redirection_hosts.js";
import streamsRoutes from "./nginx/streams.js";
import upstreamHostsRoutes from "./nginx/upstream_hosts.js";
import reportsRoutes from "./reports.js";
import schemaRoutes from "./schema.js";
import settingsRoutes from "./settings.js";
import tokensRoutes from "./tokens.js";
import usersRoutes from "./users.js";
import versionRoutes from "./version.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router.use(logRequest);

/**
 * Health Check
 * GET /api
 */
router.get("/", async (_, res /*, next*/) => {
	const version = pjson.version.split("-").shift().split(".");
	const setup = await isSetup();

	res.status(200).send({
		status: "OK",
		setup,
		version: {
			major: Number.parseInt(version.shift(), 10),
			minor: Number.parseInt(version.shift(), 10),
			revision: Number.parseInt(version.shift(), 10),
		},
	});
});

router.use("/schema", schemaRoutes);
router.use("/tokens", tokensRoutes);
router.use("/users", usersRoutes);
router.use("/audit-log", auditLogRoutes);
router.use("/reports", reportsRoutes);
router.use("/settings", settingsRoutes);
router.use("/version", versionRoutes);
router.use("/nginx/proxy-hosts", proxyHostsRoutes);
router.use("/nginx/redirection-hosts", redirectionHostsRoutes);
router.use("/nginx/dead-hosts", deadHostsRoutes);
router.use("/nginx/streams", streamsRoutes);
router.use("/nginx/access-lists", accessListsRoutes);
router.use("/nginx/upstream-hosts", upstreamHostsRoutes);
router.use("/nginx/certificates", certificatesHostsRoutes);

// Only include CI routes if we're in a CI environment
if (isCI()) {
	router.use("/ci", ciRoutes);
}

/**
 * API 404 for all other routes
 *
 * ALL /api/*
 */
router.all(/(.+)/, (req, _, next) => {
	req.params.page = req.params["0"];
	next(new errs.ItemNotFoundError(req.params.page));
});

export default router;
