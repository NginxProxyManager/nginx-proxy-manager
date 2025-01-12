const _ = require('lodash');
const error = require('../lib/error');
const utils = require('../lib/utils');
const proxyHostModel = require('../models/proxy_host');
const internalHost = require('./host');
const internalNginx = require('./nginx');
const internalAuditLog = require('./audit-log');
const internalCertificate = require('./certificate');
const { castJsonIfNeed } = require('../lib/helpers');

function omissions() {
	return ['is_deleted', 'owner.is_deleted'];
}

const internalProxyHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		const create_certificate = data.certificate_id === 'new';

		if (create_certificate) {
			delete data.certificate_id;
		}

		return access
			.can('proxy_hosts:create', data)
			.then(() => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				data.domain_names.map(function (domain_name) {
					domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
				});

				return Promise.all(domain_name_check_promises).then((check_results) => {
					check_results.map(function (result) {
						if (result.is_taken) {
							throw new error.ValidationError(result.hostname + ' is already in use');
						}
					});
				});
			})
			.then(() => {
				// At this point the domains should have been checked
				data.owner_user_id = access.token.getUserId(1);
				data = internalHost.cleanSslHstsData(data);

				// Fix for db field not having a default value
				// for this optional field.
				if (typeof data.advanced_config === 'undefined') {
					data.advanced_config = '';
				}

				return proxyHostModel.query().insertAndFetch(data).then(utils.omitRow(omissions()));
			})
			.then((row) => {
				if (create_certificate) {
					return internalCertificate
						.createQuickCertificate(access, data)
						.then((cert) => {
							// update host with cert id
							return internalProxyHost.update(access, {
								id: row.id,
								certificate_id: cert.id,
							});
						})
						.then(() => {
							return row;
						});
				} else {
					return row;
				}
			})
			.then((row) => {
				// re-fetch with cert
				return internalProxyHost.get(access, {
					id: row.id,
					expand: ['certificate', 'owner', 'access_list.[clients,items]'],
				});
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(proxyHostModel, 'proxy_host', row).then(() => {
					return row;
				});
			})
			.then((row) => {
				// Audit log
				data.meta = _.assign({}, data.meta || {}, row.meta);

				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: 'created',
						object_type: 'proxy-host',
						object_id: row.id,
						meta: data,
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
		const create_certificate = data.certificate_id === 'new';

		if (create_certificate) {
			delete data.certificate_id;
		}

		return access
			.can('proxy_hosts:update', data.id)
			.then((/* access_data */) => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				if (typeof data.domain_names !== 'undefined') {
					data.domain_names.map(function (domain_name) {
						domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name, 'proxy', data.id));
					});

					return Promise.all(domain_name_check_promises).then((check_results) => {
						check_results.map(function (result) {
							if (result.is_taken) {
								throw new error.ValidationError(result.hostname + ' is already in use');
							}
						});
					});
				}
			})
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('Proxy Host could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
				}

				if (create_certificate) {
					return internalCertificate
						.createQuickCertificate(access, {
							domain_names: data.domain_names || row.domain_names,
							meta: _.assign({}, row.meta, data.meta),
						})
						.then((cert) => {
							// update host with cert id
							data.certificate_id = cert.id;
						})
						.then(() => {
							return row;
						});
				} else {
					return row;
				}
			})
			.then((row) => {
				// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
				data = _.assign(
					{},
					{
						domain_names: row.domain_names,
					},
					data,
				);

				data = internalHost.cleanSslHstsData(data, row);

				return proxyHostModel
					.query()
					.where({ id: data.id })
					.patch(data)
					.then(utils.omitRow(omissions()))
					.then((saved_row) => {
						// Add to audit log
						return internalAuditLog
							.add(access, {
								action: 'updated',
								object_type: 'proxy-host',
								object_id: row.id,
								meta: data,
							})
							.then(() => {
								return saved_row;
							});
					});
			})
			.then(() => {
				return internalProxyHost
					.get(access, {
						id: data.id,
						expand: ['owner', 'certificate', 'access_list.[clients,items]'],
					})
					.then((row) => {
						if (!row.enabled) {
							// No need to add nginx config if host is disabled
							return row;
						}
						// Configure nginx
						return internalNginx.configure(proxyHostModel, 'proxy_host', row).then((new_meta) => {
							row.meta = new_meta;
							row = internalHost.cleanRowCertificateMeta(row);
							return _.omit(row, omissions());
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

		return access
			.can('proxy_hosts:get', data.id)
			.then((access_data) => {
				const query = proxyHostModel.query().where('is_deleted', 0).andWhere('id', data.id).allowGraph('[owner,access_list.[clients,items],certificate]').first();

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
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
				row = internalHost.cleanRowCertificateMeta(row);
				// Custom omissions
				if (typeof data.omit !== 'undefined' && data.omit !== null) {
					row = _.omit(row, data.omit);
				}
				return row;
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
		return access
			.can('proxy_hosts:delete', data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				}

				return proxyHostModel
					.query()
					.where('id', row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig('proxy_host', row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: 'deleted',
							object_type: 'proxy-host',
							object_id: row.id,
							meta: _.omit(row, omissions()),
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
		return access
			.can('proxy_hosts:update', data.id)
			.then(() => {
				return internalProxyHost.get(access, {
					id: data.id,
					expand: ['certificate', 'owner', 'access_list.[clients,items]'],
				});
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				} else if (row.enabled) {
					throw new error.ValidationError('Host is already enabled');
				}

				row.enabled = 1;

				return proxyHostModel
					.query()
					.where('id', row.id)
					.patch({
						enabled: 1,
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(proxyHostModel, 'proxy_host', row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: 'enabled',
							object_type: 'proxy-host',
							object_id: row.id,
							meta: _.omit(row, omissions()),
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
		return access
			.can('proxy_hosts:update', data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new error.ItemNotFoundError(data.id);
				} else if (!row.enabled) {
					throw new error.ValidationError('Host is already disabled');
				}

				row.enabled = 0;

				return proxyHostModel
					.query()
					.where('id', row.id)
					.patch({
						enabled: 0,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig('proxy_host', row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: 'disabled',
							object_type: 'proxy-host',
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access
			.can('proxy_hosts:list')
			.then((access_data) => {
				let query = proxyHostModel.query().where('is_deleted', 0).groupBy('id').allowGraph('[owner,access_list.[clients,items],certificate]').orderBy(castJsonIfNeed('domain_names'), 'ASC');

				if (access_data.permission_visibility !== 'all') {
					query.andWhere('owner_user_id', access.token.getUserId(1));
				}

				// Query is used for searching
				if (typeof search_query === 'string' && search_query.length > 0) {
					query.where(function () {
						this.where(castJsonIfNeed('domain_names'), 'like', `%${search_query}%`);
					});
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.withGraphFetched('[' + expand.join(', ') + ']');
				}

				return query.then(utils.omitRows(omissions()));
			})
			.then((rows) => {
				if (typeof expand !== 'undefined' && expand !== null && expand.indexOf('certificate') !== -1) {
					return internalHost.cleanAllRowsCertificateMeta(rows);
				}

				return rows;
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
		const query = proxyHostModel.query().count('id as count').where('is_deleted', 0);

		if (visibility !== 'all') {
			query.andWhere('owner_user_id', user_id);
		}

		return query.first().then((row) => {
			return parseInt(row.count, 10);
		});
	},
};

module.exports = internalProxyHost;
