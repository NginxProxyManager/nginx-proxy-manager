const _                = require('lodash');
const error            = require('../lib/error');
const streamModel      = require('../models/stream');
const internalNginx    = require('./nginx');
const internalAuditLog = require('./audit-log');

function omissions () {
	return ['is_deleted'];
}

const internalStream = {

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		return access.can('streams:create', data)
			.then((/*access_data*/) => {
				// TODO: At this point the existing ports should have been checked
				data.owner_user_id = access.token.getUserId(1);

				if (typeof data.meta === 'undefined') {
					data.meta = {};
				}

				return streamModel
					.query()
					.omit(omissions())
					.insertAndFetch(data);
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(streamModel, 'stream', row)
					.then(() => {
						return internalStream.get(access, {id: row.id, expand: ['owner']});
					});
			})
			.then((row) => {
				// Add to audit log
				return internalAuditLog.add(access, {
					action:      'created',
					object_type: 'stream',
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
		return access.can('streams:update', data.id)
			.then((/*access_data*/) => {
				// TODO: at this point the existing streams should have been checked
				return internalStream.get(access, {id: data.id});
			})
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('Stream could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
				}

				return streamModel
					.query()
					.omit(omissions())
					.patchAndFetchById(row.id, data)
					.then((saved_row) => {
						return internalNginx.configure(streamModel, 'stream', saved_row)
							.then(() => {
								return internalStream.get(access, {id: row.id, expand: ['owner']});
							});
					})
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'updated',
							object_type: 'stream',
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

		return access.can('streams:get', data.id)
			.then((access_data) => {
				let query = streamModel
					.query()
					.where('is_deleted', 0)
					.andWhere('id', data.id)
					.allowEager('[owner]')
					.first();

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

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
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access.can('streams:delete', data.id)
			.then(() => {
				return internalStream.get(access, {id: data.id});
			})
			.then((row) => {
				if (!row) {
					throw new error.ItemNotFoundError(data.id);
				}

				return streamModel
					.query()
					.where('id', row.id)
					.patch({
						is_deleted: 1
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig('stream', row)
							.then(() => {
								return internalNginx.reload();
							});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'deleted',
							object_type: 'stream',
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
		return access.can('streams:update', data.id)
			.then(() => {
				return internalStream.get(access, {
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

				return streamModel
					.query()
					.where('id', row.id)
					.patch({
						enabled: 1
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(streamModel, 'stream', row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'enabled',
							object_type: 'stream',
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
		return access.can('streams:update', data.id)
			.then(() => {
				return internalStream.get(access, {id: data.id});
			})
			.then((row) => {
				if (!row) {
					throw new error.ItemNotFoundError(data.id);
				} else if (!row.enabled) {
					throw new error.ValidationError('Host is already disabled');
				}

				row.enabled = 0;

				return streamModel
					.query()
					.where('id', row.id)
					.patch({
						enabled: 0
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig('stream', row)
							.then(() => {
								return internalNginx.reload();
							});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'disabled',
							object_type: 'stream-host',
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
	 * All Streams
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access.can('streams:list')
			.then((access_data) => {
				let query = streamModel
					.query()
					.where('is_deleted', 0)
					.groupBy('id')
					.omit(['is_deleted'])
					.allowEager('[owner]')
					.orderBy('incoming_port', 'ASC');

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				// Query is used for searching
				if (typeof search_query === 'string') {
					query.where(function () {
						this.where('incoming_port', 'like', '%' + search_query + '%');
					});
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.eager('[' + expand.join(', ') + ']');
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
		let query = streamModel
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

module.exports = internalStream;
