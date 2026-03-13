export default function () {
	return (req, res, next) => {
		if (req.headers.authorization) {
			const parts = req.headers.authorization.split(" ");

			if (parts && parts[0] === "Bearer" && parts[1]) {
				res.locals.token = parts[1];
			}
		}

		next();
	};
}
