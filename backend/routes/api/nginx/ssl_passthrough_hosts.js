const express                = require('express');
const validator              = require('../../../lib/validator');
const jwtdecode              = require('../../../lib/express/jwt-decode');
const internalSslPassthrough = require('../../../internal/ssl-passthrough-host'); 
const apiValidator           = require('../../../lib/validator/api');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * /api/nginx/ssl-passthrough-hosts
 */
router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

	/**
	 * GET /api/nginx/ssl-passthrough-hosts
	 *
	 * Retrieve all ssl passthrough hosts
	 */
	.get((req, res, next) => {
		validator({
			additionalProperties: false,
			properties:           {
				expand: {
					$ref: 'definitions#/definitions/expand'
				},
				query: {
					$ref: 'definitions#/definitions/query'
				}
			}
		}, {
			expand: (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null),
			query:  (typeof req.query.query === 'string' ? req.query.query : null)
		})
			.then((data) => {
				return internalSslPassthrough.getAll(res.locals.access, data.expand, data.query);
			})
			.then((rows) => {
				res.status(200)
					.send(rows);
			})
			.catch(next);
	})

	/**
	 * POST /api/nginx/ssl-passthrough-hosts
	 *
	 * Create a new ssl passthrough host
	 */
	.post((req, res, next) => {
		apiValidator({$ref: 'endpoints/ssl-passthrough-hosts#/links/1/schema'}, req.body)
			.then((payload) => {
				return internalSslPassthrough.create(res.locals.access, payload);
			})
			.then((result) => {
				res.status(201)
					.send(result);
			})
			.catch(next);
	});

/**
 * Specific ssl passthrough host
 *
 * /api/nginx/ssl-passthrough-hosts/123
 */
router
	.route('/:ssl_passthrough_host_id')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

	/**
	 * GET /api/nginx/ssl-passthrough-hosts/123
	 *
	 * Retrieve a specific ssl passthrough host
	 */
	.get((req, res, next) => {
		validator({
			required:             ['ssl_passthrough_host_id'],
			additionalProperties: false,
			properties:           {
				host_id: {
					$ref: 'definitions#/definitions/id'
				},
				expand: {
					$ref: 'definitions#/definitions/expand'
				}
			}
		}, {
			host_id: req.params.host_id,
			expand:    (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null)
		})
			.then((data) => {
				return internalSslPassthrough.get(res.locals.access, {
					id:     parseInt(data.host_id, 10),
					expand: data.expand
				});
			})
			.then((row) => {
				res.status(200)
					.send(row);
			})
			.catch(next);
	})

	/**
	 * PUT /api/nginx/ssl-passthrough-hosts/123
	 *
	 * Update an existing ssl passthrough host
	 */
	.put((req, res, next) => {
		apiValidator({$ref: 'endpoints/ssl-passthrough-hosts#/links/2/schema'}, req.body)
			.then((payload) => {
				payload.id = parseInt(req.params.host_id, 10);
				return internalSslPassthrough.update(res.locals.access, payload);
			})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	})

	/**
	 * DELETE /api/nginx/ssl-passthrough-hosts/123
	 *
	 * Delete an ssl passthrough host
	 */
	.delete((req, res, next) => {
		internalSslPassthrough.delete(res.locals.access, {id: parseInt(req.params.host_id, 10)})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

/**
 * Enable ssl passthrough host
 *
 * /api/nginx/ssl-passthrough-hosts/123/enable
 */
router
	.route('/:host_id/enable')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/ssl-passthrough-hosts/123/enable
	 */
	.post((req, res, next) => {
		internalSslPassthrough.enable(res.locals.access, {id: parseInt(req.params.host_id, 10)})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

/**
 * Disable ssl passthrough host
 *
 * /api/nginx/ssl-passthrough-hosts/123/disable
 */
router
	.route('/:host_id/disable')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/ssl-passthrough-hosts/123/disable
	 */
	.post((req, res, next) => {
		internalSslPassthrough.disable(res.locals.access, {id: parseInt(req.params.host_id, 10)})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

module.exports = router;
