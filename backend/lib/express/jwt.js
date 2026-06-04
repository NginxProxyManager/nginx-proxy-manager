export default function () {
	return (req, res, next) => {
		if (req.headers.authorization) {
			const parts = req.headers.authorization.split(" ");

			if (parts && parts[0] === "Bearer" && parts[1]) {
				if (parts[1].startsWith("npmak_")) {
					res.locals.apiKey = parts[1];
				} else {
					res.locals.token = parts[1];
				}
			}
		}

		next();
	};
}
