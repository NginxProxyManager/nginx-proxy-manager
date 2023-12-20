const fs            = require('fs');
const error         = require('../lib/error');
const path          = require('path');

const constants = require('../lib/constants');

const internalOpenappsecSetting = {
	configFilePath: path.join(constants.APPSEC_EXT_DIR, constants.APPSEC_CONFIG_FILE_NAME),

	/**
	 * @param  {Access}   access
	 * @return {Promise}
	 */
	getLocalPolicy: (access) => {
		return access.can('settings:list')
			.then(() => {
				try {
					const filePath = internalOpenappsecSetting.configFilePath
					if (!fs.existsSync(filePath)) {
						return;
					}
					const fileContent = fs.readFileSync(filePath, 'utf8');
					const jsonStr = JSON.stringify(fileContent);
					return jsonStr;

				} catch (err) {
					console.error(err);
				}
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @return {Promise}
	 */
	updateLocalPolicy: (access, data) => {
		return access.can('settings:list')
			.then(() => {
				const filePath = internalOpenappsecSetting.configFilePath
				const yamlStr = data.local_policy;
				fs.writeFileSync(filePath, yamlStr, {encoding: 'utf8'});
				return true;
			})
			.catch((err) => {
				console.error(err);
				throw new error.ConfigurationError(err.message);
			});
	}
};

module.exports = internalOpenappsecSetting;
