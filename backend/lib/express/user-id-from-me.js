import errs from "../error.js";

export default (req, res, next) => {
	if (req.params.user_id === "me" && res.locals.access) {
		req.params.user_id = res.locals.access.token.get("attrs")?.id;
		if (req.params.user_id === undefined) {
			return next(new errs.PermissionError("Permission Denied"));
		}
	} else {
		req.params.user_id = Number.parseInt(req.params.user_id, 10);
	}
	next();
};
