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

export { parseDatePeriod, convertIntFieldsToBool, convertBoolFieldsToInt, castJsonIfNeed };
