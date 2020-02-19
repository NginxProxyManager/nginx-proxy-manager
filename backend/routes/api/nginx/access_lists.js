const express            = require('express');
const validator          = require('../../../lib/validator');
const jwtdecode          = require('../../../lib/express/jwt-decode');
const internalAccessList = require('../../../internal/access-list');
const apiValidator       = require('../../../lib/validator/api');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * /api/nginx/access-lists
 */
router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/access-lists
	 *
	 * Retrieve all access-lists
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
				return internalAccessList.getAll(res.locals.access, data.expand, data.query);
			})
			.then((rows) => {
				res.status(200)
					.send(rows);
			})
			.catch(next);
	})

	/**
	 * POST /api/nginx/access-lists
	 *
	 * Create a new access-list
	 */
	.post((req, res, next) => {
		apiValidator({$ref: 'endpoints/access-lists#/links/1/schema'}, req.body)
			.then((payload) => {
				return internalAccessList.create(res.locals.access, payload);
			})
			.then((result) => {
				res.status(201)
					.send(result);
			})
			.catch(next);
	});

/**
 * Specific access-list
 *
 * /api/nginx/access-lists/123
 */
router
	.route('/:list_id')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/access-lists/123
	 *
	 * Retrieve a specific access-list
	 */
	.get((req, res, next) => {
		validator({
			required:             ['list_id'],
			additionalProperties: false,
			properties:           {
				list_id: {
					$ref: 'definitions#/definitions/id'
				},
				expand: {
					$ref: 'definitions#/definitions/expand'
				}
			}
		}, {
			list_id: req.params.list_id,
			expand:  (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null)
		})
			.then((data) => {
				return internalAccessList.get(res.locals.access, {
					id:     parseInt(data.list_id, 10),
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
	 * PUT /api/nginx/access-lists/123
	 *
	 * Update and existing access-list
	 */
	.put((req, res, next) => {
		apiValidator({$ref: 'endpoints/access-lists#/links/2/schema'}, req.body)
			.then((payload) => {
				payload.id = parseInt(req.params.list_id, 10);
				return internalAccessList.update(res.locals.access, payload);
			})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	})

	/**
	 * DELETE /api/nginx/access-lists/123
	 *
	 * Delete and existing access-list
	 */
	.delete((req, res, next) => {
		internalAccessList.delete(res.locals.access, {id: parseInt(req.params.list_id, 10)})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

module.exports = router;
