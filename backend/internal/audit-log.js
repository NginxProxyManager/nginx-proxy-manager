const error         = require('../lib/error');
const auditLogModel = require('../models/audit-log');

const internalAuditLog = {

	/**
	 * All logs
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: (access, expand, search_query) => {
		return access.can('auditlog:list')
			.then(() => {
				let query = auditLogModel
					.query()
					.orderBy('created_on', 'DESC')
					.orderBy('id', 'DESC')
					.limit(100)
					.allowEager('[user]');

				// Query is used for searching
				if (typeof search_query === 'string') {
					query.where(function () {
						this.where('meta', 'like', '%' + search_query + '%');
					});
				}

				if (typeof expand !== 'undefined' && expand !== null) {
					query.eager('[' + expand.join(', ') + ']');
				}

				return query;
			});
	},

	/**
	 * This method should not be publicly used, it doesn't check certain things. It will be assumed
	 * that permission to add to audit log is already considered, however the access token is used for
	 * default user id determination.
	 *
	 * @param   {Access}   access
	 * @param   {Object}   data
	 * @param   {String}   data.action
	 * @param   {Number}   [data.user_id]
	 * @param   {Number}   [data.object_id]
	 * @param   {Number}   [data.object_type]
	 * @param   {Object}   [data.meta]
	 * @returns {Promise}
	 */
	add: (access, data) => {
		return new Promise((resolve, reject) => {
			// Default the user id
			if (typeof data.user_id === 'undefined' || !data.user_id) {
				data.user_id = access.token.getUserId(1);
			}

			if (typeof data.action === 'undefined' || !data.action) {
				reject(new error.InternalValidationError('Audit log entry must contain an Action'));
			} else {
				// Make sure at least 1 of the IDs are set and action
				resolve(auditLogModel
					.query()
					.insert({
						user_id:     data.user_id,
						action:      data.action,
						object_type: data.object_type || '',
						object_id:   data.object_id || 0,
						meta:        data.meta || {}
					}));
			}
		});
	}
};

module.exports = internalAuditLog;
