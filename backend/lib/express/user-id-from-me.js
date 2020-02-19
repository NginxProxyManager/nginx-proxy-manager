module.exports = (req, res, next) => {
	if (req.params.user_id === 'me' && res.locals.access) {
		req.params.user_id = res.locals.access.token.get('attrs').id;
	} else {
		req.params.user_id = parseInt(req.params.user_id, 10);
	}

	next();
};
