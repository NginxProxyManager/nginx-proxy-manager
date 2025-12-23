import Access from "../access.js";

export default () => {
	return async (req, res, next) => {
		try {
			res.locals.access = null;
			const access = new Access(req.cookies?.token || null);
			await access.load();
			res.locals.access = access;
			next();
		} catch {
			return res.status(401).json({
				error: {
					message: "Invalid or expired token",
				},
			});
		}
	};
};
