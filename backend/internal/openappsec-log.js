const fs = require('fs');
const path = require('path');
const util = require('util');
const error = require('../lib/error');
const { APPSEC_LOG_DIR } = require('../lib/constants');

const internalOpenappsecLog = {

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

				const directoryPath = APPSEC_LOG_DIR;
			
				const readdir = util.promisify(fs.readdir);
				const readFile = util.promisify(fs.readFile);

				async function listLogFiles(dir) {
					const files = await readdir(dir);
					const logFiles = files.filter(file => path.extname(file).startsWith('.log'));

					const sortedLogFiles = logFiles.sort((a, b) => {
						const baseA = path.basename(a, path.extname(a));
						const baseB = path.basename(b, path.extname(b));

						if (baseA < baseB) return -1;
						if (baseA > baseB) return 1;

						return path.extname(a).localeCompare(path.extname(b));
					});

					const groupedFiles = sortedLogFiles.reduce((groups, file) => {
						const fileName = path.basename(file, path.extname(file));
						if (!groups[fileName]) {
							groups[fileName] = [];
						}
						groups[fileName].push(file);
						return groups;
					}, {});

					const wrappedObjects = [];

					for (const [groupName, files] of Object.entries(groupedFiles)) {
						for (const file of files) {
							try {
								const content = await readFile(path.join(dir, file), 'utf8');
								const lines = content.split('\n');
								for (const line of lines) {
									try {
										const json = JSON.parse(line);
										const wrappedObject = {
											source: groupName,
											meta: json,
											serviceName: json.eventSource.serviceName,
											eventPriority: json.eventPriority,
											eventSeverity: json.eventSeverity,
											eventLevel: json.eventLevel,
											eventTime: json.eventTime,
              								eventName: json.eventName
										};
										wrappedObjects.push(wrappedObject);
									} catch (err) {
										// Ignore lines that don't contain JSON data
									}
								}
							} catch (err) {
								console.error(`Failed to read file ${file}: ${err.message}`);
							}
						}
					}
					wrappedObjects.sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));
					return wrappedObjects;
				}

				let groupedFiles = listLogFiles(directoryPath).catch(console.error);
				return groupedFiles;
			});
	}
};

module.exports = internalOpenappsecLog;
