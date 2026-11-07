import express from "express";
import internalApiToken from "../internal/api-token.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
router.use(jwtdecode());
router.get("/options", async (_req, res, next) => {
	try {
		res.send(await internalApiToken.options(res.locals.access));
	} catch (err) {
		next(err);
	}
});
router.get("/", async (_req, res, next) => {
	try {
		res.send(await internalApiToken.getAll(res.locals.access));
	} catch (err) {
		next(err);
	}
});
router.post("/", async (req, res, next) => {
	try {
		const data = await apiValidator(getValidationSchema("/api-tokens", "post"), req.body);
		if (!data.name.trim()) throw new errs.ValidationError("Name must not be blank");
		res.status(201).send(await internalApiToken.create(res.locals.access, data));
	} catch (err) {
		if (err.status === 429 && Number.isSafeInteger(err.retryAfter)) res.set("Retry-After", String(err.retryAfter));
		// Validation exceptions may retain the request body. Never send or log it.
		if (err.status === 400 || err.name === "ValidationError") {
			next(Object.assign(new Error("Invalid API token request"), { status: 400, public: true }));
		} else next(err);
	}
});
router.delete("/:id", async (req, res, next) => {
	try {
		if (!/^[1-9][0-9]*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id)))
			throw new errs.ItemNotFoundError();
		res.send(await internalApiToken.revoke(res.locals.access, Number(req.params.id)));
	} catch (err) {
		next(err);
	}
});
export default router;
