import moment from "moment";
import { ref } from "objection";
import { isPostgres } from "./config.js";

/**
 * Takes an expression such as 30d and returns a moment object of that date in future
 *
 * Key      Shorthand
 * ==================
 * years         y
 * quarters      Q
 * months        M
 * weeks         w
 * days          d
 * hours         h
 * minutes       m
 * seconds       s
 * milliseconds  ms
 *
 * @param {String}  expression
 * @returns {Object}
 */
const parseDatePeriod = (expression) => {
	const matches = expression.match(/^([0-9]+)(y|Q|M|w|d|h|m|s|ms)$/m);
	if (matches) {
		return moment().add(matches[1], matches[2]);
	}

	return null;
};

const convertIntFieldsToBool = (obj, fields) => {
	fields.forEach((field) => {
		if (typeof obj[field] !== "undefined") {
			obj[field] = obj[field] === 1;
		}
	});
	return obj;
};

const convertBoolFieldsToInt = (obj, fields) => {
	fields.forEach((field) => {
		if (typeof obj[field] !== "undefined") {
			obj[field] = obj[field] ? 1 : 0;
		}
	});
	return obj;
};

/**
 * Casts a column to json if using postgres
 *
 * @param {string} colName
 * @returns {string|Objection.ReferenceBuilder}
 */
const castJsonIfNeed = (colName) => (isPostgres() ? ref(colName).castText() : colName);

/**
 * Normalizes a domain_names array before it is persisted: drops null/undefined
 * entries, trims surrounding whitespace, removes any entry that is left empty,
 * and sorts. A leading or trailing space in a hostname produces an invalid
 * nginx server_name/upstream, so it must be stripped before the config is built.
 *
 * @param   {Array}  domainNames
 * @returns {Array}
 */
const cleanDomainNames = (domainNames) => {
	if (typeof domainNames === "undefined") {
		return [];
	}
	return domainNames
		.filter((name) => name != null)
		.map((name) => name.trim())
		.filter((name) => name.length > 0)
		.sort();
};

export { parseDatePeriod, convertIntFieldsToBool, convertBoolFieldsToInt, castJsonIfNeed, cleanDomainNames };
