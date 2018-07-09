'use strict';

const express          = require('express');
const validator        = require('../../../lib/validator');
const jwtdecode        = require('../../../lib/express/jwt-decode');
const internalDeadHost = require('../../../internal/dead-host');
const apiValidator     = require('../../../lib/validator/api');

let router = express.Router({
    caseSensitive: true,
    strict:        true,
    mergeParams:   true
});

/**
 * /api/nginx/dead-hosts
 */
router
    .route('/')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

    /**
     * GET /api/nginx/dead-hosts
     *
     * Retrieve all dead-hosts
     */
    .get((req, res, next) => {
        validator({
            additionalProperties: false,
            properties:           {
                expand: {
                    $ref: 'definitions#/definitions/expand'
                },
                query:  {
                    $ref: 'definitions#/definitions/query'
                }
            }
        }, {
            expand: (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null),
            query:  (typeof req.query.query === 'string' ? req.query.query : null)
        })
            .then(data => {
                return internalDeadHost.getAll(res.locals.access, data.expand, data.query);
            })
            .then(rows => {
                res.status(200)
                    .send(rows);
            })
            .catch(next);
    })

    /**
     * POST /api/nginx/dead-hosts
     *
     * Create a new dead-host
     */
    .post((req, res, next) => {
        apiValidator({$ref: 'endpoints/dead-hosts#/links/1/schema'}, req.body)
            .then(payload => {
                return internalDeadHost.create(res.locals.access, payload);
            })
            .then(result => {
                res.status(201)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific dead-host
 *
 * /api/nginx/dead-hosts/123
 */
router
    .route('/:host_id')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

    /**
     * GET /api/nginx/dead-hosts/123
     *
     * Retrieve a specific dead-host
     */
    .get((req, res, next) => {
        validator({
            required:             ['host_id'],
            additionalProperties: false,
            properties:           {
                host_id: {
                    $ref: 'definitions#/definitions/id'
                },
                expand:  {
                    $ref: 'definitions#/definitions/expand'
                }
            }
        }, {
            host_id: req.params.host_id,
            expand:  (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null)
        })
            .then(data => {
                return internalDeadHost.get(res.locals.access, {
                    id:     data.host_id,
                    expand: data.expand
                });
            })
            .then(row => {
                res.status(200)
                    .send(row);
            })
            .catch(next);
    })

    /**
     * PUT /api/nginx/dead-hosts/123
     *
     * Update and existing dead-host
     */
    .put((req, res, next) => {
        apiValidator({$ref: 'endpoints/dead-hosts#/links/2/schema'}, req.body)
            .then(payload => {
                payload.id = req.params.host_id;
                return internalDeadHost.update(res.locals.access, payload);
            })
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    })

    /**
     * DELETE /api/nginx/dead-hosts/123
     *
     * Update and existing dead-host
     */
    .delete((req, res, next) => {
        internalDeadHost.delete(res.locals.access, {id: req.params.host_id})
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    });

module.exports = router;
