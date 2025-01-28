const _                     = require('lodash');
const fs                    = require('fs');
const batchflow             = require('batchflow');
const logger                = require('../logger').access;
const error                 = require('../lib/error');
const utils                 = require('../lib/utils');
const accessListModel       = require('../models/access_list');
const accessListAuthModel   = require('../models/access_list_auth');
const accessListClientModel = require('../models/access_list_client');
const proxyHostModel        = require('../models/proxy_host');
const internalAuditLog      = require('./audit-log');
const internalNginx         = require('./nginx');

function omissions () {
	return ['is_deleted'];
}

const internalAccessList = {

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		return access.can('access_lists:create', data)
			.then((/*access_data*/) => {
				return accessListModel
					.query()
					.insertAndFetch({
						name:          data.name,
						satisfy_any:   data.satisfy_any,
						pass_auth:     data.pass_auth,
						owner_user_id: access.token.getUserId(1)
					})
					.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				data.id = row.id;

				let promises = [];

				// Now add the items
				data.items.map((item) => {
					promises.push(accessListAuthModel
						.query()
						.insert({
							access_list_id: row.id,
							username:       item.username,
							password:       item.password
						})
					);
				});

				// Now add the clients
				if (typeof data.clients !== 'undefined' && data.clients) {
					data.clients.map((client) => {
						promises.push(accessListClientModel
							.query()
							.insert({
								access_list_id: row.id,
								address:        client.address,
								directive:      client.directive
							})
						);
					});
				}

				return Promise.all(promises);
			})
			.then(() => {
				// re-fetch with expansions
				return internalAccessList.get(access, {
					id:     data.id,
					expand: ['owner', 'items', 'clients', 'proxy_hosts.access_list.[clients,items]']
				}, true /* <- skip masking */);
			})
			.then((row) => {
				// Audit log
				data.meta = _.assign({}, data.meta || {}, row.meta);

				return internalAccessList.build(row)
					.then(() => {
						if (parseInt(row.proxy_host_count, 10)) {
							return internalNginx.bulkGenerateConfigs('proxy_host', row.proxy_hosts);
						}
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action:      'created',
							object_type: 'access-list',
							object_id:   row.id,
							meta:        internalAccessList.maskItems(data)
						});
					})
					.then(() => {
						return internalAccessList.maskItems(row);
					});
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Integer} data.id
	 * @param  {String}  [data.name]
	 * @param  {String}  [data.items]
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access.can('access_lists:update', data.id)
			.then((/*access_data*/) => {
				return internalAccessList.get(access, {id: data.id});
			})
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('Access List could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
				}
			})
			.then(() => {
				// patch name if specified
				if (typeof data.name !== 'undefined' && data.name) {
					return accessListModel
						.query()
						.where({id: data.id})
						.patch({
							name:        data.name,
							satisfy_any: data.satisfy_any,
							pass_auth:   data.pass_auth,
						});
				}
			})
			.then(() => {
				// Check for items and add/update/remove them
				if (typeof data.items !== 'undefined' && data.items) {
					let promises      = [];
					let items_to_keep = [];

					data.items.map(function (item) {
						if (item.password) {
							promises.push(accessListAuthModel
								.query()
								.insert({
									access_list_id: data.id,
									username:       item.username,
									password:       item.password
								})
							);
						} else {
							// This was supplied with an empty password, which means keep it but don't change the password
							items_to_keep.push(item.username);
						}
					});

					let query = accessListAuthModel
						.query()
						.delete()
						.where('access_list_id', data.id);

					if (items_to_keep.length) {
						query.andWhere('username', 'NOT IN', items_to_keep);
					}

					return query
						.then(() => {
							// Add new items
							if (promises.length) {
								return Promise.all(promises);
							}
						});
				}
			})
			.then(() => {
				// Check for clients and add/update/remove them
				if (typeof data.clients !== 'undefined' && data.clients) {
					let promises = [];

					data.clients.map(function (client) {
						if (client.address) {
							promises.push(accessListClientModel
								.query()
								.insert({
									access_list_id: data.id,
									address:        client.address,
									directive:      client.directive
								})
							);
						}
					});

					let query = accessListClientModel
						.query()
						.delete()
						.where('access_list_id', data.id);

					return query
						.then(() => {
							// Add new items
							if (promises.length) {
								return Promise.all(promises);
							}
						});
				}
			})
			.then(() => {
				// Add to audit log
				return internalAuditLog.add(access, {
					action:      'updated',
					object_type: 'access-list',
					object_id:   data.id,
					meta:        internalAccessList.maskItems(data)
				});
			})
			.then(() => {
				// re-fetch with expansions
				return internalAccessList.get(access, {
					id:     data.id,
					expand: ['owner', 'items', 'clients', 'proxy_hosts.[certificate,access_list.[clients,items]]']
				}, true /* <- skip masking */);
			})
			.then((row) => {
				return internalAccessList.build(row)
					.then(() => {
						if (parseInt(row.proxy_host_count, 10)) {
							return internalNginx.bulkGenerateConfigs('proxy_host', row.proxy_hosts);
						}
					}).then(internalNginx.reload)
					.then(() => {
						return internalAccessList.maskItems(row);
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Integer}  data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @param  {Boolean}  [skip_masking]
	 * @return {Promise}
	 */
	get: (access, data, skip_masking) => {
		if (typeof data === 'undefined') {
			data = {};
		}

		return access.can('access_lists:get', data.id)
			.then((access_data) => {
				let query = accessListModel
					.query()
					.select('access_list.*', accessListModel.raw('COUNT(proxy_host.id) as proxy_host_count'))
					.leftJoin('proxy_host', function() {
						this.on('proxy_host.access_list_id', '=', 'access_list.id')
							.andOn('proxy_host.is_deleted', '=', 0);
					})
					.where('access_list.is_deleted', 0)
					.andWhere('access_list.id', data.id)
					.groupBy('access_list.id')
					.allowGraph('[owner,items,clients,proxy_hosts.[certificate,access_list.[clients,items]]]')
					.first();

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('access_list.owner_user_id', access.token.getUserId(1));
				}

				if (typeof data.expand !== 'undefined' && data.expand !== null) {
					query.withGraphFetched('[' + data.expand.join(', ') + ']');
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				}
				if (!skip_masking && typeof row.items !== 'undefined' && row.items) {
					row = internalAccessList.maskItems(row);
				}
				// Custom omissions
				if (typeof data.omit !== 'undefined' && data.omit !== null) {
					row = _.omit(row, data.omit);
				}
				return row;
			});
	},

	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @param   {Integer} data.id
	 * @param   {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access.can('access_lists:delete', data.id)
			.then(() => {
				return internalAccessList.get(access, {id: data.id, expand: ['proxy_hosts', 'items', 'clients']});
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				}

				// 1. update row to be deleted
				// 2. update any proxy hosts that were using it (ignoring permissions)
				// 3. reconfigure those hosts
				// 4. audit log

				// 1. update row to be deleted
				return accessListModel
					.query()
					.where('id', row.id)
					.patch({
						is_deleted: 1
					})
					.then(() => {
						// 2. update any proxy hosts that were using it (ignoring permissions)
						if (row.proxy_hosts) {
							return proxyHostModel
								.query()
								.where('access_list_id', '=', row.id)
								.patch({access_list_id: 0})
								.then(() => {
									// 3. reconfigure those hosts, then reload nginx

									// set the access_list_id to zero for these items
									row.proxy_hosts.map(function (val, idx) {
										row.proxy_hosts[idx].access_list_id = 0;
									});

									return internalNginx.bulkGenerateConfigs('proxy_host', row.proxy_hosts);
								})
								.then(() => {
									return internalNginx.reload();
								});
						}
					})
					.then(() => {
						// delete the htpasswd file
						let htpasswd_file = internalAccessList.getFilename(row);

						try {
							fs.unlinkSync(htpasswd_file);
						} catch (err) {
							// do nothing
						}
					})
					.then(() => {
						// 4. audit log
						return internalAuditLog.add(access, {
							action:      'deleted',
							object_type: 'access-list',
							object_id:   row.id,
							meta:        _.omit(internalAccessList.maskItems(row), ['is_deleted', 'proxy_hosts'])
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All Lists
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access.can('access_lists:list')
			.then((access_data) => {
				let query = accessListModel
					.query()
					.select('access_list.*', accessListModel.raw('COUNT(proxy_host.id) as proxy_host_count'))
					.leftJoin('proxy_host', function() {
						this.on('proxy_host.access_list_id', '=', 'access_list.id')
							.andOn('proxy_host.is_deleted', '=', 0);
					})
					.where('access_list.is_deleted', 0)
					.groupBy('access_list.id')
					.allowGraph('[owner,items,clients]')
					.orderBy('access_list.name', 'ASC');

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('access_list.owner_user_id', access.token.getUserId(1));
				}

				// Query is used for searching
				if (typeof search_query === 'string') {
					query.where(function () {
						this.where('name', 'like', '%' + search_query + '%');
					});
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.withGraphFetched('[' + expand.join(', ') + ']');
				}

				return query.then(utils.omitRows(omissions()));
			})
			.then((rows) => {
				if (rows) {
					rows.map(function (row, idx) {
						if (typeof row.items !== 'undefined' && row.items) {
							rows[idx] = internalAccessList.maskItems(row);
						}
					});
				}

				return rows;
			});
	},

	/**
	 * Report use
	 *
	 * @param   {Integer} user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		let query = accessListModel
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
	},

	/**
	 * @param   {Object}  list
	 * @returns {Object}
	 */
	maskItems: (list) => {
		if (list && typeof list.items !== 'undefined') {
			list.items.map(function (val, idx) {
				let repeat_for = 8;
				let first_char = '*';

				if (typeof val.password !== 'undefined' && val.password) {
					repeat_for = val.password.length - 1;
					first_char = val.password.charAt(0);
				}

				list.items[idx].hint     = first_char + ('*').repeat(repeat_for);
				list.items[idx].password = '';
			});
		}

		return list;
	},

	/**
	 * @param   {Object}  list
	 * @param   {Integer} list.id
	 * @returns {String}
	 */
	getFilename: (list) => {
		return '/data/access/' + list.id;
	},

	/**
	 * @param   {Object}  list
	 * @param   {Integer} list.id
	 * @param   {String}  list.name
	 * @param   {Array}   list.items
	 * @returns {Promise}
	 */
	build: (list) => {
		logger.info('Building Access file #' + list.id + ' for: ' + list.name);

		return new Promise((resolve, reject) => {
			let htpasswd_file = internalAccessList.getFilename(list);

			// 1. remove any existing access file
			try {
				fs.unlinkSync(htpasswd_file);
			} catch (err) {
				// do nothing
			}

			// 2. create empty access file
			try {
				fs.writeFileSync(htpasswd_file, '', {encoding: 'utf8'});
				resolve(htpasswd_file);
			} catch (err) {
				reject(err);
			}
		})
			.then((htpasswd_file) => {
				// 3. generate password for each user
				if (list.items.length) {
					return new Promise((resolve, reject) => {
						batchflow(list.items).sequential()
							.each((i, item, next) => {
								if (typeof item.password !== 'undefined' && item.password.length) {
									logger.info('Adding: ' + item.username);

									utils.execFile('/usr/bin/htpasswd', ['-b', htpasswd_file, item.username, item.password])
										.then((/*result*/) => {
											next();
										})
										.catch((err) => {
											logger.error(err);
											next(err);
										});
								}
							})
							.error((err) => {
								logger.error(err);
								reject(err);
							})
							.end((results) => {
								logger.success('Built Access file #' + list.id + ' for: ' + list.name);
								resolve(results);
							});
					});
				}
			});
	}
};

module.exports = internalAccessList;
