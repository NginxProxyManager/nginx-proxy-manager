import Access from "../access.js";

export default () => {
	return async (req, res, next) => {
		const token = req.cookies?.token || null;

		//if (!token) {
		//	return res.status(401).json({
		//		error: {
		//			message: "Missing token",
		//		},
		//	});
		//}

		try {
			res.locals.access = null;
			const access = new Access(token);
			await access.load();
			res.locals.access = access;
			next();
		} catch {
			res.clearCookie("token", { path: "/api" });
			return res.status(403).json({
				error: {
					message: "Invalid or expired token",
				},
			});
		}
	};
};
