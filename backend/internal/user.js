const _                   = require('lodash');
const error               = require('../lib/error');
const userModel           = require('../models/user');
const userPermissionModel = require('../models/user_permission');
const authModel           = require('../models/auth');
const gravatar            = require('gravatar');
const internalToken       = require('./token');
const internalAuditLog    = require('./audit-log');

function omissions () {
	return ['is_deleted'];
}

const internalUser = {

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		let auth = data.auth || null;
		delete data.auth;

		data.avatar = data.avatar || '';
		data.roles  = data.roles || [];

		if (typeof data.is_disabled !== 'undefined') {
			data.is_disabled = data.is_disabled ? 1 : 0;
		}

		return access.can('users:create', data)
			.then(() => {
				data.avatar = gravatar.url(data.email, {default: 'mm'});

				return userModel
					.query()
					.omit(omissions())
					.insertAndFetch(data);
			})
			.then((user) => {
				if (auth) {
					return authModel
						.query()
						.insert({
							user_id: user.id,
							type:    auth.type,
							secret:  auth.secret,
							meta:    {}
						})
						.then(() => {
							return user;
						});
				} else {
					return user;
				}
			})
			.then((user) => {
				// Create permissions row as well
				let is_admin = data.roles.indexOf('admin') !== -1;

				return userPermissionModel
					.query()
					.insert({
						user_id:           user.id,
						visibility:        is_admin ? 'all' : 'user',
						proxy_hosts:       'manage',
						redirection_hosts: 'manage',
						dead_hosts:        'manage',
						streams:           'manage',
						access_lists:      'manage',
						certificates:      'manage'
					})
					.then(() => {
						return internalUser.get(access, {id: user.id, expand: ['permissions']});
					});
			})
			.then((user) => {
				// Add to audit log
				return internalAuditLog.add(access, {
					action:      'created',
					object_type: 'user',
					object_id:   user.id,
					meta:        user
				})
					.then(() => {
						return user;
					});
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @param  {String}  [data.email]
	 * @param  {String}  [data.name]
	 * @return {Promise}
	 */
	update: (access, data) => {
		if (typeof data.is_disabled !== 'undefined') {
			data.is_disabled = data.is_disabled ? 1 : 0;
		}

		return access.can('users:update', data.id)
			.then(() => {

				// Make sure that the user being updated doesn't change their email to another user that is already using it
				// 1. get user we want to update
				return internalUser.get(access, {id: data.id})
					.then((user) => {

						// 2. if email is to be changed, find other users with that email
						if (typeof data.email !== 'undefined') {
							data.email = data.email.toLowerCase().trim();

							if (user.email !== data.email) {
								return internalUser.isEmailAvailable(data.email, data.id)
									.then((available) => {
										if (!available) {
											throw new error.ValidationError('Email address already in use - ' + data.email);
										}

										return user;
									});
							}
						}

						// No change to email:
						return user;
					});
			})
			.then((user) => {
				if (user.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('User could not be updated, IDs do not match: ' + user.id + ' !== ' + data.id);
				}

				data.avatar = gravatar.url(data.email || user.email, {default: 'mm'});

				return userModel
					.query()
					.omit(omissions())
					.patchAndFetchById(user.id, data)
					.then((saved_user) => {
						return _.omit(saved_user, omissions());
					});
			})
			.then(() => {
				return internalUser.get(access, {id: data.id});
			})
			.then((user) => {
				// Add to audit log
				return internalAuditLog.add(access, {
					action:      'updated',
					object_type: 'user',
					object_id:   user.id,
					meta:        data
				})
					.then(() => {
						return user;
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   [data]
	 * @param  {Integer}  [data.id]          Defaults to the token user
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		if (typeof data === 'undefined') {
			data = {};
		}

		if (typeof data.id === 'undefined' || !data.id) {
			data.id = access.token.getUserId(0);
		}

		return access.can('users:get', data.id)
			.then(() => {
				let query = userModel
					.query()
					.where('is_deleted', 0)
					.andWhere('id', data.id)
					.allowEager('[permissions]')
					.first();

				// Custom omissions
				if (typeof data.omit !== 'undefined' && data.omit !== null) {
					query.omit(data.omit);
				}

				if (typeof data.expand !== 'undefined' && data.expand !== null) {
					query.eager('[' + data.expand.join(', ') + ']');
				}

				return query;
			})
			.then((row) => {
				if (row) {
					return _.omit(row, omissions());
				} else {
					throw new error.ItemNotFoundError(data.id);
				}
			});
	},

	/**
	 * Checks if an email address is available, but if a user_id is supplied, it will ignore checking
	 * against that user.
	 *
	 * @param email
	 * @param user_id
	 */
	isEmailAvailable: (email, user_id) => {
		let query = userModel
			.query()
			.where('email', '=', email.toLowerCase().trim())
			.where('is_deleted', 0)
			.first();

		if (typeof user_id !== 'undefined') {
			query.where('id', '!=', user_id);
		}

		return query
			.then((user) => {
				return !user;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Integer} data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access.can('users:delete', data.id)
			.then(() => {
				return internalUser.get(access, {id: data.id});
			})
			.then((user) => {
				if (!user) {
					throw new error.ItemNotFoundError(data.id);
				}

				// Make sure user can't delete themselves
				if (user.id === access.token.getUserId(0)) {
					throw new error.PermissionError('You cannot delete yourself.');
				}

				return userModel
					.query()
					.where('id', user.id)
					.patch({
						is_deleted: 1
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'deleted',
							object_type: 'user',
							object_id:   user.id,
							meta:        _.omit(user, omissions())
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * This will only count the users
	 *
	 * @param   {Access}  access
	 * @param   {String}  [search_query]
	 * @returns {*}
	 */
	getCount: (access, search_query) => {
		return access.can('users:list')
			.then(() => {
				let query = userModel
					.query()
					.count('id as count')
					.where('is_deleted', 0)
					.first();

				// Query is used for searching
				if (typeof search_query === 'string') {
					query.where(function () {
						this.where('user.name', 'like', '%' + search_query + '%')
							.orWhere('user.email', 'like', '%' + search_query + '%');
					});
				}

				return query;
			})
			.then((row) => {
				return parseInt(row.count, 10);
			});
	},

	/**
	 * All users
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access.can('users:list')
			.then(() => {
				let query = userModel
					.query()
					.where('is_deleted', 0)
					.groupBy('id')
					.omit(['is_deleted'])
					.allowEager('[permissions]')
					.orderBy('name', 'ASC');

				// Query is used for searching
				if (typeof search_query === 'string') {
					query.where(function () {
						this.where('name', 'like', '%' + search_query + '%')
							.orWhere('email', 'like', '%' + search_query + '%');
					});
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.eager('[' + expand.join(', ') + ']');
				}

				return query;
			});
	},

	/**
	 * @param   {Access} access
	 * @param   {Integer} [id_requested]
	 * @returns {[String]}
	 */
	getUserOmisionsByAccess: (access, id_requested) => {
		let response = []; // Admin response

		if (!access.token.hasScope('admin') && access.token.getUserId(0) !== id_requested) {
			response = ['roles', 'is_deleted']; // Restricted response
		}

		return response;
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @param  {String}  data.type
	 * @param  {String}  data.secret
	 * @return {Promise}
	 */
	setPassword: (access, data) => {
		return access.can('users:password', data.id)
			.then(() => {
				return internalUser.get(access, {id: data.id});
			})
			.then((user) => {
				if (user.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('User could not be updated, IDs do not match: ' + user.id + ' !== ' + data.id);
				}

				if (user.id === access.token.getUserId(0)) {
					// they're setting their own password. Make sure their current password is correct
					if (typeof data.current === 'undefined' || !data.current) {
						throw new error.ValidationError('Current password was not supplied');
					}

					return internalToken.getTokenFromEmail({
						identity: user.email,
						secret:   data.current
					})
						.then(() => {
							return user;
						});
				}

				return user;
			})
			.then((user) => {
				// Get auth, patch if it exists
				return authModel
					.query()
					.where('user_id', user.id)
					.andWhere('type', data.type)
					.first()
					.then((existing_auth) => {
						if (existing_auth) {
							// patch
							return authModel
								.query()
								.where('user_id', user.id)
								.andWhere('type', data.type)
								.patch({
									type:   data.type, // This is required for the model to encrypt on save
									secret: data.secret
								});
						} else {
							// insert
							return authModel
								.query()
								.insert({
									user_id: user.id,
									type:    data.type,
									secret:  data.secret,
									meta:    {}
								});
						}
					})
					.then(() => {
						// Add to Audit Log
						return internalAuditLog.add(access, {
							action:      'updated',
							object_type: 'user',
							object_id:   user.id,
							meta:        {
								name:             user.name,
								password_changed: true,
								auth_type:        data.type
							}
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @return {Promise}
	 */
	setPermissions: (access, data) => {
		return access.can('users:permissions', data.id)
			.then(() => {
				return internalUser.get(access, {id: data.id});
			})
			.then((user) => {
				if (user.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('User could not be updated, IDs do not match: ' + user.id + ' !== ' + data.id);
				}

				return user;
			})
			.then((user) => {
				// Get perms row, patch if it exists
				return userPermissionModel
					.query()
					.where('user_id', user.id)
					.first()
					.then((existing_auth) => {
						if (existing_auth) {
							// patch
							return userPermissionModel
								.query()
								.where('user_id', user.id)
								.patchAndFetchById(existing_auth.id, _.assign({user_id: user.id}, data));
						} else {
							// insert
							return userPermissionModel
								.query()
								.insertAndFetch(_.assign({user_id: user.id}, data));
						}
					})
					.then((permissions) => {
						// Add to Audit Log
						return internalAuditLog.add(access, {
							action:      'updated',
							object_type: 'user',
							object_id:   user.id,
							meta:        {
								name:        user.name,
								permissions: permissions
							}
						});

					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}   access
	 * @param {Object}   data
	 * @param {Integer}  data.id
	 */
	loginAs: (access, data) => {
		return access.can('users:loginas', data.id)
			.then(() => {
				return internalUser.get(access, data);
			})
			.then((user) => {
				return internalToken.getTokenFromUser(user);
			});
	}
};

module.exports = internalUser;
