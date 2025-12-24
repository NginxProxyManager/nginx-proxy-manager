import cookieParser from "cookie-parser";
import express from "express";
import fileUpload from "express-fileupload";
import { debug, express as logger } from "./logger.js";
import mainRoutes from "./routes/main.js";

/**
 * App
 */
const app = express();
app.use(fileUpload());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * General Logging, BEFORE routes
 */

app.disable("x-powered-by");
app.enable("trust proxy", ["loopback", "linklocal", "uniquelocal"]);
app.enable("strict routing");

// pretty print JSON when not live
app.set("json spaces", 2);

app.use("/", mainRoutes);

// production error handler
// no stacktraces leaked to user
app.use((err, req, res, _) => {
	const payload = {
		error: {
			code: err.status,
			message: err.public ? err.message : "Internal Error",
		},
	};

	if (typeof err.message_i18n !== "undefined") {
		payload.error.message_i18n = err.message_i18n;
	}

	if ((req.baseUrl + req.path).includes("nginx/certificates")) {
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
});

export default app;
