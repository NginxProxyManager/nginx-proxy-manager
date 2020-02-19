const fs            = require('fs');
const error         = require('../lib/error');
const settingModel  = require('../models/setting');
const internalNginx = require('./nginx');

const internalSetting = {

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {String}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		return access.can('settings:update', data.id)
			.then((/*access_data*/) => {
				return internalSetting.get(access, {id: data.id});
			})
			.then((row) => {
				if (row.id !== data.id) {
					// Sanity check that something crazy hasn't happened
					throw new error.InternalValidationError('Setting could not be updated, IDs do not match: ' + row.id + ' !== ' + data.id);
				}

				return settingModel
					.query()
					.where({id: data.id})
					.patch(data);
			})
			.then(() => {
				return internalSetting.get(access, {
					id: data.id
				});
			})
			.then((row) => {
				if (row.id === 'default-site') {
					// write the html if we need to
					if (row.value === 'html') {
						fs.writeFileSync('/data/nginx/default_www/index.html', row.meta.html, {encoding: 'utf8'});
					}

					// Configure nginx
					return internalNginx.deleteConfig('default')
						.then(() => {
							return internalNginx.generateConfig('default', row);
						})
						.then(() => {
							return internalNginx.test();
						})
						.then(() => {
							return internalNginx.reload();
						})
						.then(() => {
							return row;
						})
						.catch((/*err*/) => {
							internalNginx.deleteConfig('default')
								.then(() => {
									return internalNginx.test();
								})
								.then(() => {
									return internalNginx.reload();
								})
								.then(() => {
									// I'm being slack here I know..
									throw new error.ValidationError('Could not reconfigure Nginx. Please check logs.');
								});
						});
				} else {
					return row;
				}
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {String}   data.id
	 * @return {Promise}
	 */
	get: (access, data) => {
		return access.can('settings:get', data.id)
			.then(() => {
				return settingModel
					.query()
					.where('id', data.id)
					.first();
			})
			.then((row) => {
				if (row) {
					return row;
				} else {
					throw new error.ItemNotFoundError(data.id);
				}
			});
	},

	/**
	 * This will only count the settings
	 *
	 * @param   {Access}  access
	 * @returns {*}
	 */
	getCount: (access) => {
		return access.can('settings:list')
			.then(() => {
				return settingModel
					.query()
					.count('id as count')
					.first();
			})
			.then((row) => {
				return parseInt(row.count, 10);
			});
	},

	/**
	 * All settings
	 *
	 * @param   {Access}  access
	 * @returns {Promise}
	 */
	getAll: (access) => {
		return access.can('settings:list')
			.then(() => {
				return settingModel
					.query()
					.orderBy('description', 'ASC');
			});
	}
};

module.exports = internalSetting;
