const Access = require('../access');

module.exports = () => {
	return function (req, res, next) {
		res.locals.access = null;
		let access        = new Access(res.locals.token || null);
		access.load()
			.then(() => {
				res.locals.access = access;
				next();
			})
			.catch(next);
	};
};

