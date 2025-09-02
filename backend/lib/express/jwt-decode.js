import Access from "../access.js";

export default () => {
	return (_, res, next) => {
		res.locals.access = null;
		const access = new Access(res.locals.token || null);
		access
			.load()
			.then(() => {
				res.locals.access = access;
				next();
			})
			.catch(next);
	};
};
