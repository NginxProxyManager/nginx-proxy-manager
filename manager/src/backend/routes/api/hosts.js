'use strict';

const express      = require('express');
const validator    = require('../../lib/validator');
const apiValidator = require('../../lib/validator/api');
const internalHost = require('../../internal/host');

let router = express.Router({
    caseSensitive: true,
    strict:        true,
    mergeParams:   true
});

/**
 * /api/hosts
 */
router
    .route('/')
    .options((req, res) => {
        res.sendStatus(204);
    })

    /**
     * GET /api/hosts
     *
     * Retrieve all hosts
     */
    .get((req, res, next) => {
        internalHost.getAll()
            .then(hosts => {
                res.status(200)
                    .send(hosts);
            })
            .catch(next);
    })

    /**
     * POST /api/hosts
     *
     * Create a new Host
     */
    .post((req, res, next) => {
        apiValidator({$ref: 'endpoints/hosts#/links/1/schema'}, req.body)
            .then(payload => {
                return internalHost.create(payload);
            })
            .then(result => {
                res.status(201)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific Host
 *
 * /api/hosts/123
 */
router
    .route('/:host_id')
    .options((req, res) => {
        res.sendStatus(204);
    })

    /**
     * GET /hosts/123
     *
     * Retrieve a specific Host
     */
    .get((req, res, next) => {
        validator({
            required:             ['host_id'],
            additionalProperties: false,
            properties:           {
                host_id: {
                    $ref: 'definitions#/definitions/_id'
                }
            }
        }, req.params)
            .then(data => {
                return internalHost.get(data.host_id);
            })
            .then(host => {
                res.status(200)
                    .send(host);
            })
            .catch(next);
    })

    /**
     * PUT /api/hosts/123
     *
     * Update an existing Host
     */
    .put((req, res, next) => {
        apiValidator({$ref: 'endpoints/hosts#/links/2/schema'}, req.body)
            .then(payload => {
                return internalHost.update(req.params.host_id, payload);
            })
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    })

    /**
     * DELETE /api/hosts/123
     *
     * Delete an existing Host
     */
    .delete((req, res, next) => {
        internalHost.delete(req.params.host_id)
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Reconfigure Host Action
 *
 * /api/hosts/123/reconfigure
 */
router
    .route('/:host_id/reconfigure')
    .options((req, res) => {
        res.sendStatus(204);
    })

    /**
     * POST /api/hosts/123/reconfigure
     */
    .post((req, res, next) => {
        validator({
            required:             ['host_id'],
            additionalProperties: false,
            properties:           {
                host_id: {
                    $ref: 'definitions#/definitions/_id'
                }
            }
        }, req.params)
            .then(data => {
                return internalHost.reconfigure(data.host_id);
            })
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    });

module.exports = router;
