const util = require('util');
const execPromise = util.promisify(require('child_process').exec);
const { exec } = require('child_process');
const _      = require('lodash');
const fs     = require('fs');
const logger = require('../logger').nginx;
const config = require('../lib/config');
const yaml   = require('js-yaml');
const path   = require('path');
const constants = require('../lib/constants');

const internalNginxOpenappsec = {

	// module constants
	CONFIG_TEMPLATE_FILE_NAME: 'local-policy-open-appsec-enabled-for-proxy-host.yaml',
	CONFIG_TEMPLATE_DIR: '/app/templates',

	// module variables
	config: null,
	configTemplate: null,

	/**
	 * Generate an open-appsec config file for a proxy host.
	 *
	 * @param   {Object} access
	 * @param   {Object} row
	 * @param   {Object} data
	 * @returns {Promise}
	 */
	generateConfig: (access, row, d) => {
		return access.can('settings:update', row.id)
			.then(() => {
				if (config.debug()) {
					logger.info('Generating openappsec config:', JSON.stringify(data, null, 2));
				}

	
			        const data = row ? { ...row, ...d } : d;
		                logger.debug('data', JSON.stringify(data));

				const openappsecMode = data.use_openappsec == false ? 'inactive' : data.openappsec_mode;

				const configTemplateFilePath = path.join(internalNginxOpenappsec.CONFIG_TEMPLATE_DIR, internalNginxOpenappsec.CONFIG_TEMPLATE_FILE_NAME)
				const configFilePath = path.join(constants.APPSEC_EXT_DIR, constants.APPSEC_CONFIG_FILE_NAME);

				let openappsecConfig = yaml.load(fs.readFileSync(configFilePath, 'utf8'));
				let openappsecConfigTemplate = yaml.load(fs.readFileSync(configTemplateFilePath, 'utf8'));

				internalNginxOpenappsec.config = openappsecConfig;
				internalNginxOpenappsec.configTemplate = openappsecConfigTemplate;

				const specificRuleName = 'npm-managed-specific-rule-proxyhost-' + row.id;
				const logTriggerName = 'npm-managed-log-trigger-proxyhost-' + row.id;
				const practiceName = 'npm-managed-practice-proxyhost-' + row.id;
				
				_.remove(openappsecConfig.policies['specific-rules'], rule => rule.name === specificRuleName || rule.name.startsWith(`${specificRuleName}.`));

				data.domain_names.forEach((domain, index) => {
					let ruleName = index > 0 ? `${specificRuleName}.${index}` : specificRuleName;
					let specificRuleNode = {
						host: domain,
						name: ruleName,
						triggers: [logTriggerName],
						mode: openappsecMode,
						practices: [practiceName]
					};
					internalNginxOpenappsec.updateNode('policies', 'specific-rules', specificRuleNode, openappsecMode);
				});

				internalNginxOpenappsec.updateNode('', 'practices', { name: practiceName, 'web-attacks.override-mode': openappsecMode, 'web-attacks.minimum-confidence': data.minimum_confidence }, openappsecMode);
				internalNginxOpenappsec.updateNode('', 'log-triggers', { name: logTriggerName }, openappsecMode);

				// remove all openappsec managed location config nodes for a proxy host.			
				let pattern = new RegExp(`^npm-managed.*-${row.id}-.*`);
				internalNginxOpenappsec.removeMatchingNodes(openappsecConfig, pattern);

				// for each data.location, create location config nodes
				data.locations.forEach((location, index) => {
					let locationSpecificRuleName = 'npm-managed-specific-rule-proxyhost-' + row.id + '-' + index;
					let locationLogTriggerName = 'npm-managed-log-trigger-proxyhost-' + row.id + '-' + index;
					let locationPracticeName = 'npm-managed-practice-proxyhost-' + row.id + '-' + index;

					let locationOpenappsecMode = location.use_openappsec == false ? 'inactive' : location.openappsec_mode;

					_.remove(openappsecConfig.policies['specific-rules'], rule => rule.name === locationSpecificRuleName || rule.name.startsWith(`${locationSpecificRuleName}.`));

					data.domain_names.forEach((domain, index) => {
						let locationUrl = domain + location.path;
						let ruleName = index > 0 ? `${locationSpecificRuleName}.${index}` : locationSpecificRuleName;

						let domainSpecificRuleNode = {
							host: locationUrl,
							name: ruleName,
							triggers: [locationLogTriggerName],
							mode: locationOpenappsecMode,
							practices: [locationPracticeName]
						};
						internalNginxOpenappsec.updateNode('policies', 'specific-rules', domainSpecificRuleNode, locationOpenappsecMode, 'location', openappsecMode);
					});

					internalNginxOpenappsec.updateNode('', 'practices', { name: locationPracticeName, 'web-attacks.override-mode': locationOpenappsecMode, 'web-attacks.minimum-confidence': location.minimum_confidence }, locationOpenappsecMode, 'location', openappsecMode);
					internalNginxOpenappsec.updateNode('', 'log-triggers', { name: locationLogTriggerName }, locationOpenappsecMode, 'location', openappsecMode);
				});

				fs.writeFileSync(configFilePath, yaml.dump(openappsecConfig));
			},
				(err) => {
					logger.error('Error generating openappsec config:', err);
					return Promise.reject(err);
				})
			.then(() => {
				// Return the notifyPolicyUpdate promise chain
				// notify openappsec to apply the policy
				return internalNginxOpenappsec.notifyPolicyUpdate().catch((errorMessage) => {
					// console.error('Error:', errorMessage);
					const errorMessageForUI = `Error: Policy couldn’t be applied, open-appsec-agent container is not responding.
									Check if open-appec-agent container is running, then apply open-appsec Configuration
									again by clicking here: 
									<br>Settings -> open-appsec Advanced -> Save Settings`;

					return Promise.reject(new Error(errorMessageForUI));
				});
			});
	},

	/** 
	 * Remove all openappsec managed config nodes for a proxy host.
	 *  
	 * @param {Object} access
	 * @param {Object} row
	 * @returns {Promise}
	 * 
	 */
	deleteConfig: (access, row) => {
		return access.can('settings:update', row.id)
			.then(() => {
				const configFilePath = path.join(constants.APPSEC_EXT_DIR, constants.APPSEC_CONFIG_FILE_NAME);
				let openappsecConfig = yaml.load(fs.readFileSync(configFilePath, 'utf8'));

				// remove all openappsec managed location config nodes for a proxy host.			
				let pattern = new RegExp(`^npm-managed.*-${row.id}`);
				internalNginxOpenappsec.removeMatchingNodes(openappsecConfig, pattern);
				fs.writeFileSync(configFilePath, yaml.dump(openappsecConfig));
			})
			.then(() => {
				// Return the notifyPolicyUpdate promise chain
				// notify openappsec to apply the policy
				return internalNginxOpenappsec.notifyPolicyUpdate().catch((errorMessage) => {
					console.error('---Error:', errorMessage);
					const errorMessageForUI = `Error: Policy couldn’t be applied, open-appsec-agent container is not responding.
									Check if open-appec-agent container is running, then apply open-appsec Configuration
									again by clicking here: 
									<br>Settings -> open-appsec Advanced -> Save Settings`;

					return Promise.reject(new Error(errorMessageForUI));
				});
			})
			.catch((err) => {
				logger.error('Error deleting openappsec config:', err);
				// throw err; // Propagate the error to the caller
			});
	},
	
	/**
	 * Update a node in the openappsec config.
	 * 		- if the node does not exist, create it.
	 * 		- if the node exists, update it.
	 * 		- if openappsecMode is 'inactive', delete the node.
	 * 
	 * @param {String} parentNodePath - path to the parent node. e.g. 'policies'.
	 * @param {String} nodeName - name of the node. e.g. 'specific-rules', 'practices', 'log-triggers'.
	 * @param {Object} nodeItemProperties
	 * @param {String} openappsecMode
	 * @param {String} nodeType - 'host' or 'location'
	 * @param {String} hostAppsecMode - to check if the host of a location is inactive.
	 */
	updateNode: function (parentNodePath, nodeName, nodeItemProperties, openappsecMode, nodeType = 'host', hostAppsecMode = '') {
		// if no parent node path is specified, use the root of the config object.
		const parent = parentNodePath ? _.get(this.config, parentNodePath, this.config) : this.config;

		if (!parent) {
			console.log('parent is not defined');
			return;
		}

		let nodeItems = _.find(parent[nodeName], { name: nodeItemProperties.name });
		if (openappsecMode == 'inactive' && nodeItems) {
			_.remove(parent[nodeName], { name: nodeItemProperties.name });
		}

		if (openappsecMode !== 'inactive' || nodeType === 'location' && hostAppsecMode !== 'inactive') {
			if (!nodeItems) {
				// create the node from the template if it does not exist.
				let templateSearchPath = parentNodePath ? `${parentNodePath}.${nodeName}[0]` : `${nodeName}[0]`;
				nodeItems = _.cloneDeep(_.get(this.configTemplate, templateSearchPath));

				// update the node with the nodeItemProperties. if the nodeType is 'location' and the openappsecMode is 'inactive', only update the name, host, and the (inactive) mode.
				if (nodeType === 'location' && openappsecMode === 'inactive') {
					nodeItemProperties = _.pick(nodeItemProperties, ['name', 'host', 'triggers', 'practices', 'mode', 'web-attacks.override-mode']);
				}

				Object.keys(nodeItemProperties).forEach(key => {
					_.set(nodeItems, key, nodeItemProperties[key]);
				});
				parent[nodeName] = parent[nodeName] || [];
				parent[nodeName].push(nodeItems);
			} else {
				// update the node if it exists.
				Object.keys(nodeItemProperties).forEach(key => {
					_.set(nodeItems, key, nodeItemProperties[key]);
				});
			}
		}
	},

	notifyPolicyUpdate: async function() {
		if (!constants.USE_NOTIFY_POLICY) {
			console.log('USE_NOTIFY_POLICY is false');
			return;
		}
		let ports = constants.PORTS;
		let lastError = null;
		for (let port of ports) {
			try {
				const data = `{"policy_path":"${constants.POLICY_PATH}"}`;
				const command = `curl -s -o /dev/null -w "%{http_code}" --data '${data}' ${constants.HOSTURL}:${port}/set-apply-policy`;
				let { stdout } = await execPromise(command);
				if (stdout === '200') {
					console.log(`Policy applied successfully on port ${port}`);
					return;
				} else {
					console.log(`Policy Unexpected response code: ${stdout}`);
					lastError = new Error(`Unexpected response code: ${stdout}`);
				}
			} catch (error) {
				console.log(`Error notifying openappsec to apply the policy on port ${port}: ${error.message}`);
				lastError = error;
			}
		}

		// if (lastError) {
		// 	throw lastError;
		// }
	},

	/**
	 * Recursively removes nodes from a JavaScript object based on a pattern.
	*
	* @param {Object|Array} obj - The object or array to remove nodes from.
	* @param {RegExp} pattern - The pattern to match against node names.
	*/
	removeMatchingNodes: function (obj, pattern) {
		_.forEach(obj, (value, key) => {
			if (_.isPlainObject(value)) {
				if (pattern.test(key)) {
					delete obj[key];
				} else {
					this.removeMatchingNodes(value, pattern);
				}
			} else if (_.isArray(value)) {
				_.remove(value, function (item) {
					return _.isPlainObject(item) && pattern.test(item.name);
				});
				value.forEach(item => {
					if (_.isPlainObject(item)) {
						this.removeMatchingNodes(item, pattern);
					}
				});
			}
		});
	},

	/**
	 * Get the openappsec mode, use_openappsec and minimum_confidence for a proxy host.
	 * 
	 * @param {Object} openappsecConfig - openappsec config object
	 * @param {Number} rowId - proxy host id
	 * @returns {Object} { mode, use_openappsec, minimum_confidence }
	 */
	getOpenappsecFields: (openappsecConfig, rowId) => {
		const specificRuleName = 'npm-managed-specific-rule-proxyhost-' + rowId;

		const specificRule = _.find(openappsecConfig?.policies['specific-rules'], { name: specificRuleName });
		const mode = specificRule?.mode || 'inactive';
		const use_openappsec = mode !== 'inactive' && mode !== undefined;

		const practiceName = 'npm-managed-practice-proxyhost-' + rowId;
		const practice = _.find(openappsecConfig?.practices, { name: practiceName });
		const minimum_confidence = practice?.['web-attacks']['minimum-confidence'] || 'high';

		return { mode, use_openappsec, minimum_confidence };
	},

	/**
	 * get the openappsec config file path.
	 */
	getConfigFilePath: () => {
		const configFilePath = path.join(constants.APPSEC_EXT_DIR, constants.APPSEC_CONFIG_FILE_NAME);
		return configFilePath;
	},

	/**
	 * A simple wrapper around unlinkSync that writes to the logger
	 *
	 * @param   {String}  filename
	 */
	deleteFile: (filename) => {
		logger.debug('Deleting file: ' + filename);
		try {
			fs.unlinkSync(filename);
		} catch (err) {
			logger.debug('Could not delete file:', JSON.stringify(err, null, 2));
		}
	}

};

module.exports = internalNginxOpenappsec;
