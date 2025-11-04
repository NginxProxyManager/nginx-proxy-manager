import { exec as nodeExec, execFile as nodeExecFile } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import _ from "lodash";
import { debug, global as logger } from "../logger.js";
import errs from "./error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const exec = async (cmd, options = {}) => {
	debug(logger, "CMD:", cmd);
	const { stdout, stderr } = await new Promise((resolve, reject) => {
		const child = nodeExec(cmd, options, (isError, stdout, stderr) => {
			if (isError) {
				reject(new errs.CommandError(stderr, isError));
			} else {
				resolve({ stdout, stderr });
			}
		});

		child.on("error", (e) => {
			reject(new errs.CommandError(stderr, 1, e));
		});
	});
	return stdout;
};

/**
 * @param   {String} cmd
 * @param   {Array}  args
 * @param   {Object|undefined}  options
 * @returns {Promise}
 */
const execFile = (cmd, args, options) => {
	debug(logger, `CMD: ${cmd} ${args ? args.join(" ") : ""}`);
	const opts = options || {};

	return new Promise((resolve, reject) => {
		nodeExecFile(cmd, args, opts, (err, stdout, stderr) => {
			if (err && typeof err === "object") {
				reject(new errs.CommandError(stderr, 1, err));
			} else {
				resolve(stdout.trim());
			}
		});
	});
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRow = (omissions) => {
	/**
	 * @param   {Object} row
	 * @returns {Object}
	 */
	return (row) => {
		return _.omit(row, omissions);
	};
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRows = (omissions) => {
	/**
	 * @param   {Array} rows
	 * @returns {Object}
	 */
	return (rows) => {
		rows.forEach((row, idx) => {
			rows[idx] = _.omit(row, omissions);
		});
		return rows;
	};
};

/**
 * @returns {Object} Liquid render engine
 */
const getRenderEngine = () => {
	const renderEngine = new Liquid({
		root: `${__dirname}/../templates/`,
	});

	/**
	 * nginxAccessRule expects the object given to have 2 properties:
	 *
	 * directive  string
	 * address    string
	 */
	renderEngine.registerFilter("nginxAccessRule", (v) => {
		if (typeof v.directive !== "undefined" && typeof v.address !== "undefined" && v.directive && v.address) {
			return `${v.directive} ${v.address};`;
		}
		return "";
	});

	return renderEngine;
};

export default { exec, execFile, omitRow, omitRows, getRenderEngine };
