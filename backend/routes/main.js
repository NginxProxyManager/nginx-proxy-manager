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

/**
 * Health Check
 * GET /api
 */
router.get("/", async (_, res /*, next*/) => {
	const version = pjson.version;
	const setup = await isSetup();

	res.status(200).send({
		status: "OK",
		setup,
		version,
	});
});

router.use("/schema", schemaRoutes);
router.use("/tokens", tokensRoutes);
if (
	process.env.OIDC_REDIRECT_DOMAIN &&
	process.env.OIDC_ISSUER_URL &&
	process.env.OIDC_CLIENT_ID &&
	process.env.OIDC_CLIENT_SECRET
) {
	router.use("/oidc", oidcRoutes);
}
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
router.use("/nginx/certificates", certificatesHostsRoutes);

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
