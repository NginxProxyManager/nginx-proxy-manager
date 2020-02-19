const express        = require('express');
const jwtdecode      = require('../../lib/express/jwt-decode');
const internalReport = require('../../internal/report');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

router
	.route('/hosts')
	.options((req, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /reports/hosts
	 */
	.get(jwtdecode(), (req, res, next) => {
		internalReport.getHostsReport(res.locals.access)
			.then((data) => {
				res.status(200)
					.send(data);
			})
			.catch(next);
	});

module.exports = router;
