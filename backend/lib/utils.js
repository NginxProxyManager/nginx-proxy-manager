import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import crypto from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import _ from "lodash";
import { debug, global as logger } from "../logger.js";
import errs from "./error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nodeExecFilePromises = promisify(nodeExecFile);

const writeHash = async () => {
	const referencedEnvVars = new Set();
	const templateFiles = await readdir(`${__dirname}/../templates`);

	for (const fileName of templateFiles) {
		const content = await readFile(`${__dirname}/../templates/${fileName}`, "utf8");
		const matches = content.match(/env\.[A-Z0-9_]+/g) || [];

		for (const match of matches) {
			referencedEnvVars.add(match.replace("env.", ""));
		}
	}

	let hashInput = "";
	for (const varName of [...referencedEnvVars].sort()) {
		hashInput += process.env[varName] || "";
	}
	hashInput += process.env.TV;

	const hash = crypto.createHash("sha512").update(hashInput).digest("hex");
	await writeFile("/data/npmplus/env.sha512sum", hash);
};

/**
 * @param   {String} cmd
 * @param   {Array}  args
 * @returns {Promise}
 */
const execFile = async (cmd, args) => {
	debug(logger, `CMD: ${cmd} ${args ? args.join(" ") : ""}`);

	try {
		const { stdout, stderr } = await nodeExecFilePromises(cmd, args);
		return `${stdout || ""}${stderr || ""}`.trim();
	} catch (err) {
		if (err && typeof err === "object") {
			throw new errs.CommandError(`${err.stdout || ""}${err.stderr || ""}`.trim(), 1, err);
		}
		throw err;
	}
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

export default { writeHash, execFile, omitRow, omitRows, getRenderEngine };
