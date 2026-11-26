import Access from "../access.js";

export default () => {
	return async (_, res, next) => {
		try {
			if (res.locals.access?.credentialKind === "api_token") return next();
			res.locals.access = null;
			const access = new Access(res.locals.token || null);
			await access.load();
			res.locals.access = access;
			next();
		} catch (err) {
			next(err);
		}
	};
};
