import internalAgentClient from "../../internal/agent-client.js";
import { debug, express as logger } from "../../logger.js";

export default function () {
	return async (req, res, next) => {
		if (!internalAgentClient.shouldForward(req)) {
			next();
			return;
		}
		try {
			await res.locals.access.can("users:list");
			await internalAgentClient.forward(req, res);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.originalUrl}: ${err}`);
			next(err);
		}
	};
}
