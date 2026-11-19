import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { errorDiagnostics } from "./error-diagnostics.js";

const requests = new AsyncLocalStorage();
const methods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

// Establish the logging/redaction boundary before parsers, not after auth.
// This is deliberately independent of whether the credential proves valid.
export const sensitiveRequestContext = (req, res, next) => {
	const management = /^\/api-tokens(?:\/|$)/.test(req.path);
	if (!management && !/^Bearer npm_pat_/.test(req.headers.authorization || "")) return next();
	res.locals.sensitiveRequest = true;
	const resource =
		/^\/nginx\/(proxy-hosts|redirection-hosts|dead-hosts|streams|certificates|access-lists)(?:\/|$)/.exec(req.path);
	const context = {
		request_id: randomUUID(),
		method: methods.has(req.method) ? req.method : "OTHER",
		route: management ? "api-tokens" : resource?.[1] || "other",
	};
	res.set("X-Request-ID", context.request_id);
	res.locals.requestLogContext = context;
	requests.run(context, next);
};

// Multipart parsers may resume middleware from events created outside our
// async context. Restore the same boundary for routes and parser-error handlers.
export const resumeRequestContext = (_req, res, next) => {
	if (res.locals.requestLogContext) return requests.run(res.locals.requestLogContext, next);
	return next();
};

// Runs at the shared logger sink, covering legacy routes and their async work.
// No raw strings/objects from a sensitive request reach console or file sinks.
export const requestLogArgs = (args) => {
	const context = requests.getStore();
	if (!context) return args;
	const err = args.find((arg) => arg && typeof arg === "object" && (arg.name || arg.error || arg.code || arg.type));
	return ["Sensitive request", { ...context, ...(err ? errorDiagnostics(err) : {}) }];
};
