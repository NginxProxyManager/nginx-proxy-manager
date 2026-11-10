import { express as logger } from "../../logger.js";
import auditLogModel from "../../models/audit-log.js";
import Access from "../access.js";
import { authorizeMutation } from "../api-token-mutations.js";
import { operationFor, redactErrorResponse, redactResponse, tokenPrefix } from "../api-token-policy.js";
import errs from "../error.js";
import { errorDiagnostics } from "../error-diagnostics.js";

export default async (req, res, next) => {
	if (typeof res.locals.token !== "string" || !res.locals.token.startsWith(tokenPrefix)) return next();
	// Install before authentication, so failures never expose diagnostic objects.
	const json = res.json.bind(res);
	res.json = (body) => json(res.statusCode >= 400 ? redactErrorResponse(res.statusCode) : redactResponse(body));
	try {
		const access = new Access(res.locals.token);
		await access.load();
		res.locals.access = access;
		const operation = operationFor(req.method, req.path.replace(/\/$/, ""));
		if (!operation || (req.query.expand !== undefined && req.query.expand !== "")) throw new errs.PermissionError();
		const action =
			operation.mode === "read"
				? operation.id
					? "get"
					: "list"
				: req.method === "DELETE"
					? "delete"
					: operation.id
						? "update"
						: "create";
		await access.can(`${operation.resource}:${action}`, operation.id || undefined);
		if (operation.mode === "write") await authorizeMutation(access, { ...operation, method: req.method }, req.body);
		let responseId = operation.id;
		res.json = (body) => {
			responseId = responseId || body?.id;
			return json(res.statusCode >= 400 ? redactErrorResponse(res.statusCode) : redactResponse(body));
		};
		res.on("finish", () => {
			if (operation.mode !== "write" || res.statusCode >= 400) return;
			void auditLogModel
				.query()
				.insert({
					user_id: access.token.getUserId(),
					action: "api-token-used",
					object_type: operation.resource,
					object_id: responseId || 0,
					meta: { api_token_id: access.getApiTokenId(), method: req.method },
				})
				.catch((err) => {
					// Resource audit remains authoritative, but secondary audit failures
					// should still be diagnosable without leaking database parameters.
					logger.warn("API token usage audit failed", errorDiagnostics(err));
				});
		});
		next();
	} catch (err) {
		next(err);
	}
};
