'use strict';

const express             = require('express');
const validator           = require('../../../lib/validator');
const jwtdecode           = require('../../../lib/express/jwt-decode');
const internalCertificate = require('../../../internal/certificate');
const apiValidator        = require('../../../lib/validator/api');

let router = express.Router({
    caseSensitive: true,
    strict:        true,
    mergeParams:   true
});

/**
 * /api/nginx/certificates
 */
router
    .route('/')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

    /**
     * GET /api/nginx/certificates
     *
     * Retrieve all certificates
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
                return internalCertificate.getAll(res.locals.access, data.expand, data.query);
            })
            .then(rows => {
                res.status(200)
                    .send(rows);
            })
            .catch(next);
    })

    /**
     * POST /api/nginx/certificates
     *
     * Create a new certificate
     */
    .post((req, res, next) => {
        apiValidator({$ref: 'endpoints/certificates#/links/1/schema'}, req.body)
            .then(payload => {
                return internalCertificate.create(res.locals.access, payload);
            })
            .then(result => {
                res.status(201)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific certificate
 *
 * /api/nginx/certificates/123
 */
router
    .route('/:host_id')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

    /**
     * GET /api/nginx/certificates/123
     *
     * Retrieve a specific certificate
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
                return internalCertificate.get(res.locals.access, {
                    id:     parseInt(data.host_id, 10),
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
     * PUT /api/nginx/certificates/123
     *
     * Update and existing certificate
     */
    .put((req, res, next) => {
        apiValidator({$ref: 'endpoints/certificates#/links/2/schema'}, req.body)
            .then(payload => {
                payload.id = parseInt(req.params.host_id, 10);
                return internalCertificate.update(res.locals.access, payload);
            })
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    })

    /**
     * DELETE /api/nginx/certificates/123
     *
     * Update and existing certificate
     */
    .delete((req, res, next) => {
        internalCertificate.delete(res.locals.access, {id: parseInt(req.params.host_id, 10)})
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    });

module.exports = router;
