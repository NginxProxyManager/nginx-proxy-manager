const error            = require('../lib/error');
const utils            = require('../lib/utils');
const upstreamModel    = require('../models/upstream');
const internalNginx    = require('./nginx');
const internalAuditLog = require('./audit-log');
const proxyHostModel   = require('../models/proxy_host');

function omissions() {
	return ['is_deleted'];
}

const internalUpstream = {

	/**
		 * @param   {Access}  access
		 * @param   {Object}  data
		 * @returns {Promise}
		 */
	create: (access, data) => {
		return access.can('upstreams:create', data)
			.then(() => {
				data.owner_user_id = access.token.getUserId(1);
				return upstreamModel.query().insertAndFetch(data).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				// Audit log
				return internalAuditLog.add(access, {
					action:      'created',
					object_type: 'upstream',
					object_id:   row.id,
					meta:        data
				}).then(() => row);
			});
	},

	/**
		 * @param  {Access}  access
		 * @param  {Object}  data
		 * @return {Promise}
		 */
	update: (access, data) => {
		return access.can('upstreams:update', data.id)
			.then(() => {
				return internalUpstream.get(access, { id: data.id });
			})
			.then((row) => {
				if (row.id !== data.id) {
					throw new error.InternalValidationError('Upstream could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
				}

				return upstreamModel.query().patchAndFetchById(row.id, data).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				// Audit log
				return internalAuditLog.add(access, {
					action:      'updated',
					object_type: 'upstream',
					object_id:   row.id,
					meta:        data
				}).then(() => row);
			})
			.then((row) => {
				// Find all proxy hosts using this upstream and re-generate their configs
				return proxyHostModel.query()
					.where('upstream_id', row.id)
					.andWhere('is_deleted', 0)
					.withGraphFetched('[certificate,access_list,upstream]') // The fix is here: use withGraphFetched
					.then((hosts) => {
						if (hosts && hosts.length) {
							return internalNginx.bulkGenerateConfigs('proxy_host', hosts)
								.then(internalNginx.reload)
								.then(() => row);
						}
						return row;
					});
			});
	},

	/**
		 * @param  {Access}   access
		 * @param  {Object}   data
		 * @return {Promise}
		 */
	get: (access, data) => {
		if (typeof data === 'undefined') {
			data = {};
		}

		return access.can('upstreams:get', data.id)
			.then((access_data) => {
				let query = upstreamModel
					.query()
					.where('is_deleted', 0)
					.andWhere('id', data.id)
					.allowGraph('[owner]')
					.first();

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				if (typeof data.expand !== 'undefined' && data.expand !== null) {
					query.withGraphFetched(`[${data.expand.join(', ')}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				}
				return row;
			});
	},

	/**
		 * @param {Access}  access
		 * @param {Object}  data
		 * @returns {Promise}
		 */
	delete: (access, data) => {
		return access.can('upstreams:delete', data.id)
			.then(() => {
				return internalUpstream.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				}

				return upstreamModel.query()
					.where('id', row.id)
					.patch({ is_deleted: 1 });
			})
			.then(() => {
				return internalAuditLog.add(access, {
					action:      'deleted',
					object_type: 'upstream',
					object_id:   data.id
				});
			})
			.then(() => true);
	},

	/**
		 * @param   {Access}  access
		 * @returns {Promise}
		 */
	getAll: (access, expand, search_query) => {
		return access.can('upstreams:list')
			.then((access_data) => {
				let query = upstreamModel
					.query()
					.where('is_deleted', 0)
					.allowGraph('[owner]')
					.orderBy('name', 'ASC');

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				if (typeof search_query === 'string' && search_query) {
					query.where('name', 'like', `%${search_query}%`);
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.withGraphFetched(`[${expand.join(', ')}]`);
				}

				return query.then(utils.omitRows(omissions()));
			});
	}
};

module.exports = internalUpstream;
