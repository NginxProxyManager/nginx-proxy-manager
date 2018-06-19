'use strict';

const express      = require('express');
const validator    = require('../../lib/validator');
const jwtdecode    = require('../../lib/express/jwt-decode');
const pagination   = require('../../lib/express/pagination');
const userIdFromMe = require('../../lib/express/user-id-from-me');
const internalUser = require('../../internal/user');
const apiValidator = require('../../lib/validator/api');

let router = express.Router({
    caseSensitive: true,
    strict:        true,
    mergeParams:   true
});

/**
 * /api/users
 */
router
    .route('/')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

    /**
     * GET /api/users
     *
     * Retrieve all users
     */
    .get(pagination('name', 0, 50, 300), (req, res, next) => {
        validator({
            additionalProperties: false,
            required:             ['sort'],
            properties:           {
                sort:   {
                    $ref: 'definitions#/definitions/sort'
                },
                expand: {
                    $ref: 'definitions#/definitions/expand'
                },
                query:  {
                    $ref: 'definitions#/definitions/query'
                }
            }
        }, {
            sort:   req.query.sort,
            expand: (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null),
            query:  (typeof req.query.query === 'string' ? req.query.query : null)
        })
            .then((data) => {
                return Promise.all([
                    internalUser.getCount(res.locals.access, data.query),
                    internalUser.getAll(res.locals.access, req.query.offset, req.query.limit, data.sort, data.expand, data.query)
                ]);
            })
            .then((data) => {
                res.setHeader('X-Dataset-Total', data.shift());
                res.setHeader('X-Dataset-Offset', req.query.offset);
                res.setHeader('X-Dataset-Limit', req.query.limit);
                return data.shift();
            })
            .then((users) => {
                res.status(200)
                    .send(users);
            })
            .catch(next);
    })

    /**
     * POST /api/users
     *
     * Create a new User
     */
    .post((req, res, next) => {
        apiValidator({$ref: 'endpoints/users#/links/1/schema'}, req.body)
            .then((payload) => {
                return internalUser.create(res.locals.access, payload);
            })
            .then((result) => {
                res.status(201)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific user
 *
 * /api/users/123
 */
router
    .route('/:user_id')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes
    .all(userIdFromMe)

    /**
     * GET /users/123 or /users/me
     *
     * Retrieve a specific user
     */
    .get((req, res, next) => {
        validator({
            required:             ['user_id'],
            additionalProperties: false,
            properties:           {
                user_id: {
                    $ref: 'definitions#/definitions/id'
                },
                expand:  {
                    $ref: 'definitions#/definitions/expand'
                }
            }
        }, {
            user_id: req.params.user_id,
            expand:  (typeof req.query.expand === 'string' ? req.query.expand.split(',') : null)
        })
            .then((data) => {
                return internalUser.get(res.locals.access, {
                    id:     data.user_id,
                    expand: data.expand,
                    omit:   internalUser.getUserOmisionsByAccess(res.locals.access, data.user_id)
                });
            })
            .then((user) => {
                res.status(200)
                    .send(user);
            })
            .catch(next);
    })

    /**
     * PUT /api/users/123
     *
     * Update and existing user
     */
    .put((req, res, next) => {
        apiValidator({$ref: 'endpoints/users#/links/2/schema'}, req.body)
            .then((payload) => {
                payload.id = req.params.user_id;
                return internalUser.update(res.locals.access, payload);
            })
            .then((result) => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    })

    /**
     * DELETE /api/users/123
     *
     * Update and existing user
     */
    .delete((req, res, next) => {
        internalUser.delete(res.locals.access, {id: req.params.user_id})
            .then((result) => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific user auth
 *
 * /api/users/123/auth
 */
router
    .route('/:user_id/auth')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes
    .all(userIdFromMe)

    /**
     * PUT /api/users/123/auth
     *
     * Update password for a user
     */
    .put((req, res, next) => {
        apiValidator({$ref: 'endpoints/users#/links/4/schema'}, req.body)
            .then(payload => {
                payload.id = req.params.user_id;
                return internalUser.setPassword(res.locals.access, payload);
            })
            .then(result => {
                res.status(201)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific user service settings
 *
 * /api/users/123/services
 */
router
    .route('/:user_id/services')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes
    .all(userIdFromMe)

    /**
     * POST /api/users/123/services
     *
     * Sets Service Settings for a user
     */
    .post((req, res, next) => {
        apiValidator({$ref: 'endpoints/users#/links/5/schema'}, req.body)
            .then((payload) => {
                payload.id = req.params.user_id;
                return internalUser.setServiceSettings(res.locals.access, payload);
            })
            .then((result) => {
                res.status(200)
                    .send(result);
            })
            .catch(next);
    });

/**
 * Specific user login as
 *
 * /api/users/123/login
 */
router
    .route('/:user_id/login')
    .options((req, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode()) // preferred so it doesn't apply to nonexistent routes

    /**
     * POST /api/users/123/login
     *
     * Log in as a user
     */
    .post((req, res, next) => {
        internalUser.loginAs(res.locals.access, {id: parseInt(req.params.user_id, 10)})
            .then(result => {
                res.status(201)
                    .send(result);
            })
            .catch(next);
    });

module.exports = router;
