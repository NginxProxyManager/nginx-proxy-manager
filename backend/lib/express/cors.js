module.exports = function (req, res, next) {
	if (req.headers.origin) {
		res.set({
			'Access-Control-Allow-Origin':      req.headers.origin,
			'Access-Control-Allow-Credentials': true,
			'Access-Control-Allow-Methods':     'OPTIONS, GET, POST',
			'Access-Control-Allow-Headers':     'Content-Type, Cache-Control, Pragma, Expires, Authorization, X-Dataset-Total, X-Dataset-Offset, X-Dataset-Limit',
			'Access-Control-Max-Age':           5 * 60,
			'Access-Control-Expose-Headers':    'X-Dataset-Total, X-Dataset-Offset, X-Dataset-Limit'
		});
		next();
	} else {
		// No origin
		next();
	}
};
