'use strict';

const _          = require('lodash');
const validator  = require('ajv');
const error      = require('./error');
const userModel  = require('../models/user');
const TokenModel = require('../models/token');
const roleSchema = require('./access/roles.json');

module.exports = function (token_string) {
    let Token                 = new TokenModel();
    let token_data            = null;
    let initialised           = false;
    let object_cache          = {};
    let allow_internal_access = false;
    let user_roles            = [];

    /**
     * Loads the Token object from the token string
     *
     * @returns {Promise}
     */
    this.init = () => {
        return new Promise((resolve, reject) => {
            if (initialised) {
                resolve();
            } else if (!token_string) {
                reject(new error.PermissionError('Permission Denied'));
            } else {
                resolve(Token.load(token_string)
                    .then((data) => {
                        token_data = data;

                        // At this point we need to load the user from the DB and make sure they:
                        // - exist (and not soft deleted)
                        // - still have the appropriate scopes for this token
                        // This is only required when the User ID is supplied or if the token scope has `user`

                        if (token_data.attrs.id || (typeof token_data.scope !== 'undefined' && _.indexOf(token_data.scope, 'user') !== -1)) {
                            // Has token user id or token user scope
                            return userModel
                                .query()
                                .where('id', token_data.attrs.id)
                                .andWhere('is_deleted', 0)
                                .andWhere('is_disabled', 0)
                                .first('id')
                                .then((user) => {
                                    if (user) {
                                        // make sure user has all scopes of the token
                                        // The `user` role is not added against the user row, so we have to just add it here to get past this check.
                                        user.roles.push('user');

                                        let is_ok = true;
                                        _.forEach(token_data.scope, (scope_item) => {
                                            if (_.indexOf(user.roles, scope_item) === -1) {
                                                is_ok = false;
                                            }
                                        });

                                        if (!is_ok) {
                                            throw new error.AuthError('Invalid token scope for User');
                                        } else {
                                            initialised = true;
                                            user_roles  = user.roles;
                                        }
                                    } else {
                                        throw new error.AuthError('User cannot be loaded for Token');
                                    }
                                });
                        } else {
                            initialised = true;
                        }
                    }));
            }
        });
    };

    /**
     * Fetches the object ids from the database, only once per object type, for this token.
     * This only applies to USER token scopes, as all other tokens are not really bound
     * by object scopes
     *
     * @param   {String} object_type
     * @returns {Promise}
     */
    this.loadObjects = object_type => {
        return new Promise((resolve, reject) => {
            if (Token.hasScope('user')) {
                if (typeof token_data.attrs.id === 'undefined' || !token_data.attrs.id) {
                    reject(new error.AuthError('User Token supplied without a User ID'));
                } else {
                    let token_user_id = token_data.attrs.id ? token_data.attrs.id : 0;

                    if (typeof object_cache[object_type] === 'undefined') {
                        switch (object_type) {

                            // USERS - should only return yourself
                            case 'users':
                                resolve(token_user_id ? [token_user_id] : []);
                                break;

                            // DEFAULT: null
                            default:
                                resolve(null);
                                break;
                        }
                    } else {
                        resolve(object_cache[object_type]);
                    }
                }
            } else {
                resolve(null);
            }
        })
            .then(objects => {
                object_cache[object_type] = objects;
                return objects;
            });
    };

    /**
     * Creates a schema object on the fly with the IDs and other values required to be checked against the permissionSchema
     *
     * @param {String} permission_label
     * @returns {Object}
     */
    this.getObjectSchema = permission_label => {
        let base_object_type = permission_label.split(':').shift();

        let schema = {
            $id:                  'objects',
            $schema:              'http://json-schema.org/draft-07/schema#',
            description:          'Actor Properties',
            type:                 'object',
            additionalProperties: false,
            properties:           {
                user_id: {
                    anyOf: [
                        {
                            type: 'number',
                            enum: [Token.get('attrs').id]
                        }
                    ]
                },
                scope:   {
                    type:    'string',
                    pattern: '^' + Token.get('scope') + '$'
                }
            }
        };

        return this.loadObjects(base_object_type)
            .then(object_result => {
                if (typeof object_result === 'object' && object_result !== null) {
                    schema.properties[base_object_type] = {
                        type:    'number',
                        enum:    object_result,
                        minimum: 1
                    };
                } else {
                    schema.properties[base_object_type] = {
                        type:    'number',
                        minimum: 1
                    };
                }

                return schema;
            });
    };

    return {

        token: Token,

        /**
         *
         * @param   {Boolean}  [allow_internal]
         * @returns {Promise}
         */
        load: allow_internal => {
            return new Promise(function (resolve/*, reject*/) {
                if (token_string) {
                    resolve(Token.load(token_string));
                } else {
                    allow_internal_access = allow_internal;
                    resolve(allow_internal_access || null);
                }
            });
        },

        /**
         *
         * @param {String}  permission
         * @param {*}       [data]
         * @returns {Promise}
         */
        can: (permission, data) => {
            if (allow_internal_access === true) {
                return Promise.resolve(true);
                //return true;
            } else {
                return this.init()
                    .then(() => {
                        // Initialised, token decoded ok

                        return this.getObjectSchema(permission)
                            .then(objectSchema => {
                                let data_schema = {
                                    [permission]: {
                                        data:  data,
                                        scope: Token.get('scope'),
                                        roles: user_roles
                                    }
                                };

                                let permissionSchema = {
                                    $schema:              'http://json-schema.org/draft-07/schema#',
                                    $async:               true,
                                    $id:                  'permissions',
                                    additionalProperties: false,
                                    properties:           {}
                                };

                                permissionSchema.properties[permission] = require('./access/' + permission.replace(/:/gim, '-') + '.json');

                                //console.log('objectSchema:', JSON.stringify(objectSchema, null, 2));
                                //console.log('permissionSchema:', JSON.stringify(permissionSchema, null, 2));
                                //console.log('data_schema:', JSON.stringify(data_schema, null, 2));

                                let ajv = validator({
                                    verbose:      true,
                                    allErrors:    true,
                                    format:       'full',
                                    missingRefs:  'fail',
                                    breakOnError: true,
                                    coerceTypes:  true,
                                    schemas:      [
                                        roleSchema,
                                        objectSchema,
                                        permissionSchema
                                    ]
                                });

                                return ajv.validate('permissions', data_schema);
                            });
                    })
                    .catch(err => {
                        //console.log(err.message);
                        //console.log(err.errors);

                        throw new error.PermissionError('Permission Denied', err);
                    });
            }
        }
    };
};
