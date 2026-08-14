import express from "express";
import internalProxyHost from "../../internal/proxy-host.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import { registerHostLogRoutes } from "./logs.js";
import proxyHostMonitoringRoutes from "./proxy_host_monitoring.js";
import apiValidator from "../../lib/validator/api.js";
import validator from "../../lib/validator/index.js";
import { debug, express as logger } from "../../logger.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/proxy-hosts
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/proxy-hosts
	 *
	 * Retrieve all proxy-hosts
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						expand: {
							$ref: "common#/properties/expand",
						},
						query: {
							$ref: "common#/properties/query",
						},
					},
				},
				{
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
					query: typeof req.query.query === "string" ? req.query.query : null,
				},
			);
			const rows = await internalProxyHost.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/nginx/proxy-hosts
	 *
	 * Create a new proxy-host
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/proxy-hosts", "post"), req.body);
			const result = await internalProxyHost.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err} ${JSON.stringify(err.debug, null, 2)}`);
			next(err);
		}
	});

/**
 * Preview a Proxy Host candidate. This route is static so it must be declared
 * before /:host_id and never writes the active nginx directory.
 */
router.options("/nginx-config/preview", (_, res) => res.sendStatus(204));
router.post("/nginx-config/preview", jwtdecode(), async (req, res, next) => {
	try {
		const payload = await apiValidator(
			getValidationSchema("/nginx/proxy-hosts/nginx-config/preview", "post"),
			req.body,
		);
		const result = await internalProxyHost.previewNginxConfig(res.locals.access, payload);
		res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).status(200).send(result);
	} catch (err) {
		debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
		next(err);
	}
});

/**
 * Read deployed/failed artifacts after normal object visibility enforcement.
 */
router
	.route("/:host_id/nginx-config")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const hostId = Number.parseInt(req.params.host_id, 10);
			if (!Number.isInteger(hostId)) throw new Error("Invalid Proxy Host id");
			const includeContent =
				typeof req.query.include_content === "string" ? req.query.include_content.split(",") : [];
			const result = await internalProxyHost.getNginxArtifacts(res.locals.access, hostId, includeContent);
			res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific proxy-host
 *
 * /api/nginx/proxy-hosts/123
 */
/**
 * Read and follow this host's fixed Nginx access/error log files. These static
 * routes must stay before the generic /:host_id resource route.
 */
registerHostLogRoutes(router, { scope: "proxy_host", idParam: "host_id", internalHost: internalProxyHost });
router.use("/", proxyHostMonitoringRoutes);

router
	.route("/:host_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/proxy-hosts/123
	 *
	 * Retrieve a specific proxy-host
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["host_id"],
					additionalProperties: false,
					properties: {
						host_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					host_id: req.params.host_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await internalProxyHost.get(res.locals.access, {
				id: Number.parseInt(data.host_id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/nginx/proxy-hosts/123
	 *
	 * Update and existing proxy-host
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/proxy-hosts/{hostID}", "put"), req.body);
			payload.id = Number.parseInt(req.params.host_id, 10);
			const result = await internalProxyHost.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/nginx/proxy-hosts/123
	 *
	 * Update and existing proxy-host
	 */
	.delete(async (req, res, next) => {
		try {
			const result = await internalProxyHost.delete(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Enable proxy-host
 *
 * /api/nginx/proxy-hosts/123/enable
 */
router
	.route("/:host_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/proxy-hosts/123/enable
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalProxyHost.enable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Disable proxy-host
 *
 * /api/nginx/proxy-hosts/123/disable
 */
router
	.route("/:host_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/proxy-hosts/123/disable
	 */
	.post(async (req, res, next) => {
		try {
			const result = await internalProxyHost.disable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
