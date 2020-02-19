module.exports = function () {
	return function (req, res, next) {
		if (req.headers.authorization) {
			let parts = req.headers.authorization.split(' ');

			if (parts && parts[0] === 'Bearer' && parts[1]) {
				res.locals.token = parts[1];
			}
		}

		next();
	};
};
