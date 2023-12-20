const fs = require('fs');
const path = require('path');
const util = require('util');
const error = require('../lib/error');
const { APPSEC_LOG_DIR } = require('../lib/constants');

const internalOpenappsecLog = {

	countTotalLines: async function (directoryPath) {
		const files = await fs.promises.readdir(directoryPath);
		const logFiles = files.filter(file => path.extname(file).startsWith('.log'));

		let totalLineCount = 0;

		for (const file of logFiles) {
			const filePath = path.join(directoryPath, file);

			// Read only the first line of the file
			const readStream = fs.createReadStream(filePath);
			const rl = readline.createInterface({ input: readStream });
			const firstLine = await new Promise(resolve => {
				rl.on('line', line => {
					rl.close();
					resolve(line);
				});
			});

			// Check if the first line is a non-data line
			try {
				JSON.parse(firstLine);
			} catch (err) {
				continue; // Skip this file if the first line is a non-data line
			}

			// If the first line is a data line, read the rest of the file
			const content = await fs.promises.readFile(filePath, 'utf8');
			const lines = content.split('\n');
			totalLineCount += lines.length;
		}

		return totalLineCount;
	},

	processFile: async function (filePath) {
		const content = await fs.promises.readFile(filePath, 'utf8');
		const lines = content.split('\n');
		const dataLines = [];

		for (const line of lines) {
			try {
				const json = JSON.parse(line);
				const groupName = path.basename(filePath, path.extname(filePath));
				const wrappedObject = {
					source: groupName,
					meta: json,
					serviceName: json.eventSource.serviceName,
					eventPriority: json.eventPriority,
					eventSeverity: json.eventSeverity,
					eventLevel: json.eventLevel,
					eventTime: json.eventTime,
					assetName: json.eventSource.assetName,
					securityAction: json.eventData.securityAction,
					waapIncidentType: json.eventData.waapIncidentType,
					httpSourceId: json.eventData.httpSourceId,
					sourceIP: json.eventData.sourceIP,
					proxyIP: json.eventData.proxyIP,
					httpHostName: json.eventData.httpHostName,
					httpMethod: json.eventData.httpMethod,
					httpUriPath: json.eventData.httpUriPath,
					eventTopic: json.eventSource.eventTopic,
					matchedLocation: json.eventData.matchedLocation,
					matchedParameter: json.eventData.matchedParameter,
					matchedSample: json.eventData.matchedSample,
					eventName: json.eventName
				};
				dataLines.push(wrappedObject);
			} catch (err) {
				// Ignore lines that don't contain JSON data
			}
		}

		return dataLines;
	},


	getAll: function (access, expand, search_query) {
		return access.can('auditlog:list')
			.then(async () => {
				const directoryPath = APPSEC_LOG_DIR;
				const files = await fs.promises.readdir(directoryPath);
				const logFiles = files.filter(file => path.extname(file).startsWith('.log'));

				// Sort the logFiles array
				logFiles.sort((a, b) => {
					const baseA = path.basename(a, path.extname(a));
					const baseB = path.basename(b, path.extname(b));
					return baseA.localeCompare(baseB, undefined, { numeric: true, sensitivity: 'base' });
				});

				const wrappedObjects = [];
				for (const file of logFiles) {
					const filePath = path.join(directoryPath, file);
					const dataLines = await this.processFile(filePath);
					wrappedObjects.push(...dataLines);
				}

				return wrappedObjects;
			});
	},

	getPage: function (access, expand, search_query, page, perPage) {
		return access.can('auditlog:list')
			.then(async () => {
				const directoryPath = APPSEC_LOG_DIR;
				let totalDataLines = await this.countTotalLines(directoryPath);

				const files = await fs.promises.readdir(directoryPath);
				const logFiles = files.filter(file => path.extname(file).startsWith('.log'));

				// Sort the logFiles array
				logFiles.sort((a, b) => {
					const baseA = path.basename(a, path.extname(a));
					const baseB = path.basename(b, path.extname(b));
					return baseA.localeCompare(baseB, undefined, { numeric: true, sensitivity: 'base' });
				});

				const wrappedObjects = [];
				let lineCount = 0;
				let start = (page - 1) * perPage;
				let end = page * perPage;

				for (const file of logFiles) {
					if (lineCount >= end) {
						break;
					}

					const filePath = path.join(directoryPath, file);
					const dataLines = await this.processFile(filePath);
					const pageDataLines = dataLines.slice(start - lineCount, end - lineCount);
					wrappedObjects.push(...pageDataLines);
					lineCount += pageDataLines.length;
				}

				return {
					data: wrappedObjects,
					totalDataLines: totalDataLines,
				};
			});
	},
};

module.exports = internalOpenappsecLog;
