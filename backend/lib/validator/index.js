const _ = require('lodash');
const error = require('../error');
const definitions = require('../../schema/definitions.json');

RegExp.prototype.toJSON = RegExp.prototype.toString;

const ajv = require('ajv')({
	verbose: true,
	allErrors: true,
	format: 'full', // strict regexes for format checks
	coerceTypes: true,
	schemas: [definitions],
});

/**
 *
 * @param   {Object} schema
 * @param   {Object} payload
 * @returns {Promise}
 */
function validator(schema, payload) {
	return new Promise(function (resolve, reject) {
		if (!payload) {
			reject(new error.InternalValidationError('Payload is falsy'));
		} else {
			try {
				const validate = ajv.compile(schema);

				const valid = validate(payload);
				if (valid && !validate.errors) {
					resolve(_.cloneDeep(payload));
				} else {
					const message = ajv.errorsText(validate.errors);
					reject(new error.InternalValidationError(message));
				}
			} catch (err) {
				reject(err);
			}
		}
	});
}

module.exports = validator;
