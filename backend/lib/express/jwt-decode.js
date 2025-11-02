const Access = require("../access");

module.exports = () => {
	return function (req, res, next) {
		res.locals.access = null;
		let access = new Access(res.locals.token || null);

		// Allow unauthenticated access to get the oidc configuration
		let oidc_access = req.url === "/oidc-config" && req.method === "GET" && !access.token.getUserId();

		access
			.load(oidc_access)
			.then(() => {
				res.locals.access = access;
				next();
			})
			.catch(next);
	};
};
