import express from "express";
import errs from "../lib/error.js";
import pjson from "../package.json" with { type: "json" };
import { isSetup } from "../setup.js";
import auditLogRoutes from "./audit-log.js";
import accessListsRoutes from "./nginx/access_lists.js";
import certificatesHostsRoutes from "./nginx/certificates.js";
import deadHostsRoutes from "./nginx/dead_hosts.js";
import proxyHostsRoutes from "./nginx/proxy_hosts.js";
import redirectionHostsRoutes from "./nginx/redirection_hosts.js";
import streamsRoutes from "./nginx/streams.js";
import reportsRoutes from "./reports.js";
import schemaRoutes from "./schema.js";
import settingsRoutes from "./settings.js";
import tokensRoutes from "./tokens.js";
import oidcRoutes from "./oidc.js";
import usersRoutes from "./users.js";
import versionRoutes from "./version.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const isOIDCenabled = !!(
	process.env.OIDC_REDIRECT_DOMAIN &&
	process.env.OIDC_ISSUER_URL &&
	process.env.OIDC_CLIENT_ID &&
	process.env.OIDC_CLIENT_SECRET
);

/**
 * Health Check
 * GET /api
 */
router.get(["/api", "/api/"], async (_, res /*, next*/) => {
	res.status(200).send({
		status: "OK",
		setup: await isSetup(),
		version: pjson.version,
		password: process.env.OIDC_DISABLE_PASSWORD === "false",
		oidc: isOIDCenabled,
	});
});

router.use("/api/schema", schemaRoutes);
router.use("/api/tokens", tokensRoutes);
if (isOIDCenabled) router.use("/api/oidc", oidcRoutes);
router.use("/api/users", usersRoutes);
router.use("/api/audit-log", auditLogRoutes);
router.use("/api/reports", reportsRoutes);
router.use("/api/settings", settingsRoutes);
router.use("/api/version", versionRoutes);
router.use("/api/nginx/proxy-hosts", proxyHostsRoutes);
router.use("/api/nginx/redirection-hosts", redirectionHostsRoutes);
router.use("/api/nginx/dead-hosts", deadHostsRoutes);
router.use("/api/nginx/streams", streamsRoutes);
router.use("/api/nginx/access-lists", accessListsRoutes);
router.use("/api/nginx/certificates", certificatesHostsRoutes);

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
