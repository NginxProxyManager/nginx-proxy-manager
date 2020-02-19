const _           = require('lodash');
const error       = require('../error');
const definitions = require('../../schema/definitions.json');

RegExp.prototype.toJSON = RegExp.prototype.toString;

const ajv = require('ajv')({
	verbose:     true, //process.env.NODE_ENV === 'development',
	allErrors:   true,
	format:      'full',  // strict regexes for format checks
	coerceTypes: true,
	schemas:     [
		definitions
	]
});

/**
 *
 * @param   {Object} schema
 * @param   {Object} payload
 * @returns {Promise}
 */
function validator (schema, payload) {
	return new Promise(function (resolve, reject) {
		if (!payload) {
			reject(new error.InternalValidationError('Payload is falsy'));
		} else {
			try {
				let validate = ajv.compile(schema);

				let valid = validate(payload);
				if (valid && !validate.errors) {
					resolve(_.cloneDeep(payload));
				} else {
					let message = ajv.errorsText(validate.errors);
					reject(new error.InternalValidationError(message));
				}

			} catch (err) {
				reject(err);
			}

		}

	});

}

module.exports = validator;
