const express     = require('express');
const swaggerJSON = require('../../doc/api.swagger.json');
const PACKAGE     = require('../../package.json');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /schema
	 */
	.get((req, res/*, next*/) => {
		let proto = req.protocol;
		if (typeof req.headers['x-forwarded-proto'] !== 'undefined' && req.headers['x-forwarded-proto']) {
			proto = req.headers['x-forwarded-proto'];
		}

		let origin = proto + '://' + req.hostname;
		if (typeof req.headers.origin !== 'undefined' && req.headers.origin) {
			origin = req.headers.origin;
		}

		swaggerJSON.info.version   = PACKAGE.version;
		swaggerJSON.servers[0].url = origin + '/api';
		res.status(200).send(swaggerJSON);
	});

module.exports = router;
