import express from "express";
import proxyHostMonitor from "../../internal/proxy-host-monitor.js";
import internalProxyHost from "../../internal/proxy-host.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import errs from "../../lib/error.js";
import { debug, express as logger } from "../../logger.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

const hostId = (value) => {
	const id = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(id) || id < 1) throw new errs.ValidationError("Invalid Proxy Host id");
	return id;
};

const ensureReadable = async (access, id) => internalProxyHost.get(access, { id });

router
	.route("/:host_id/monitoring")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const id = hostId(req.params.host_id);
			await ensureReadable(res.locals.access, id);
			const result = await proxyHostMonitor.snapshot(id, { from: req.query.from, to: req.query.to });
			res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).status(200).send(result);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	})
	.put(async (req, res, next) => {
		try {
			const id = hostId(req.params.host_id);
			await res.locals.access.can("proxy_hosts:update", id);
			await ensureReadable(res.locals.access, id);
			const config = await proxyHostMonitor.updateConfig(id, req.body);
			res.status(200).send(config);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	});

router
	.route("/:host_id/monitoring/timeseries")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const id = hostId(req.params.host_id);
			await ensureReadable(res.locals.access, id);
			const resolution = req.query.resolution === "hour" ? "hour" : "minute";
			const result = await proxyHostMonitor.timeseries(id, { from: req.query.from, to: req.query.to, resolution });
			res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).status(200).send(result);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	});

router
	.route("/:host_id/monitoring/probe")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const id = hostId(req.params.host_id);
			await res.locals.access.can("proxy_hosts:update", id);
			await ensureReadable(res.locals.access, id);
			const state = await proxyHostMonitor.probe(id);
			res.status(200).send(state);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	});

export default router;
