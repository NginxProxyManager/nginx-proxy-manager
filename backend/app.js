import bodyParser from "body-parser";
import compression from "compression";
import express from "express";
import fileUpload from "express-fileupload";
import { isDebugMode } from "./lib/config.js";
import cors from "./lib/express/cors.js";
import jwt from "./lib/express/jwt.js";
import { debug, express as logger } from "./logger.js";
import mainRoutes from "./routes/main.js";
import nginxDeploymentCoordinator from "./internal/nginx-deployment-coordinator.js";

/**
 * App
 */
const app = express();
app.use(fileUpload());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Gzip
app.use(compression());

/**
 * General Logging, BEFORE routes
 */

app.disable("x-powered-by");
app.enable("trust proxy", ["loopback", "linklocal", "uniquelocal"]);
app.enable("strict routing");

// pretty print JSON when not live
if (isDebugMode()) {
	app.set("json spaces", 2);
}

// CORS for everything
app.use(cors);

// General security/cache related headers + server header
app.use((_, res, next) => {
	let x_frame_options = "DENY";

	if (typeof process.env.X_FRAME_OPTIONS !== "undefined" && process.env.X_FRAME_OPTIONS) {
		x_frame_options = process.env.X_FRAME_OPTIONS;
	}

	res.set({
		"X-XSS-Protection": "1; mode=block",
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": x_frame_options,
		"Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
		Pragma: "no-cache",
		Expires: 0,
	});
	next();
});

app.use(jwt());

// Reconcile any interrupted atomic deployment before API routes can trigger a
// new configuration change. Recovery only touches journals left by the
// coordinator; an empty deployment directory is a no-op.
try {
	const recoveredDeployments = await nginxDeploymentCoordinator.recover();
	if (recoveredDeployments.length) logger.warn(`Recovered ${recoveredDeployments.length} interrupted nginx deployment(s)`);
} catch (error) {
	logger.error(`Unable to recover nginx deployments: ${error.message}`);
	throw error;
}

app.use("/", mainRoutes);

// production error handler
// no stacktraces leaked to user
const errorHandler = (err, req, res, _) => {
	const payload = {
		error: {
			code: err.status || 500,
			message: err.public ? err.message : "Internal Error",
		},
	};

	if (typeof err.error_code !== "undefined") {
		payload.error.error_code = err.error_code;
	}

	if (typeof err.details !== "undefined") {
		payload.error.details = err.details;
	}

	if (typeof err.message_i18n !== "undefined") {
		payload.error.message_i18n = err.message_i18n;
	}

	if (isDebugMode() || (req.baseUrl + req.path).includes("nginx/certificates")) {
		payload.debug = {
			stack: typeof err.stack !== "undefined" && err.stack ? err.stack.split("\n") : null,
			previous: err.previous,
		};
	}

	// Not every error is worth logging - but this is good for now until it gets annoying.
	if (typeof err.stack !== "undefined" && err.stack) {
		debug(logger, err.stack);
		if (typeof err.public === "undefined" || !err.public) {
			logger.warn(err.message);
		}
	}

	res.status(err.status || 500).send(payload);
};

app.use(errorHandler);

export { errorHandler };
export default app;
