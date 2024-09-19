const Access = require('../access');

module.exports = () => {
	return function (req, res, next) {
		res.locals.access = null;
		let access        = new Access(res.locals.token || null);
		// allow unauthenticated access to OIDC configuration
		let anon_access = req.url === '/oidc-config' && !access.token.getUserId();
		access.load(anon_access)
			.then(() => {
				res.locals.access = access;
				next();
			})
			.catch(next);
	};
};

