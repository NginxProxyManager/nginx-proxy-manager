const _                    = require('lodash');
const error                = require('../lib/error');
const passthroughHostModel = require('../models/ssl_passthrough_host');
const internalHost         = require('./host');
const internalNginx        = require('./nginx');
const internalAuditLog     = require('./audit-log');

function omissions () {
	return ['is_deleted'];
}

const internalPassthroughHost = {

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		return access.can('ssl_passthrough_hosts:create', data)
			.then(() => {
				// Get the domain name and check it against existing records
				return internalHost.isHostnameTaken(data.domain_name)
					.then((result) => {
						if (result.is_taken) {
							throw new error.ValidationError(result.hostname + ' is already in use');
						}
					});
			}).then((/*access_data*/) => {
				data.owner_user_id = access.token.getUserId(1);

				if (typeof data.meta === 'undefined') {
					data.meta = {};
				}

				return passthroughHostModel
					.query()
					.insertAndFetch(data);
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(passthroughHostModel, 'ssl_passthrough_host', {})
					.then(() => {
						return internalPassthroughHost.get(access, {id: row.id, expand: ['owner']});
					});
			})
			.then((row) => {
				// Add to audit log
				return internalAuditLog.add(access, {
					action:      'created',
					object_type: 'ssl-passthrough-host',
					object_id:   row.id,
					meta:        data
				})
					.then(() => {
						return row;
					});
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access.can('ssl_passthrough_hosts:update', data.id)
			.then((/*access_data*/) => {
				// Get the domain name and check it against existing records
				if (typeof data.domain_name !== 'undefined') {
					return internalHost.isHostnameTaken(data.domain_name, 'ssl_passthrough', data.id)
						.then((result) => {
							if (result.is_taken) {
								throw new error.ValidationError(result.hostname + ' is already in use');
							}
						});
				}
			}).then((/*access_data*/) => {
				return internalPassthroughHost.get(access, {id: data.id});
			})
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('SSL Passthrough Host could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
				}

				return passthroughHostModel
					.query()
					.patchAndFetchById(row.id, data)
					.then(() => {
						return internalNginx.configure(passthroughHostModel, 'ssl_passthrough_host', {})
							.then(() => {
								return internalPassthroughHost.get(access, {id: row.id, expand: ['owner']});
							});
					})
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'updated',
							object_type: 'ssl-passthrough-host',
							object_id:   row.id,
							meta:        data
						})
							.then(() => {
								return _.omit(saved_row, omissions());
							});
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		if (typeof data === 'undefined') {
			data = {};
		}

		return access.can('ssl_passthrough_hosts:get', data.id)
			.then((access_data) => {
				let query = passthroughHostModel
					.query()
					.where('is_deleted', 0)
					.andWhere('id', data.id)
					.allowGraph('[owner]')
					.first();

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				if (typeof data.expand !== 'undefined' && data.expand !== null) {
					query.withGraphFetched('[' + data.expand.join(', ') + ']');
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
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access.can('ssl_passthrough_hosts:delete', data.id)
			.then(() => {
				return internalPassthroughHost.get(access, {id: data.id});
			})
			.then((row) => {
				if (!row) {
					throw new error.ItemNotFoundError(data.id);
				}

				return passthroughHostModel
					.query()
					.where('id', row.id)
					.patch({
						is_deleted: 1
					})
					.then(() => {
						// Update Nginx Config
						return internalNginx.configure(passthroughHostModel, 'ssl_passthrough_host', {})
							.then(() => {
								return internalNginx.reload();
							});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'deleted',
							object_type: 'ssl-passthrough-host',
							object_id:   row.id,
							meta:        _.omit(row, omissions())
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: (access, data) => {
		return access.can('ssl_passthrough_hosts:update', data.id)
			.then(() => {
				return internalPassthroughHost.get(access, {
					id:     data.id,
					expand: ['owner']
				});
			})
			.then((row) => {
				if (!row) {
					throw new error.ItemNotFoundError(data.id);
				} else if (row.enabled) {
					throw new error.ValidationError('Host is already enabled');
				}

				row.enabled = 1;

				return passthroughHostModel
					.query()
					.where('id', row.id)
					.patch({
						enabled: 1
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(passthroughHostModel, 'ssl_passthrough_host', {});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'enabled',
							object_type: 'ssl-passthrough-host',
							object_id:   row.id,
							meta:        _.omit(row, omissions())
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: (access, data) => {
		return access.can('ssl_passthrough_hosts:update', data.id)
			.then(() => {
				return internalPassthroughHost.get(access, {id: data.id});
			})
			.then((row) => {
				if (!row) {
					throw new error.ItemNotFoundError(data.id);
				} else if (!row.enabled) {
					throw new error.ValidationError('Host is already disabled');
				}

				row.enabled = 0;

				return passthroughHostModel
					.query()
					.where('id', row.id)
					.patch({
						enabled: 0
					})
					.then(() => {
						// Update Nginx Config
						return internalNginx.configure(passthroughHostModel, 'ssl_passthrough_host', {})
							.then(() => {
								return internalNginx.reload();
							});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'disabled',
							object_type: 'ssl-passthrough-host',
							object_id:   row.id,
							meta:        _.omit(row, omissions())
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All SSL Passthrough Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access.can('ssl_passthrough_hosts:list')
			.then((access_data) => {
				let query = passthroughHostModel
					.query()
					.where('is_deleted', 0)
					.groupBy('id')
					.allowGraph('[owner]')
					.orderBy('domain_name', 'ASC');

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				// Query is used for searching
				if (typeof search_query === 'string') {
					query.where(function () {
						this.where('domain_name', 'like', '%' + search_query + '%');
					});
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.withGraphFetched('[' + expand.join(', ') + ']');
				}

				return query;
			});
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		let query = passthroughHostModel
			.query()
			.count('id as count')
			.where('is_deleted', 0);

		if (visibility !== 'all') {
			query.andWhere('owner_user_id', user_id);
		}

		return query.first()
			.then((row) => {
				return parseInt(row.count, 10);
			});
	}
};

module.exports = internalPassthroughHost;
