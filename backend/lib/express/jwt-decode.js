import Access from "../access.js";

export default () => {
	return async (req, res, next) => {
		try {
			res.locals.access = null;
			const access = new Access(res.locals.token || null);
			// Allow unauthenticated access to get the oidc configuration
			const oidc_access = req.url === "/oidc-config" && req.method === "GET" && !access.token.getUserId();
			await access.load(oidc_access);
			res.locals.access = access;
			next();
		} catch (err) {
			next(err);
		}
	};
};
