const express = require('express');
const pjson   = require('../../package.json');
const error   = require('../../lib/error');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * Health Check
 * GET /api
 */
router.get('/', (req, res/*, next*/) => {
	let version = pjson.version.split('-').shift().split('.');

	res.status(200).send({
		status:  'OK',
		version: {
			major:    parseInt(version.shift(), 10),
			minor:    parseInt(version.shift(), 10),
			revision: parseInt(version.shift(), 10)
		}
	});
});

router.use('/schema', require('./schema'));
router.use('/tokens', require('./tokens'));
router.use('/users', require('./users'));
router.use('/audit-log', require('./audit-log'));
router.use('/reports', require('./reports'));
router.use('/settings', require('./settings'));
router.use('/nginx/proxy-hosts', require('./nginx/proxy_hosts'));
router.use('/nginx/redirection-hosts', require('./nginx/redirection_hosts'));
router.use('/nginx/dead-hosts', require('./nginx/dead_hosts'));
router.use('/nginx/streams', require('./nginx/streams'));
router.use('/nginx/access-lists', require('./nginx/access_lists'));
router.use('/nginx/certificates', require('./nginx/certificates'));

/**
 * API 404 for all other routes
 *
 * ALL /api/*
 */
router.all(/(.+)/, function (req, res, next) {
	req.params.page = req.params['0'];
	next(new error.ItemNotFoundError(req.params.page));
});

module.exports = router;
