const express        = require('express');
const validator      = require('../../../lib/validator');
const jwtdecode      = require('../../../lib/express/jwt-decode');
const internalStream = require('../../../internal/stream');
const apiValidator   = require('../../../lib/validator/api');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

/**
 * /api/nginx/streams
 */
router
	.route('/')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

	/**
	 * GET /api/nginx/streams
	 *
	 * Retrieve all streams
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
				return internalStream.getAll(res.locals.access, data.expand, data.query);
			})
			.then((rows) => {
				res.status(200)
					.send(rows);
			})
			.catch(next);
	})

	/**
	 * POST /api/nginx/streams
	 *
	 * Create a new stream
	 */
	.post((req, res, next) => {
		apiValidator({$ref: 'endpoints/streams#/links/1/schema'}, req.body)
			.then((payload) => {
				return internalStream.create(res.locals.access, payload);
			})
			.then((result) => {
				res.status(201)
					.send(result);
			})
			.catch(next);
	});

/**
 * Specific stream
 *
 * /api/nginx/streams/123
 */
router
	.route('/:stream_id')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

	/**
	 * GET /api/nginx/streams/123
	 *
	 * Retrieve a specific stream
	 */
	.get((req, res, next) => {
		validator({
			required:             ['stream_id'],
			additionalProperties: false,
			properties:           {
				stream_id: {
					$ref: 'definitions#/definitions/id'
				},
				expand: {
					$ref: 'definitions#/definitions/expand'
				}
			}
		}, {
			stream_id: req.params.stream_id,
			expand:    (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null)
		})
			.then((data) => {
				return internalStream.get(res.locals.access, {
					id:     parseInt(data.stream_id, 10),
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
	 * PUT /api/nginx/streams/123
	 *
	 * Update and existing stream
	 */
	.put((req, res, next) => {
		apiValidator({$ref: 'endpoints/streams#/links/2/schema'}, req.body)
			.then((payload) => {
				payload.id = parseInt(req.params.stream_id, 10);
				return internalStream.update(res.locals.access, payload);
			})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	})

	/**
	 * DELETE /api/nginx/streams/123
	 *
	 * Update and existing stream
	 */
	.delete((req, res, next) => {
		internalStream.delete(res.locals.access, {id: parseInt(req.params.stream_id, 10)})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

/**
 * Enable stream
 *
 * /api/nginx/streams/123/enable
 */
router
	.route('/:host_id/enable')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/streams/123/enable
	 */
	.post((req, res, next) => {
		internalStream.enable(res.locals.access, {id: parseInt(req.params.host_id, 10)})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

/**
 * Disable stream
 *
 * /api/nginx/streams/123/disable
 */
router
	.route('/:host_id/disable')
	.options((req, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/streams/123/disable
	 */
	.post((req, res, next) => {
		internalStream.disable(res.locals.access, {id: parseInt(req.params.host_id, 10)})
			.then((result) => {
				res.status(200)
					.send(result);
			})
			.catch(next);
	});

module.exports = router;
