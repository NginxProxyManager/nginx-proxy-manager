const express          = require('express');
const validator        = require('../../lib/validator');
const jwtdecode        = require('../../lib/express/jwt-decode');
const internalUpstream = require('../../internal/upstream');

let router = express.Router({
	caseSensitive: true,
	strict:        true,
	mergeParams:   true
});

router
	.route('/')
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get((req, res, next) => {
		validator({
			additionalProperties: false,
			properties:           {
				expand: { $ref: 'common#/properties/expand' },
				query:  { $ref: 'common#/properties/query' }
			}
		}, {
			expand: (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null),
			query:  (typeof req.query.query === 'string' ? req.query.query : null)
		})
			.then((data) => internalUpstream.getAll(res.locals.access, data.expand, data.query))
			.then((rows) => res.status(200).send(rows))
			.catch(next);
	})
	.post((req, res, next) => {
		internalUpstream.create(res.locals.access, req.body)
			.then((result) => res.status(201).send(result))
			.catch(next);
	});

router
	.route('/:id')
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get((req, res, next) => {
		validator({
			required:             ['id'],
			additionalProperties: false,
			properties:           {
				id:     { $ref: 'common#/properties/id' },
				expand: { $ref: 'common#/properties/expand' }
			}
		}, {
			id:     req.params.id,
			expand: (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null)
		})
			.then((data) => internalUpstream.get(res.locals.access, { id: parseInt(data.id, 10), expand: data.expand }))
			.then((row) => res.status(200).send(row))
			.catch(next);
	})
	.put((req, res, next) => {
		req.body.id = parseInt(req.params.id, 10);
		internalUpstream.update(res.locals.access, req.body)
			.then((result) => res.status(200).send(result))
			.catch(next);
	})
	.delete((req, res, next) => {
		internalUpstream.delete(res.locals.access, { id: parseInt(req.params.id, 10) })
			.then((result) => res.status(200).send(result))
			.catch(next);
	});

module.exports = router;
