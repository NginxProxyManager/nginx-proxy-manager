const _                 = require('lodash');
const Ajv               = require('ajv/dist/2020');
const error             = require('../error');
const commonDefinitions = require('../../schema/common.json');

RegExp.prototype.toJSON = RegExp.prototype.toString;

const ajv = new Ajv({
	verbose:         true,
	allErrors:       true,
	allowUnionTypes: true,
	coerceTypes:     true,
	strict:          false,
	schemas:         [commonDefinitions]
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
				let valid    = validate(payload);

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
