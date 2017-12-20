'use strict';

const express        = require('express');
const validator      = require('../../lib/validator');
const apiValidator   = require('../../lib/validator/api');
const internalAccess = require('../../internal/access');

let router = express.Router({
    caseSensitive: true,
    strict:        true,
    mergeParams:   true
});

/**
 * /api/access
 */
router
    .route('/')
    .options((req, res) => {
        res.sendStatus(204);
    })

    /**
     * GET /api/access
     *
     * Retrieve all access lists
     */
    .get((req, res, next) => {
        internalAccess.getAll()
            .then(lists => {
                res.status(200)
                    .send(lists);
            })
            .catch(next);
    })

    /**
     * POST /api/access
     *
     * Create a new Access List
     */
    .post((req, res, next) => {
        apiValidator({$ref: 'endpoints/access#/links/1/schema'}, req.body)
            .then(payload => {
                return internalAccess.create(payload);
            })
            .then(result => {
                res.status(201)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific Access List
 *
 * /api/access/123
 */
router
    .route('/:list_id')
    .options((req, res) => {
        res.sendStatus(204);
    })

    /**
     * GET /access/123
     *
     * Retrieve a specific Access List
     */
    .get((req, res, next) => {
        validator({
            required:             ['list_id'],
            additionalProperties: false,
            properties:           {
                list_id: {
                    $ref: 'definitions#/definitions/id'
                }
            }
        }, req.params)
            .then(data => {
                return internalAccess.get(data.list_id);
            })
            .then(list => {
                res.status(200)
                    .send(list);
            })
            .catch(next);
    })

    /**
     * PUT /api/access/123
     *
     * Update an existing Access List
     */
    .put((req, res, next) => {
        apiValidator({$ref: 'endpoints/access#/links/2/schema'}, req.body)
            .then(payload => {
                return internalAccess.update(req.params.list_id, payload);
            })
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    })

    /**
     * DELETE /api/access/123
     *
     * Delete an existing Access List
     */
    .delete((req, res, next) => {
        internalAccess.delete(req.params.list_id)
            .then(result => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    });

module.exports = router;
