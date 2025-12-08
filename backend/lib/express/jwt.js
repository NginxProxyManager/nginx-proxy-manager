export default function () {
	return (req, res, next) => {
		if (req.cookies?.token) {
			res.locals.token = req.cookies.token;
		}
		next();
	};
}
